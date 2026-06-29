/* ============================================================================
   AUBS Providers — policy-governed eligibility engine (Milestone 6)
   Truth · Safety · We Got Your Back

   "Is this provider ALLOWED for this plan, under the user's constraints and policy?"
   — NOT "which provider is best?". Eligibility before selection. Policy before preference.

   A provider is eligible only if it is, in order: governed-allowed, valid under the
   Provider Contract, enabled, compatible with the Plan's egress, compatible with the
   Intent's constraints (local-only / data class), capable of the step, and healthy.
   Any failure yields an EXPLICIT reason code. No silent fallback, no hidden choice.

   Selection (this milestone) is deterministic and boring: of the eligible set, take the
   lowest provider_id. Scoring / quality / latency / cost ranking is explicitly future work.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAPS  = isNode ? require("./capabilities") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_CAPS : null);
  var DRIFT = isNode ? require("./drift-shield") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_DRIFT : null);

  // explicit, stable reason codes (documented in AUBS_PROVIDER_ELIGIBILITY_M6.md)
  var REASONS = {
    GOVERNANCE_DENIED: "governance_denied",
    PROVIDER_INVALID: "provider_invalid",
    PROVIDER_DISABLED: "provider_disabled",
    REQUIRES_NETWORK_BUT_LOCAL_ONLY: "requires_network_but_local_only",
    EGRESS_NOT_ALLOWED: "egress_not_allowed",
    DATA_CLASS_NOT_ALLOWED: "data_class_not_allowed",
    UNSUPPORTED_STEP_TYPE: "unsupported_step_type",
    PROVIDER_UNHEALTHY: "provider_unhealthy",
    NO_MATCHING_PROVIDER: "no_matching_provider"
  };

  function terminalStepType(plan) {
    var steps = (plan && plan.steps) || [];
    var order = ["refusal", "tool_call", "model_call", "deterministic_answer"];
    for (var i = 0; i < order.length; i++) { for (var j = 0; j < steps.length; j++) { if (steps[j].step_type === order[i]) return order[i]; } }
    return "model_call";
  }
  function dedupe(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  // Per-provider capability/constraint reasons (no governance, no health). Pure + deterministic.
  function constraintReasons(provider, plan, intent) {
    var reasons = [];
    var caps = provider.capabilities || {};
    var d = CAPS.planDemands(plan, intent);
    var stepType = terminalStepType(plan);
    if (d.local_only && (provider.provider_type !== "local" || caps.requires_network === true || caps.supports_cloud === true)) reasons.push(REASONS.REQUIRES_NETWORK_BUT_LOCAL_ONLY);
    if (!d.leaves_device && (provider.provider_type === "cloud" || caps.requires_network === true || caps.supports_cloud === true)) reasons.push(REASONS.EGRESS_NOT_ALLOWED);
    if (d.leaves_device && CAPS.EGRESS_RANK[caps.max_egress] < CAPS.EGRESS_RANK[d.max_egress]) reasons.push(REASONS.EGRESS_NOT_ALLOWED);
    if ((caps.data_classes_allowed || []).indexOf(d.data_classification) === -1) reasons.push(REASONS.DATA_CLASS_NOT_ALLOWED);
    if (stepType === "tool_call" && caps.supports_tools !== true) reasons.push(REASONS.UNSUPPORTED_STEP_TYPE);
    return dedupe(reasons);
  }

  // The eligibility engine. args: { intent, plan, governance, registry, options }.
  // Returns a Promise of:
  //   { governance_ok, eligible:[{provider_id,provider_type}], eligible_providers:[...full],
  //     rejected:[{provider_id,provider_type,reasons:[...]}], selected, summary:{...} }
  function evaluate(args) {
    args = args || {};
    var registry = args.registry;
    var governance = args.governance;
    var govOk = !!(governance && governance.decision === "allow");
    var providers = registry && registry.list ? registry.list() : [];   // validated, sorted by id

    return Promise.all(providers.map(function (p) {
      var reasons = [];
      if (!govOk) reasons.push(REASONS.GOVERNANCE_DENIED);
      var contract = DRIFT.validateProvider(p);
      if (!contract.ok) reasons.push(REASONS.PROVIDER_INVALID);
      if (p.enabled === false) reasons.push(REASONS.PROVIDER_DISABLED);
      if (contract.ok) reasons = reasons.concat(constraintReasons(p, args.plan, args.intent));
      reasons = dedupe(reasons);
      // health is the LAST gate, and only checked if nothing else disqualifies — keeps the
      // result deterministic and avoids pinging an already-ineligible provider.
      if (reasons.length === 0) {
        return DRIFT.checkHealth(p).then(function (h) {
          if (!h.healthy) reasons.push(REASONS.PROVIDER_UNHEALTHY);
          return { p: p, reasons: reasons };
        });
      }
      return Promise.resolve({ p: p, reasons: reasons });
    })).then(function (rows) {
      var eligible = [], rejected = [];
      rows.forEach(function (r) {
        if (r.reasons.length === 0) eligible.push(r.p);
        else rejected.push({ provider_id: r.p.provider_id, provider_type: r.p.provider_type, reasons: r.reasons });
      });
      eligible.sort(function (a, b) { return a.provider_id < b.provider_id ? -1 : a.provider_id > b.provider_id ? 1 : 0; });
      var selected = eligible.length ? eligible[0].provider_id : null;
      var reason = !govOk ? REASONS.GOVERNANCE_DENIED : (eligible.length ? "ok" : REASONS.NO_MATCHING_PROVIDER);
      return {
        governance_ok: govOk,
        eligible: eligible.map(function (p) { return { provider_id: p.provider_id, provider_type: p.provider_type }; }),
        eligible_providers: eligible,
        rejected: rejected,
        selected: selected,
        summary: { eligible_count: eligible.length, rejected_count: rejected.length, reason: reason }
      };
    });
  }

  var API = { evaluate: evaluate, REASONS: REASONS, terminalStepType: terminalStepType, constraintReasons: constraintReasons };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_ELIG = API;
})();
