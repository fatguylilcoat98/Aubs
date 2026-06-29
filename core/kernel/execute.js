/* ============================================================================
   AUBS Kernel — executeIntent (Milestone 3): the constitutional lifecycle
   Truth · Safety · We Got Your Back

   Intent → deterministic Plan → GEL → (allow? execute : block) → Result/Failure →
   DecisionRecord → (offline-verifiable). The model may generate; the KERNEL decides
   whether execution is allowed; the LEDGER proves what happened.

   HARD RULE: no plan executes unless GEL returns `allow`. deny / modify / require_reauth
   all block (no adapter call) in M3. EVERY terminal path appends a DecisionRecord.

   Isolated and deterministic (ids/timestamps injectable). NOT wired into the live app;
   the local adapter is injected, so the kernel runs against fakes in tests and (later,
   behind a flag) against the real in-browser loop.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC    = isNode ? require("../cac")            : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var GEL    = isNode ? require("../gel")            : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var PLAN   = isNode ? require("./plan-builder")    : (typeof window !== "undefined" ? window.AUBS_KERNEL_PLAN : null);
  var EXPL   = isNode ? require("./explanation")     : (typeof window !== "undefined" ? window.AUBS_KERNEL_EXPLANATION : null);
  // M6: provider eligibility (optional). Only used when options.providerRegistry is supplied;
  // undefined here is fine — the kernel's existing M3/M4 adapter path does not touch it.
  var ELIG   = isNode ? require("../providers/eligibility") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_ELIG : null);
  var CAC_FAILURE_TYPES = ["policy_denied", "no_eligible_provider", "model_error", "validation_error", "timeout", "unsafe_blocked", "internal_error"];
  var KERNEL_VERSION = "kernel-0.1";   // recorded in every DecisionRecord so replay (M7) can detect kernel drift

  async function executeIntent(intentInput, adapters, options) {
    options = options || {}; adapters = adapters || {};
    var bundle = options.bundle || GEL.defaultBundle;
    var O = options; // ids/timestamps for determinism

    // 1) CAC Intent
    var userText = (typeof intentInput === "string") ? intentInput : (intentInput && intentInput.user_text) || "";
    var constraints = (typeof intentInput === "object" && intentInput && intentInput.constraints) || O.constraints;
    var intent = CAC.builders.buildIntent(userText, { intent_id: O.intent_id, created_at: O.created_at, source: O.source || "user", constraints: constraints });

    // 2) deterministic Plan
    var plan = PLAN.buildPlanForIntent(intent, O);

    // 3) Governance
    var governance = GEL.evaluate(plan, bundle, { intent: intent, decision_id: O.decision_id, created_at: O.created_at });

    var result = null, failure = null, status, kind;
    var eligibility = null, selectedProvider = null;   // M6: set only on the governed provider path
    var selectedProviderMeta = null;                   // M8: provider response metadata (no secrets)

    if (governance.decision !== "allow") {
      // 4) blocked — NO adapter call. deny/modify/require_reauth all block in M3.
      kind = "blocked"; status = "blocked";
      failure = CAC.builders.buildFailure(intent, plan, {
        failure_id: O.failure_id, created_at: O.created_at,
        failure_type: "policy_denied",
        message: "Governance " + governance.decision + " (" + governance.winning_rule + "): " + governance.reason,
        recoverable: governance.decision === "require_reauth"
      });
    } else {
      // 5) allowed — execute by plan kind
      var terminal = PLAN.planTerminalKind(plan);
      if (terminal === "refusal") {
        kind = "refusal"; status = "blocked";
        failure = CAC.builders.buildFailure(intent, plan, { failure_id: O.failure_id, created_at: O.created_at, failure_type: "unsafe_blocked", message: O.refusal_reason || "refused", recoverable: false });
      } else if (terminal === "deterministic_answer") {
        kind = "executed"; status = "ok";
        result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: "ok", output_text: O.answer != null ? O.answer : "", model_id: null, provider_id: "local", grounding: O.grounding });
      } else if (options.providerRegistry && ELIG) {
        // M6 — POLICY-GOVERNED PROVIDER PATH. GEL already allowed (we're in the allow branch);
        // now run eligibility, then execute ONLY through an eligible provider, behind the shield.
        eligibility = await ELIG.evaluate({ intent: intent, plan: plan, governance: governance, registry: options.providerRegistry, options: options });
        if (!eligibility.selected) {
          // no provider is eligible → explicit CAC Failure (no silent fallback, no hidden choice)
          kind = "no_provider"; status = "error";
          failure = CAC.builders.buildFailure(intent, plan, { failure_id: O.failure_id, created_at: O.created_at, failure_type: "no_eligible_provider", message: "no eligible provider (" + eligibility.summary.reason + "); rejected: " + eligibility.rejected.map(function (r) { return r.provider_id + "[" + r.reasons.join(",") + "]"; }).join("; "), recoverable: false });
        } else {
          selectedProvider = eligibility.eligible_providers[0];
          var pout = await options.providerRegistry.runGuarded(selectedProvider.provider_id, plan, { intent: intent });   // Drift Shield in the loop
          selectedProviderMeta = (pout && pout.metadata) || null;   // request_id, http_status, finish_reason, usage — NEVER secrets
          if (pout && pout.ok) {
            kind = "executed"; status = "ok";
            result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: "ok", output_text: pout.output_text || "", model_id: pout.model_id || "provider-model", provider_id: pout.provider_id || selectedProvider.provider_id, grounding: pout.grounding });
          } else {
            kind = "failed"; status = "error";
            var pft = (pout && pout.failure_type) || "model_error";
            if (CAC_FAILURE_TYPES.indexOf(pft) === -1) pft = (pout && pout.drift) ? "validation_error" : "model_error";
            failure = CAC.builders.buildFailure(intent, plan, { failure_id: O.failure_id, created_at: O.created_at, failure_type: pft, message: (pout && pout.message) || "provider failed", recoverable: pout && pout.recoverable !== undefined ? pout.recoverable : true });
          }
        }
      } else { // model_call → local adapter (M3/M4 path, unchanged)
        var adapter = adapters.local || adapters.model || null;
        var out;
        if (!adapter) out = { ok: false, failure_type: "internal_error", message: "no local adapter provided", recoverable: false };
        else { try { out = await adapter.run(plan, { intent: intent }); } catch (e) { out = { ok: false, failure_type: "model_error", message: (e && e.message) ? e.message : String(e), recoverable: true }; } }
        if (out && out.ok) {
          kind = "executed"; status = "ok";
          result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: "ok", output_text: out.output_text || "", model_id: out.model_id || "local-model", provider_id: out.provider_id || "local", grounding: out.grounding });
        } else {
          kind = "failed"; status = "error";
          failure = CAC.builders.buildFailure(intent, plan, { failure_id: O.failure_id, created_at: O.created_at, failure_type: (out && out.failure_type) || "model_error", message: (out && out.message) || "adapter failed", recoverable: out && out.recoverable !== undefined ? out.recoverable : true });
        }
      }
    }

    // 6+7) DecisionRecord — EVERY terminal path writes one (ledger stays authoritative)
    var leftDevice = PLAN.planLeftDevice(plan);
    // M6: provider identity/decision metadata for the record (null on the M3/M4 local path).
    var providerId = (result && result.provider_id) || (selectedProvider && selectedProvider.provider_id) || (options.providerRegistry ? null : "local");
    var providerType = selectedProvider ? selectedProvider.provider_type : (options.providerRegistry ? null : "local");
    var drInput = {
      input: intent.user_text,
      output: result ? result.output_text : "",
      timestamp: O.created_at,                          // pin in tests; real time in the app
      intent_id: intent.intent_id,
      model_id: result ? (result.model_id || "local") : "none",
      provider: providerId || "local",
      execution_type: kind === "executed" ? "model" : "blocked",
      memory_refs: (result && result.grounding && result.grounding.memory_refs) || [],
      retrieved_doc_refs: [],
      explanation: {
        decision: governance.decision, winning_rule: governance.winning_rule, status: status, kind: kind,
        left_device: leftDevice, tag: (result && result.grounding && result.grounding.tag) || null,
        kernel_version: KERNEL_VERSION,   // M7: enables kernel-version drift detection on replay
        // provider governance trail (M6) — proves provider choice / denial, offline-verifiable
        provider_governed: !!options.providerRegistry,
        provider_id: providerId, provider_type: providerType,
        eligible_count: eligibility ? eligibility.summary.eligible_count : null,
        eligibility_reason: eligibility ? eligibility.summary.reason : null,
        rejected_providers: eligibility ? eligibility.rejected.map(function (r) { return { provider_id: r.provider_id, reasons: r.reasons }; }) : null,
        // M8 outbound trail — payload classification, egress, model, LOCAL request id, response
        // metadata (http status / finish_reason / usage). NO secrets, NO keys, NO auth headers.
        payload_classification: (intent.constraints && intent.constraints.data_classification) || null,
        egress_level: leftDevice ? (function () { var m = "none"; (plan.steps || []).forEach(function (st) { if (st.egress && st.egress !== "none") m = st.egress; }); return m; })() : "none",
        model_name: result ? (result.model_id || null) : null,
        request_id: selectedProviderMeta ? (selectedProviderMeta.request_id || null) : null,
        response_metadata: selectedProviderMeta ? { http_status: selectedProviderMeta.http_status != null ? selectedProviderMeta.http_status : null, finish_reason: selectedProviderMeta.finish_reason != null ? selectedProviderMeta.finish_reason : null, usage: selectedProviderMeta.usage || null } : null
      },
      policy_version: governance.policy_bundle_hash
    };
    var record = null;
    if (options.ledgerStore && LEDGER) {
      try { record = await LEDGER.appendRecord(options.ledgerStore, drInput, options.signingKey || null); }
      catch (e) { record = null; /* never crash the kernel on a ledger failure */ }
    }

    // 8) Level 1 explanation — derived from recorded state, never from model output
    var explanation = EXPL.level1({ decision: governance.decision, status: status, kind: kind, left_device: leftDevice });

    return { intent: intent, plan: plan, governance: governance, result: result, failure: failure, record: record, explanation: explanation, status: status, kind: kind, eligibility: eligibility, provider_id: selectedProvider ? selectedProvider.provider_id : (result ? result.provider_id : null) };
  }

  var API = { executeIntent: executeIntent, KERNEL_VERSION: KERNEL_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_EXECUTE = API;
})();
