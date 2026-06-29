/* ============================================================================
   AUBS Kernel — deterministic Plan builder (Milestone 3)
   Truth · Safety · We Got Your Back

   Builds a CAC Plan from a CAC Intent using DETERMINISTIC rules only. No model is
   called and no LLM decides the plan. M3 supports three plan kinds:
     - model_call          (local inference, egress:none by default)
     - deterministic_answer (precomputed answer, no model)
     - refusal             (deterministic refusal, e.g. safety)
   ========================================================================== */
(function () {
  "use strict";
  var CAC = (typeof require !== "undefined") ? require("../cac") : (typeof window !== "undefined" ? window.AUBS_CAC : null);

  function buildPlanForIntent(intent, options) {
    options = options || {};
    var kind = options.plan_kind || "model_call";
    var steps;
    if (kind === "refusal") {
      steps = [{ step_type: "refusal", detail: options.refusal_reason || "refused" }];
    } else if (kind === "deterministic_answer") {
      steps = [{ step_type: "deterministic_answer", detail: "precomputed" }];
    } else { // model_call
      steps = [];
      if (options.memory_read !== false) steps.push({ step_type: "memory_read", target: "user" });
      // The step's egress honors the Intent's declared ceiling (so a cloud plan actually
      // declares egress and GEL/eligibility can govern it). Explicit options.egress wins.
      var egress = options.egress || (intent && intent.constraints && intent.constraints.max_egress) || "none";
      steps.push({ step_type: "model_call", target: options.provider || "local", egress: egress });
    }
    return CAC.builders.buildPlan(intent, steps, { plan_id: options.plan_id, created_at: options.created_at });
  }

  // The terminal action of a plan (memory_read/retrieve are preparatory).
  function planTerminalKind(plan) {
    var steps = (plan && plan.steps) || [];
    if (steps.some(function (s) { return s.step_type === "refusal"; })) return "refusal";
    if (steps.some(function (s) { return s.step_type === "model_call"; })) return "model_call";
    if (steps.some(function (s) { return s.step_type === "deterministic_answer"; })) return "deterministic_answer";
    if (steps.some(function (s) { return s.step_type === "tool_call"; })) return "tool_call";
    return "model_call";
  }
  // Did any step send data off-device? (M3 is local-first → false.)
  function planLeftDevice(plan) {
    return ((plan && plan.steps) || []).some(function (s) { return s.egress && s.egress !== "none"; });
  }

  var API = { buildPlanForIntent: buildPlanForIntent, planTerminalKind: planTerminalKind, planLeftDevice: planLeftDevice };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_PLAN = API;
})();
