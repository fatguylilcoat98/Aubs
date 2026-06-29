/* ============================================================================
   AUBS CAC — DecisionRecord adapter (Milestone 1)
   Truth · Safety · We Got Your Back

   ADDITIVE mapping: turn CAC objects into the input the Milestone-0 ledger
   (spine/ledger.js appendRecord) already accepts. It does NOT replace or rewrite
   DecisionRecord — the ledger remains the authority. This is just a translator,
   so the future kernel can speak CAC and still feed the existing signed ledger.
   ========================================================================== */
(function () {
  "use strict";

  function deriveExecType(plan, result) {
    if (result && result.status === "blocked") return "blocked";
    var steps = (plan && plan.steps) || [];
    if (steps.some(function (s) { return s.step_type === "refusal"; })) return "blocked";
    if (steps.some(function (s) { return s.step_type === "model_call"; })) return "model";
    if (steps.some(function (s) { return s.step_type === "deterministic_answer"; })) return "rule";
    return "model";
  }
  function deriveRetrieved(plan) {
    var steps = (plan && plan.steps) || [];
    return steps.filter(function (s) { return s.step_type === "retrieve" && s.target; }).map(function (s) { return s.target; });
  }

  /* Map a CAC Result (+ its intent/plan/governance) to ledger.appendRecord input.
     Returns a plain object; the caller decides whether/when to append. */
  function cacToDecisionRecordInput(result, ctx) {
    ctx = ctx || {};
    if (!result || typeof result !== "object") throw new Error("cacToDecisionRecordInput: result is required");
    var intent = ctx.intent || {}, plan = ctx.plan || {}, gov = ctx.governance || null;
    var grounding = result.grounding || {};
    return {
      input: intent.user_text != null ? intent.user_text : "",
      output: result.output_text != null ? result.output_text : "",
      intent_id: result.intent_id || intent.intent_id || null,
      model_id: result.model_id || "unknown",
      provider: result.provider_id || "local",
      execution_type: ctx.execution_type || deriveExecType(plan, result),
      memory_refs: (grounding.memory_refs || []).slice(),
      retrieved_doc_refs: deriveRetrieved(plan),
      explanation: {
        tag: grounding.tag || null,
        grounding_source: grounding.grounding_source || null,
        decision: gov ? gov.decision : null,
        winning_rule: gov ? gov.winning_rule : null,
        result_status: result.status
      },
      policy_version: gov ? gov.policy_bundle_hash : null
    };
  }

  var API = { cacToDecisionRecordInput: cacToDecisionRecordInput };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CAC_ADAPTER = API;
})();
