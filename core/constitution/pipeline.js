/* ============================================================================
   AUBS Constitutional Integration — the One Spine (Milestone 13)
   Truth · Safety · We Got Your Back

   ONE orchestrator that runs a complete user request through every subsystem, in order,
   each stage consuming the previous stage's output, writing EXACTLY ONE DecisionRecord:

     Intent → CAC Intent → Deterministic Plan (planner M12) → GEL Decision →
     Provider Eligibility (M6) → Kernel Execution (provider M5 / tool M10 / deterministic) →
     Memory Access (M9) → Tool Access (M10) → Grounding Verification (spine 3a/v2) →
     DecisionRecord → Ledger Append (M0) → Replay Evidence (M7) → Level 1 Explanation.

   It REUSES each subsystem's pure decision functions (no duplicated logic). Sub-executors are
   invoked WITHOUT a ledger store, so the ONLY provenance writer is this pipeline — exactly one
   record per request. Nothing executes before GEL; nothing bypasses eligibility/permissions.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC     = isNode ? require("../cac") : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var PLANNER = isNode ? require("../planner") : (typeof window !== "undefined" ? window.AUBS_PLANNER_API : null);
  var GEL     = isNode ? require("../gel") : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var PROV    = isNode ? require("../providers") : (typeof window !== "undefined" ? window.AUBS_PROVIDERS : null);
  var TOOLS   = isNode ? require("../tools") : (typeof window !== "undefined" ? window.AUBS_TOOLS : null);
  var MEMPERMS= isNode ? require("../memory/permissions") : (typeof window !== "undefined" ? window.AUBS_MEMORY_PERMS : null);
  var LEDGER  = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var REPLAY  = isNode ? require("../replay") : (typeof window !== "undefined" ? window.AUBS_REPLAY : null);
  var KEXPL   = isNode ? require("../kernel/explanation") : (typeof window !== "undefined" ? window.AUBS_KERNEL_EXPLANATION : null);
  var SPINE   = isNode ? require("../../spine/spine.js") : (typeof window !== "undefined" ? window.AUBS_SPINE : null);
  var GATE    = isNode ? require("../facts/gate") : (typeof window !== "undefined" ? window.AUBS_FACT_GATE : null);

  function spineEntries(memories) {
    return (memories || []).map(function (m) { return { id: m.memory_id, content: m.content, user_verified: true, superseded_by: null }; });
  }
  // Slice 0 invariant: a provider may ONLY be invoked inside a valid Execution Contract.
  // No contract (or an invalid one) = no provider call → an explicit fail-closed failure. This
  // is the structural enforcement that the model never runs ungoverned.
  function callProviderInContract(registry, providerId, plan, contract, ctx) {
    var ok = contract && CAC && CAC.validate && CAC.validate.validateExecutionContract(contract).valid === true;
    if (!ok) return Promise.resolve({ ok: false, failure_type: "policy_denied", message: "no valid execution contract — provider call refused (fail closed)", recoverable: false, drift: false });
    return registry.runGuarded(providerId, plan, Object.assign({}, ctx || {}, { execution_contract: contract }));
  }
  // Restrict a provider registry to a skill's DECLARED allowed_providers, so provider
  // eligibility can never select a provider the skill did not request (the skill's
  // capability boundary is honoured end-to-end — no cross-subsystem leak).
  function filterRegistry(reg, allowedIds) {
    var allow = {}; (allowedIds || []).forEach(function (id) { allow[id] = true; });
    return {
      list: function () { return reg.list().filter(function (p) { return allow[p.provider_id]; }); },
      get: function (id) { return allow[id] ? reg.get(id) : null; },
      has: function (id) { return !!allow[id] && reg.has(id); },
      runGuarded: function (id, plan, ctx) { return reg.runGuarded(id, plan, ctx); }
    };
  }

  // request: { user_text, constraints?, skill_id, operation, memory?: {query}, tool?: {tool_id, operation, args}, answer? }
  // options: { skillRegistry, toolRegistry, providerRegistry, memoryService, bundle, ctx, ledgerStore, signingKey, ids… }
  async function runConstitutionalRequest(request, options) {
    request = request || {}; options = options || {}; var O = options; var ctx = options.ctx || {};
    var bundle = options.bundle || (GEL ? GEL.defaultBundle : null);
    // Slice 0 — Article 12 v2 + Execution Contract. identityV2 defaults to the spine flag
    // (FLAG_IDENTITY_V2, default OFF) unless explicitly overridden; appIdentity is app-declared.
    var appIdentity = options.appIdentity || null;
    var identityV2 = (options.identityV2 !== undefined) ? !!options.identityV2
                   : !!(SPINE && SPINE.FLAGS && SPINE.FLAGS.FLAG_IDENTITY_V2);
    var path = [], counters = { gel: 0, provider_eligibility: 0, provider_runs: 0, memory_reads: 0, tool_runs: 0, records: 0 };
    var state = { path: path, counters: counters };

    function step(stage, detail, status) { path.push({ stage: stage, detail: detail || null, status: status || "ok" }); }

    // single provenance writer — exactly one DecisionRecord per request
    async function writeRecord(fields) {
      var dr = Object.assign({ timestamp: O.created_at, intent_id: state.intent ? state.intent.intent_id : "i", model_id: "none", provider: "constitution", retrieved_doc_refs: [] }, fields);
      var rec = null;
      if (options.ledgerStore && LEDGER) { try { rec = await LEDGER.appendRecord(options.ledgerStore, dr, options.signingKey || null); counters.records++; } catch (e) { rec = null; } }
      state.record = rec;
      return rec;
    }
    function level1(kind, status, leftDevice) {
      return KEXPL.level1({ decision: state.governance ? state.governance.decision : "deny", status: status, kind: kind, left_device: !!leftDevice });
    }
    async function finishBlocked(stage, reason, leftDevice) {
      step(stage, reason, "blocked");
      state.status = "blocked";
      await writeRecord({ input: request.user_text || "", output: "", execution_type: "blocked", memory_refs: [], policy_version: state.governance ? state.governance.policy_bundle_hash : "none", explanation: blockExplanation(stage, reason, leftDevice) });
      step("DecisionRecord", "blocked", "ok"); step("Ledger", state.record ? "appended" : "n/a", "ok");
      state.explanation = level1("blocked", "blocked", leftDevice);
      step("Explanation", state.explanation, "ok");
      return state;
    }
    function blockExplanation(stage, reason, leftDevice) {
      return { decision: state.governance ? state.governance.decision : "deny", winning_rule: state.governance ? state.governance.winning_rule : null, status: "blocked", kind: "blocked", left_device: !!leftDevice, blocked_stage: stage, blocked_reason: reason, provider_id: state.selected_provider || null, grounding_tag: null, grounding_strength: null, planner_graph_hash: state.graph_hash || null };
    }

    // 1) Intent / 2) CAC Intent
    state.intent = CAC.builders.buildIntent(request.user_text || "", { intent_id: O.intent_id, created_at: O.created_at, source: O.source || "user", constraints: request.constraints });
    step("Intent"); step("CAC", state.intent.intent_id);

    // 3) Deterministic Plan (the planner is the ONLY plan producer)
    var planned = PLANNER.buildPlan(request, { skillRegistry: options.skillRegistry, toolRegistry: options.toolRegistry, providerRegistry: options.providerRegistry }, { skill_id: request.skill_id, operation: request.operation, refuse: request.refuse, intent_id: O.intent_id, plan_id: O.plan_id, created_at: O.created_at });
    if (!planned.ok) { step("Plan", planned.error, "blocked"); return finishBlocked("Plan", planned.error || "plan_invalid"); }
    state.plan = planned.cac_plan; state.graph = planned.graph; state.graph_hash = planned.graph_hash; state.estimate = planned.estimate; state.planned = planned;
    step("Plan", "graph " + planned.graph_hash + " · " + planned.estimate.node_count + " nodes");

    // 4) GEL Decision — nothing executes before this
    state.governance = GEL.evaluate(state.plan, bundle, { intent: state.intent, created_at: O.created_at }); counters.gel++;
    step("GEL", state.governance.decision);
    if (state.governance.decision !== "allow") return finishBlocked("GEL", "policy_" + state.governance.decision, false);

    // 4a) GOVERNED-FACT REGISTRY — the FIRST pre-model owner (Invariant I), behind
    // FLAG_GOVERNED_FACTS. The registry has first refusal over EVERY governed fact:
    // creator/capabilities/version/identity (identity delegated to the spine's one
    // router). identityRoute is reachable only THROUGH this gate, so it can never be
    // the first handler and can never over-capture creator/capability questions.
    // user_profile is deferred to the memory stage (excluded here). When this fires,
    // the model is called 0×. OFF → skipped entirely (byte-identical; 4b runs instead).
    var governedFacts = (options.governedFacts !== undefined) ? !!options.governedFacts
                      : !!(SPINE && SPINE.FLAGS && SPINE.FLAGS.FLAG_GOVERNED_FACTS);
    if (governedFacts && GATE) {
      var gResolved = (SPINE && SPINE.resolveRuntimeIdentity)
        ? SPINE.resolveRuntimeIdentity(options.identityConfig || { assistantName: options.userPersonaName || null, userName: options.userName || null }, appIdentity)
        : null;
      state.resolvedIdentity = gResolved;
      var gres = GATE.governedFactGate(request.user_text || "", {
        resolved: gResolved, runtime: options.runtime || null, entries: [], exclude: ["user_profile"], enabled: true
      });
      if (gres.handled) {
        var GRI = gResolved || {};
        var isIdentityFact = gres.factId && gres.factId.indexOf("identity:") === 0;
        var gContract = CAC.builders.buildExecutionContract({
          intent_id: state.intent.intent_id, user_intent: request.user_text || "",
          app_identity: { assistant_name: GRI.assistantDisplayName || "AUBS", persona_ref: GRI.personaRef || "aubs-default", app_id: GRI.appId || "aubs" },
          allowed_provider: null,
          verdict: { decision: state.governance.decision, winning_rule: state.governance.winning_rule, policy_bundle_hash: state.governance.policy_bundle_hash },
          output_constraints: { must_not_claim_identity: true },
          safety_classification: "normal", egress_boundary: "none",
          replay_metadata: { policy_version: state.governance.policy_bundle_hash }
        });
        state.execution_contract = gContract;
        state.output_text = gres.answer; state.grounding = { tag: "general", grounding_strength: null }; state.status = "ok";
        step("GovernedFact", gres.factId + " (" + gres.owner + ")");
        await writeRecord({
          input: request.user_text || "", output: gres.answer, execution_type: "governed_fact",
          model_id: "none", provider: "governed_fact", memory_refs: [], policy_version: state.governance.policy_bundle_hash,
          explanation: {
            decision: state.governance.decision, winning_rule: state.governance.winning_rule, status: "ok", kind: "executed",
            left_device: false, fact_id: gres.factId, fact_owner: gres.owner, model_called: false,
            assistant_name: GRI.assistantDisplayName || "AUBS", assistant_name_source: GRI.assistantNameSource || "default",
            product_name: GRI.productName || "AUBS", execution_contract_id: gContract.contract_id,
            grounding_tag: "general", grounding_strength: null, planner_graph_hash: state.graph_hash
          }
        });
        step("DecisionRecord", state.record ? state.record.id : "(no store)");
        step("Ledger", state.record ? "appended seq " + state.record.seq : "n/a");
        if (state.record) {
          state.evidence = REPLAY.captureDecision({ intent: state.intent, plan: state.plan, governance: state.governance, record: state.record, result: { provider_id: null, output_text: gres.answer } }, { policyBundle: bundle, registry: options.providerRegistry });
          step("Replay", "evidence captured");
        }
        state.governed_fact = { fact_id: gres.factId, owner: gres.owner, model_called: false };
        // keep the identity surface for identity-kind facts (so the UI "Why?" still works)
        if (isIdentityFact) state.identity = { source: GRI.assistantNameSource || "default", kind: gres.factId.slice("identity:".length), assistant_name: GRI.assistantDisplayName || "AUBS", assistant_name_source: GRI.assistantNameSource || "default", app_id: GRI.appId || "aubs", model_called: false };
        state.explanation = "Answered from a runtime-owned governed fact (" + gres.factId + "). Model was not called.";
        step("Explanation", state.explanation);
        return state;
      }
      // not a governed fact → open-ended; fall through to the model. The legacy 4b
      // identity stage is SKIPPED (the registry already had first refusal over identity).
    }

    // 4b) Unified Identity Governance (LEGACY path — runs ONLY when FLAG_GOVERNED_FACTS is OFF,
    // so it is byte-identical to pre-A2). Deterministic identity routes, model called 0×.
    // ONE resolved identity object (assistant name by precedence app>user>default · AUBS runtime ·
    // canonical acronym) drives all five governed answers (who are you · your name · introduce ·
    // what does AUBS stand for · what's my name). Gated by FLAG_IDENTITY_V2 (OFF → not built).
    var resolvedIdentity = (!governedFacts && identityV2 && SPINE && SPINE.resolveRuntimeIdentity)
      ? SPINE.resolveRuntimeIdentity(options.identityConfig || { assistantName: options.userPersonaName || null, userName: options.userName || null }, appIdentity)
      : null;
    state.resolvedIdentity = resolvedIdentity;
    var idRoute = resolvedIdentity ? SPINE.identityRoute(request.user_text || "", resolvedIdentity) : { handled: false };
    if (idRoute.handled) {
      var RI = resolvedIdentity;
      var idContract = CAC.builders.buildExecutionContract({
        intent_id: state.intent.intent_id, user_intent: request.user_text || "",
        app_identity: { assistant_name: RI.assistantDisplayName, persona_ref: RI.personaRef || "aubs-default", app_id: RI.appId || "aubs" },
        allowed_provider: null,
        verdict: { decision: state.governance.decision, winning_rule: state.governance.winning_rule, policy_bundle_hash: state.governance.policy_bundle_hash },
        output_constraints: { must_not_claim_identity: true },
        safety_classification: "normal", egress_boundary: "none",
        replay_metadata: { policy_version: state.governance.policy_bundle_hash }
      });
      state.execution_contract = idContract;
      var idAnswer = idRoute.answer;
      var idSource = idRoute.kind === "user_name" ? "user_profile" : (idRoute.kind === "acronym" ? "product_fact" : RI.assistantNameSource);
      var idWhy = idRoute.kind === "user_name"
        ? (RI.userName ? "Answered from your saved name. Model was not called." : "Your name isn't saved yet — answered without the model.")
        : (idRoute.kind === "acronym" ? "AUBS acronym answered from the product fact. Model was not called."
                                      : "Identity answered from declared truth (source: " + RI.assistantNameSource + "). Model was not called.");
      state.output_text = idAnswer; state.grounding = { tag: "general", grounding_strength: null };
      state.status = "ok"; step("Identity", idRoute.kind + ":" + RI.assistantDisplayName + " (" + idSource + ")");
      await writeRecord({
        input: request.user_text || "", output: idAnswer, execution_type: "identity",
        model_id: "none", provider: "identity", memory_refs: [], policy_version: state.governance.policy_bundle_hash,
        explanation: {
          decision: state.governance.decision, winning_rule: state.governance.winning_rule, status: "ok", kind: "executed",
          left_device: false, identity_source: idSource, identity_kind: idRoute.kind,
          assistant_name: RI.assistantDisplayName, assistant_name_source: RI.assistantNameSource,
          app_id: RI.appId || "aubs", product_name: RI.productName,
          execution_contract_id: idContract.contract_id, model_called: false,
          grounding_tag: "general", grounding_strength: null, planner_graph_hash: state.graph_hash
        }
      });
      step("DecisionRecord", state.record ? state.record.id : "(no store)");
      step("Ledger", state.record ? "appended seq " + state.record.seq : "n/a");
      if (state.record) {
        state.evidence = REPLAY.captureDecision({ intent: state.intent, plan: state.plan, governance: state.governance, record: state.record, result: { provider_id: null, output_text: idAnswer } }, { policyBundle: bundle, registry: options.providerRegistry });
        step("Replay", "evidence captured");
      }
      state.identity = { source: idSource, kind: idRoute.kind, assistant_name: RI.assistantDisplayName, assistant_name_source: RI.assistantNameSource, app_id: RI.appId || "aubs", model_called: false };
      state.explanation = idWhy;
      step("Explanation", state.explanation);
      return state;
    }

    // 5) Provider Eligibility (only when the plan calls a provider)
    var needProvider = (state.estimate.required_providers || []).length > 0;
    if (needProvider && options.providerRegistry) {
      // honour the skill's declared allowed_providers — eligibility may only consider those.
      var skill = (options.skillRegistry && request.skill_id) ? options.skillRegistry.getSkill(request.skill_id) : null;
      var eligReg = skill ? filterRegistry(options.providerRegistry, skill.allowed_providers || []) : options.providerRegistry;
      var eg = await PROV.eligibility.evaluate({ intent: state.intent, plan: state.plan, governance: state.governance, registry: eligReg }); counters.provider_eligibility++;
      state.eligibility = eg;
      if (!eg.selected) { step("Eligibility", eg.summary.reason, "blocked"); return finishBlocked("Eligibility", "no_eligible_provider", false); }
      state.selected_provider = eg.selected;
      step("Eligibility", "selected " + eg.selected);
    } else { step("Eligibility", needProvider ? "no registry" : "not required"); }

    // 6) Memory Access (governed; permission cannot be bypassed)
    var memEntries = [], memRefs = [];
    if (request.memory && options.memoryService) {
      var rd = await options.memoryService.read({ user_id: request.memory.user_id || (ctx.actor && ctx.actor.user_id), scope: request.memory.scope, text: request.memory.text }, ctx); counters.memory_reads++;
      if (rd.ok === false) return finishBlocked("Memory", rd.reason || "memory_denied", false);
      if (request.memory.required && rd.memories.length === 0 && (rd.denied || []).length > 0) return finishBlocked("Memory", "memory_permission_denied", false);
      memEntries = spineEntries(rd.memories); memRefs = rd.memories.map(function (m) { return m.memory_id; });
      step("Memory", "read " + memRefs.length + (rd.denied && rd.denied.length ? " (" + rd.denied.length + " denied)" : ""));
    } else { step("Memory", "none"); }

    // 7) Tool Access (governed; reuses the M10 executor WITHOUT a ledger store -> no extra record)
    var toolOut = null;
    if (request.tool && options.toolRegistry) {
      var te = await TOOLS.executeTool(request.tool, { registry: options.toolRegistry, bundle: bundle, ctx: ctx /* no ledgerStore: pipeline writes the single record */ });
      counters.tool_runs++;
      if (te.status === "blocked") return finishBlocked("Tools", (te.eligibility.reasons || ["blocked"])[0], false);
      toolOut = te; step("Tools", request.tool.tool_id + ":" + request.tool.operation + " → " + te.status);
    } else { step("Tools", "not required"); }

    // 7b) Mint the per-turn Execution Contract the provider will run INSIDE (Slice 0). ONLY the
    // kernel mints it; the provider receives it and decides none of it. The app identity (if any)
    // is injected here so the provider runs with the declared identity it cannot originate.
    state.execution_contract = CAC.builders.buildExecutionContract({
      intent_id: state.intent.intent_id, user_intent: request.user_text || "",
      app_identity: appIdentity || undefined, allowed_provider: state.selected_provider || null,
      allowed_tools: request.tool && request.tool.tool_id ? [request.tool.tool_id] : [],
      allowed_memory_scopes: request.memory && request.memory.scope ? [request.memory.scope] : [],
      verdict: { decision: state.governance.decision, winning_rule: state.governance.winning_rule, policy_bundle_hash: state.governance.policy_bundle_hash },
      output_constraints: { max_tokens: 256, must_not_claim_identity: identityV2 },
      safety_classification: "normal",
      egress_boundary: (state.estimate.max_egress && state.estimate.max_egress !== "none") ? state.estimate.max_egress : "none",
      replay_metadata: { policy_version: state.governance.policy_bundle_hash }
    });

    // 8) Execution — provider (M5 drift shield) or deterministic; tool output if a tool ran
    var outputText = "", modelId = "none", providerType = null;
    var terminalKind = "executed";
    if (state.selected_provider) {
      // No contract = no provider call (fail closed). The kernel always reaches here with one.
      var pout = await callProviderInContract(options.providerRegistry, state.selected_provider, state.plan, state.execution_contract, { intent: state.intent }); counters.provider_runs++;
      var pr = options.providerRegistry.get(state.selected_provider); providerType = pr ? pr.provider_type : null;
      if (!pout || !pout.ok) { state.failure_msg = (pout && pout.message) || "provider failed"; step("Execution", "provider failed", "error"); }
      else { outputText = pout.output_text || ""; modelId = pout.model_id || "local-model"; step("Execution", "provider " + state.selected_provider); }
    } else if (toolOut) { outputText = (toolOut.result && toolOut.result.output_text) || ""; step("Execution", "tool result"); }
    else { outputText = request.answer != null ? request.answer : ""; step("Execution", "deterministic"); }

    // 9) Grounding Verification (spine Article 3a / v2 — honours the active flag)
    var grounding = { tag: "general", grounding_strength: null };
    if (outputText && memEntries.length) {
      var r = SPINE.tagAnswer({ answer: outputText, query: request.user_text, memory_ids_in_prompt: memRefs, entries: memEntries, classification: SPINE.classify(request.user_text), tolerantFormat: true });
      grounding = { tag: r.tag, grounding_strength: r.grounding_strength || null, grounded_on: r.grounded_on || r.memory_ids_cited || [] };
    }
    step("Grounding", grounding.tag + (grounding.grounding_strength ? " (" + grounding.grounding_strength + ")" : ""));

    // 10/11) DecisionRecord + Ledger Append (the single provenance write)
    var leftDevice = PLANNER.graph.EGRESS_RANK ? false : false; // local-first; egress only if a provider/tool left the device
    leftDevice = (state.estimate.max_egress && state.estimate.max_egress !== "none");
    var status = state.failure_msg ? "error" : "ok";
    state.status = status;
    await writeRecord({
      input: request.user_text || "", output: outputText, execution_type: state.failure_msg ? "blocked" : "model",
      model_id: modelId, provider: state.selected_provider || (request.tool && request.tool.tool_id) || "local",
      memory_refs: memRefs, policy_version: state.governance.policy_bundle_hash,
      explanation: {
        decision: state.governance.decision, winning_rule: state.governance.winning_rule, status: status, kind: terminalKind,
        left_device: leftDevice, provider_id: state.selected_provider || null, provider_type: providerType,
        tool_id: (request.tool && request.tool.tool_id) || null, memory_count: memRefs.length,
        grounding_tag: grounding.tag, grounding_strength: grounding.grounding_strength, grounded_on: grounding.grounded_on || [],
        planner_graph_hash: state.graph_hash, eligibility_reason: state.eligibility ? state.eligibility.summary.reason : null
      }
    });
    step("DecisionRecord", state.record ? state.record.id : "(no store)");
    step("Ledger", state.record ? "appended seq " + state.record.seq : "n/a");

    // 12) Replay Evidence (references THIS ledger record; no execution)
    if (state.record) {
      state.evidence = REPLAY.captureDecision({ intent: state.intent, plan: state.plan, governance: state.governance, record: state.record, result: { provider_id: state.selected_provider, output_text: outputText } }, { policyBundle: bundle, registry: options.providerRegistry });
      step("Replay", "evidence captured");
    } else { step("Replay", "n/a"); }

    // 13) Level 1 Explanation (from recorded state)
    state.output_text = outputText; state.grounding = grounding;
    state.explanation = level1(terminalKind, status, leftDevice);
    step("Explanation", state.explanation);
    return state;
  }

  var API = { runConstitutionalRequest: runConstitutionalRequest, spineEntries: spineEntries, callProviderInContract: callProviderInContract };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONSTITUTION_PIPELINE = API;
})();
