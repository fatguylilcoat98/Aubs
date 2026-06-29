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
      } else { // model_call → local adapter
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
    var drInput = {
      input: intent.user_text,
      output: result ? result.output_text : "",
      timestamp: O.created_at,                          // pin in tests; real time in the app
      intent_id: intent.intent_id,
      model_id: result ? (result.model_id || "local") : "none",
      provider: "local",
      execution_type: kind === "executed" ? "model" : "blocked",
      memory_refs: (result && result.grounding && result.grounding.memory_refs) || [],
      retrieved_doc_refs: [],
      explanation: { decision: governance.decision, winning_rule: governance.winning_rule, status: status, kind: kind, left_device: leftDevice, tag: (result && result.grounding && result.grounding.tag) || null },
      policy_version: governance.policy_bundle_hash
    };
    var record = null;
    if (options.ledgerStore && LEDGER) {
      try { record = await LEDGER.appendRecord(options.ledgerStore, drInput, options.signingKey || null); }
      catch (e) { record = null; /* never crash the kernel on a ledger failure */ }
    }

    // 8) Level 1 explanation — derived from recorded state, never from model output
    var explanation = EXPL.level1({ decision: governance.decision, status: status, kind: kind, left_device: leftDevice });

    return { intent: intent, plan: plan, governance: governance, result: result, failure: failure, record: record, explanation: explanation, status: status, kind: kind };
  }

  var API = { executeIntent: executeIntent };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_EXECUTE = API;
})();
