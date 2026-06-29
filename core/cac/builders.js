/* ============================================================================
   AUBS CAC — builders (Milestone 1)
   Truth · Safety · We Got Your Back

   Small, pure builders that PRODUCE valid CAC objects. Rules:
   - never call a model (plan construction is deterministic),
   - never mutate inputs (always build fresh objects),
   - validate output and throw (fail closed) — a builder can never emit invalid CAC.
   ids/timestamps are injectable via options so builds are reproducible in tests.
   ========================================================================== */
(function () {
  "use strict";
  var V = (typeof require !== "undefined") ? require("./validate") : (typeof window !== "undefined" ? window.AUBS_CAC_VALIDATE : null);

  function nowISO() { return new Date().toISOString(); }
  var _ctr = 0;
  function genId(prefix) {
    try { if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.randomUUID) return prefix + "_" + globalThis.crypto.randomUUID(); } catch (e) {}
    _ctr++; return prefix + "_" + Date.now().toString(36) + "_" + _ctr;
  }

  function buildIntent(userText, options) {
    options = options || {};
    if (typeof userText !== "string") throw new Error("buildIntent: userText must be a string");
    var c = options.constraints || {};
    var intent = {
      cac_version: V.CAC_VERSION,
      intent_id: options.intent_id || genId("intent"),
      created_at: options.created_at || nowISO(),
      user_text: userText,
      source: options.source || "user",
      constraints: {
        // conservative defaults: local-only, no egress, until something raises them
        max_egress: c.max_egress || "none",
        data_classification: c.data_classification || "personal",
        local_only: c.local_only !== undefined ? c.local_only : true,
        requires_user_approval: c.requires_user_approval !== undefined ? c.requires_user_approval : false
      }
    };
    if (c.allowed_providers !== undefined) intent.constraints.allowed_providers = c.allowed_providers.slice();
    if (options.context_refs !== undefined) intent.context_refs = options.context_refs.slice();
    return V.assertValid(V.schema("intent"), intent, "intent");
  }

  function buildPlan(intent, steps, options) {
    options = options || {};
    if (!intent || typeof intent.intent_id !== "string") throw new Error("buildPlan: needs a valid intent");
    if (!Array.isArray(steps)) throw new Error("buildPlan: steps must be an array");
    var cleanSteps = steps.map(function (s) {
      var step = { step_type: s.step_type };           // fresh objects — never mutate caller's steps
      if (s.target !== undefined) step.target = s.target;
      if (s.egress !== undefined) step.egress = s.egress;
      if (s.detail !== undefined) step.detail = s.detail;
      return step;
    });
    // deterministic derivation: governance is required if anything leaves the device or calls out
    var rg = options.requires_governance;
    if (rg === undefined) rg = cleanSteps.some(function (s) { return (s.egress && s.egress !== "none") || s.step_type === "model_call" || s.step_type === "tool_call"; });
    var plan = {
      cac_version: V.CAC_VERSION,
      plan_id: options.plan_id || genId("plan"),
      intent_id: intent.intent_id,
      created_at: options.created_at || nowISO(),
      steps: cleanSteps,
      requires_governance: !!rg,
      status: options.status || "ready"
    };
    return V.assertValid(V.schema("plan"), plan, "plan");
  }

  function buildGovernanceDecision(plan, decision, options) {
    options = options || {};
    if (!plan || typeof plan.plan_id !== "string") throw new Error("buildGovernanceDecision: needs a valid plan");
    var g = {
      cac_version: V.CAC_VERSION,
      decision_id: options.decision_id || genId("gov"),
      plan_id: plan.plan_id,
      decision: decision,
      winning_rule: options.winning_rule || "default_allow",
      precedence_level: options.precedence_level || "default",
      policy_bundle_hash: options.policy_bundle_hash || "none",
      created_at: options.created_at || nowISO()
    };
    if (options.reason !== undefined) g.reason = options.reason;
    return V.assertValid(V.schema("governance"), g, "governance");
  }

  function buildResult(intent, plan, options) {
    options = options || {};
    if (!intent || !plan) throw new Error("buildResult: needs intent and plan");
    var r = {
      cac_version: V.CAC_VERSION,
      result_id: options.result_id || genId("result"),
      intent_id: intent.intent_id,
      plan_id: plan.plan_id,
      status: options.status || "ok",
      output_text: options.output_text !== undefined ? options.output_text : "",
      created_at: options.created_at || nowISO()
    };
    if (options.model_id !== undefined) r.model_id = options.model_id;
    if (options.provider_id !== undefined) r.provider_id = options.provider_id;
    if (options.grounding !== undefined) {
      r.grounding = { tag: options.grounding.tag };
      if (options.grounding.grounding_source !== undefined) r.grounding.grounding_source = options.grounding.grounding_source;
      if (options.grounding.memory_refs !== undefined) r.grounding.memory_refs = options.grounding.memory_refs.slice();
    }
    return V.assertValid(V.schema("result"), r, "result");
  }

  function buildFailure(intent, plan, options) {
    options = options || {};
    var f = {
      cac_version: V.CAC_VERSION,
      failure_id: options.failure_id || genId("fail"),
      intent_id: intent ? intent.intent_id : (options.intent_id !== undefined ? options.intent_id : null),
      plan_id: plan ? plan.plan_id : (options.plan_id !== undefined ? options.plan_id : null),
      failure_type: options.failure_type || "internal_error",
      message: options.message || "unspecified failure",
      recoverable: options.recoverable !== undefined ? options.recoverable : false,
      created_at: options.created_at || nowISO()
    };
    return V.assertValid(V.schema("failure"), f, "failure");
  }

  var API = { buildIntent: buildIntent, buildPlan: buildPlan, buildGovernanceDecision: buildGovernanceDecision, buildResult: buildResult, buildFailure: buildFailure };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CAC_BUILDERS = API;
})();
