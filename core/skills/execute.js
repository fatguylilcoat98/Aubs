/* ============================================================================
   AUBS Constitutional Skills Framework — governed skill executor (M11)
   Truth · Safety · We Got Your Back

   A skill describes work and REQUESTS resources; it never executes providers, memory, or
   tools. The kernel decides. Lifecycle:

     request → CAC Intent → Plan(declared resource steps) → GEL → skill eligibility
       (manifest + GEL + every required provider/tool/memory-scope eligible + network +
        confirmation + risk) → (eligible? run the deterministic skill : block) →
       CAC Result (ok/blocked/error/partial) → DecisionRecord → (replay).

   M11 uses deterministic fake skills only — no LLM-authored plans, no dynamic code.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC    = isNode ? require("../cac")            : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var GEL    = isNode ? require("../gel")            : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var ELIG   = isNode ? require("./eligibility")     : (typeof window !== "undefined" ? window.AUBS_SKILL_ELIG : null);
  var EXPL   = isNode ? require("./explanation")     : (typeof window !== "undefined" ? window.AUBS_SKILL_EXPL : null);

  var SKILL_KERNEL_VERSION = "skill-kernel-0.1";

  function requiredResources(skill) {
    var r = [];
    (skill.allowed_memory_scopes || []).forEach(function (s) { r.push("memory:" + s); });
    (skill.allowed_tools || []).forEach(function (t) { r.push("tool:" + t); });
    (skill.allowed_providers || []).forEach(function (p) { r.push("provider:" + p); });
    return r;
  }
  function planSteps(skill, net) {
    var steps = [];
    if ((skill.allowed_memory_scopes || []).length) steps.push({ step_type: "memory_read", egress: "none" });
    (skill.allowed_tools || []).forEach(function (t) { steps.push({ step_type: "tool_call", target: t, egress: net ? "full" : "none" }); });
    if ((skill.allowed_providers || []).length) steps.push({ step_type: "model_call", target: "provider", egress: net ? "full" : "none" });
    if (!steps.length) steps.push({ step_type: "deterministic_answer" });
    return steps;
  }

  async function executeSkill(request, options) {
    request = request || {}; options = options || {}; var O = options;
    var ctx = options.ctx || {};
    var bundle = options.bundle || (GEL ? GEL.defaultBundle : null);
    var skill = (options.skillRegistry && options.skillRegistry.getSkill) ? options.skillRegistry.getSkill(request.skill_id) : null;
    var operation = request.operation;
    var net = !!(skill && skill.requires_network === true);

    var intent = CAC.builders.buildIntent("skill:" + (request.skill_id || "?") + ":" + (operation || "?"), {
      intent_id: O.intent_id, created_at: O.created_at, source: O.source || "user",
      constraints: { data_classification: net ? "public" : "personal", local_only: !net, max_egress: net ? "full" : "none" }
    });
    var plan = CAC.builders.buildPlan(intent, skill ? planSteps(skill, net) : [{ step_type: "deterministic_answer" }], { plan_id: O.plan_id, created_at: O.created_at });
    var governance = GEL.evaluate(plan, bundle, { intent: intent, decision_id: O.decision_id, created_at: O.created_at });

    var eligibility = await ELIG.evaluate({ skill: skill, operation: operation, governance: governance, ctx: ctx, toolRegistry: options.toolRegistry, providerRegistry: options.providerRegistry });

    var result, label, status, resultClass, skillOut = null;
    if (!eligibility.eligible) {
      label = "blocked"; status = "blocked"; resultClass = "blocked";
      result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: "blocked", output_text: "", model_id: null, provider_id: request.skill_id || null });
    } else {
      try { skillOut = await skill.execute(operation, request.inputs, ctx); }
      catch (e) { skillOut = { status: "failure", message: (e && e.message) ? e.message : String(e), output_classification: "none" }; }
      var st = skillOut && skillOut.status;
      resultClass = (skillOut && skillOut.output_classification) || (st === "failure" ? "none" : "unknown");
      if (st === "success") { label = "success"; status = "ok"; }
      else if (st === "partial") { label = "partial"; status = "partial"; }
      else { label = "failure"; status = "error"; }
      result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: status, output_text: (status === "ok" || status === "partial") ? (skillOut.output_text || "") : "", model_id: null, provider_id: request.skill_id || null });
    }

    var leftDevice = net && eligibility.eligible;
    var drInput = {
      input: "skill:" + (request.skill_id || "?") + ":" + (operation || "?"),
      output: resultClass, timestamp: O.created_at, intent_id: intent.intent_id,
      model_id: "none", provider: request.skill_id || "skill", execution_type: "skill",
      memory_refs: [], retrieved_doc_refs: [],
      explanation: {
        kernel: SKILL_KERNEL_VERSION, decision: governance.decision, winning_rule: governance.winning_rule,
        status: label, skill_id: request.skill_id || null, skill_version: skill ? skill.version : null,
        operation: operation || null, risk_level: skill ? skill.risk_level : null,
        required_resources: skill ? requiredResources(skill) : [],
        approved_resources: eligibility.approved_resources.map(function (r) { return r.resource; }),
        blocked_resources: eligibility.blocked_resources,
        required_permissions: skill ? (skill.required_permissions || []) : [],
        result_classification: resultClass, approval_path: eligibility.approval_path,
        requires_user_confirmation: skill ? !!skill.requires_user_confirmation : false,
        left_device: leftDevice, eligibility_reasons: eligibility.reasons
      },
      policy_version: governance.policy_bundle_hash
    };
    var record = null;
    if (options.ledgerStore && LEDGER) {
      try { record = await LEDGER.appendRecord(options.ledgerStore, drInput, options.signingKey || null); } catch (e) { record = null; }
    }
    var explanation = EXPL.skillWhy(record || { explanation: drInput.explanation });
    return { intent: intent, plan: plan, governance: governance, eligibility: eligibility, result: result, record: record, explanation: explanation, status: label, skill_id: request.skill_id, operation: operation };
  }

  var API = { executeSkill: executeSkill, requiredResources: requiredResources, SKILL_KERNEL_VERSION: SKILL_KERNEL_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_EXECUTE = API;
})();
