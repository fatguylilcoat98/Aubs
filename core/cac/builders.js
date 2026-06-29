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

  // Execution Contract (Slice 0): the per-turn governed envelope the kernel mints and hands to
  // a provider. Deterministic, validated, fail-closed — a builder can never emit an invalid
  // contract. The provider receives this; it decides none of it.
  function buildExecutionContract(options) {
    options = options || {};
    var ai = options.app_identity || {};
    var v = options.verdict || {};
    var oc = options.output_constraints || {};
    var c = {
      cac_version: V.CAC_VERSION,
      contract_id: options.contract_id || genId("xc"),
      intent_id: options.intent_id || genId("intent"),
      app_identity: {
        assistant_name: ai.assistant_name != null ? ai.assistant_name : "AUBS",
        persona_ref: ai.persona_ref != null ? ai.persona_ref : "aubs-default",
        app_id: ai.app_id != null ? ai.app_id : "aubs"
      },
      user_intent: options.user_intent != null ? options.user_intent : "",
      allowed_provider: options.allowed_provider !== undefined ? options.allowed_provider : null,
      allowed_tools: (options.allowed_tools || []).slice(),
      allowed_memory_scopes: (options.allowed_memory_scopes || []).slice(),
      verdict: {
        decision: v.decision || "deny",
        winning_rule: v.winning_rule !== undefined ? v.winning_rule : null,
        policy_bundle_hash: v.policy_bundle_hash != null ? v.policy_bundle_hash : "none"
      },
      output_constraints: {
        max_tokens: oc.max_tokens != null ? oc.max_tokens : 256,
        must_not_claim_identity: oc.must_not_claim_identity !== undefined ? oc.must_not_claim_identity : true,
        grounding_rules: oc.grounding_rules != null ? oc.grounding_rules : "cite memory by [ID:x]; no id if unsupported",
        refusal_obligations: oc.refusal_obligations != null ? oc.refusal_obligations : "refuse harmful requests; never invent identity or facts"
      },
      safety_classification: options.safety_classification || "normal",
      egress_boundary: options.egress_boundary || "none",
      provenance_obligations: options.provenance_obligations != null ? options.provenance_obligations : "emit one signed DecisionRecord; hashes not raw text",
      replay_metadata: options.replay_metadata || {}
    };
    return V.assertValid(V.schema("execution_contract"), c, "execution_contract");
  }

  var API = { buildIntent: buildIntent, buildPlan: buildPlan, buildGovernanceDecision: buildGovernanceDecision, buildResult: buildResult, buildFailure: buildFailure, buildExecutionContract: buildExecutionContract };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CAC_BUILDERS = API;
})();
