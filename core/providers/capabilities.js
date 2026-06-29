/* ============================================================================
   AUBS Providers — capability format + deterministic eligibility (Milestone 5)
   Truth · Safety · We Got Your Back

   A provider's capabilities are a small, machine-readable record that GEL/router can
   eventually inspect. This milestone only defines the format and the deterministic
   eligibility checks — it does NOT do routing or make cloud calls.

   The kernel speaks CAC; capabilities describe what a provider can carry so a plan can
   be matched to providers WITHOUT provider-specific behavior leaking into the kernel.
   ========================================================================== */
(function () {
  "use strict";

  var PROVIDER_TYPES = ["local", "cloud", "server", "tool", "future"];
  var EGRESS = ["none", "redacted", "full"];
  var EGRESS_RANK = { none: 0, redacted: 1, full: 2 };
  var DATA_CLASSES = ["public", "personal", "sensitive"];
  var COST_CLASS = ["free", "low", "medium", "high"];
  var LATENCY_CLASS = ["low", "medium", "high"];

  // Required capability keys + their validators. Conservative defaults are applied by
  // normalizeCapabilities; validation is strict (Drift Shield rejects anything off-contract).
  var BOOL_KEYS = ["supports_local", "supports_cloud", "requires_network", "supports_streaming",
                   "supports_json", "supports_tools", "zero_retention_claimed", "baa_eligible"];

  function isBool(v) { return v === true || v === false; }
  function inSet(v, set) { return set.indexOf(v) !== -1; }

  // Returns { ok, issues:[...] }. Pure + deterministic. Never throws.
  function validateCapabilities(caps) {
    var issues = [];
    if (!caps || typeof caps !== "object") return { ok: false, issues: [{ key: "capabilities", problem: "missing or not an object" }] };
    BOOL_KEYS.forEach(function (k) { if (!isBool(caps[k])) issues.push({ key: k, problem: "must be boolean" }); });
    if (!inSet(caps.max_egress, EGRESS)) issues.push({ key: "max_egress", problem: "must be one of " + EGRESS.join("/") });
    if (!Array.isArray(caps.data_classes_allowed) || !caps.data_classes_allowed.every(function (c) { return inSet(c, DATA_CLASSES); }))
      issues.push({ key: "data_classes_allowed", problem: "must be an array of " + DATA_CLASSES.join("/") });
    if (typeof caps.region !== "string" || !caps.region) issues.push({ key: "region", problem: "must be a non-empty string" });
    if (!inSet(caps.cost_class, COST_CLASS)) issues.push({ key: "cost_class", problem: "must be one of " + COST_CLASS.join("/") });
    if (!inSet(caps.latency_class, LATENCY_CLASS)) issues.push({ key: "latency_class", problem: "must be one of " + LATENCY_CLASS.join("/") });
    return { ok: issues.length === 0, issues: issues };
  }

  // Type↔capability consistency. A provider that claims capabilities its type can't honour
  // is DRIFT (e.g. a "local" provider that requires the network, or claims egress off-device).
  function validateTypeConsistency(provider_type, caps) {
    var issues = [];
    if (!inSet(provider_type, PROVIDER_TYPES)) return { ok: false, issues: [{ key: "provider_type", problem: "must be one of " + PROVIDER_TYPES.join("/") }] };
    if (!caps) return { ok: false, issues: [{ key: "capabilities", problem: "missing" }] };
    if (provider_type === "local") {
      if (caps.requires_network === true) issues.push({ key: "requires_network", problem: "a local provider must not require the network" });
      if (caps.supports_cloud === true) issues.push({ key: "supports_cloud", problem: "a local provider must not claim cloud support" });
      if (EGRESS_RANK[caps.max_egress] > 0) issues.push({ key: "max_egress", problem: "a local provider must keep max_egress=none" });
      if (caps.supports_local === false) issues.push({ key: "supports_local", problem: "a local provider must support local" });
    }
    if (provider_type === "cloud") {
      if (caps.requires_network === false) issues.push({ key: "requires_network", problem: "a cloud provider requires the network" });
      if (caps.supports_cloud === false) issues.push({ key: "supports_cloud", problem: "a cloud provider must claim cloud support" });
    }
    return { ok: issues.length === 0, issues: issues };
  }

  // Derive the demands a plan+intent place on a provider. Deterministic, no model.
  function planDemands(plan, intent) {
    var steps = (plan && plan.steps) || [];
    var maxEgress = "none";
    steps.forEach(function (s) { if (s.egress && EGRESS_RANK[s.egress] > EGRESS_RANK[maxEgress]) maxEgress = s.egress; });
    var c = (intent && intent.constraints) || {};
    return {
      max_egress: maxEgress,                                   // highest egress any step needs
      leaves_device: EGRESS_RANK[maxEgress] > 0,
      local_only: c.local_only === true,
      data_classification: c.data_classification || "personal",
      requires_user_approval: c.requires_user_approval === true
    };
  }

  // Is a single provider eligible for a plan? Pure capability/constraint check (NO health,
  // NO routing, NO scoring). Returns { eligible, reasons:[...] }. Fail-closed in spirit:
  // anything unmet => not eligible, with a reason.
  function eligibleForPlan(provider, plan, intent) {
    var reasons = [];
    if (!provider) return { eligible: false, reasons: ["no provider"] };
    if (provider.enabled === false) reasons.push("provider disabled");
    var caps = provider.capabilities || {};
    var d = planDemands(plan, intent);

    // local-only / no-egress plans may NOT use cloud providers or anything that leaves the device
    if (d.local_only && provider.provider_type !== "local") reasons.push("plan is local-only; provider is not local");
    if (!d.leaves_device && (provider.provider_type === "cloud" || caps.requires_network === true || caps.supports_cloud === true))
      reasons.push("plan has no egress; provider would use the network/cloud");
    // a plan that DOES leave the device needs a provider whose egress ceiling covers it
    if (d.leaves_device && EGRESS_RANK[caps.max_egress] < EGRESS_RANK[d.max_egress]) reasons.push("provider max_egress below plan demand");
    if (d.leaves_device && d.local_only) reasons.push("contradiction: local-only plan demands egress");
    // sensitive data requires the provider to explicitly allow that data class
    if ((caps.data_classes_allowed || []).indexOf(d.data_classification) === -1) reasons.push("provider does not allow data class '" + d.data_classification + "'");

    return { eligible: reasons.length === 0, reasons: reasons };
  }

  var API = {
    PROVIDER_TYPES: PROVIDER_TYPES, EGRESS: EGRESS, EGRESS_RANK: EGRESS_RANK, DATA_CLASSES: DATA_CLASSES,
    COST_CLASS: COST_CLASS, LATENCY_CLASS: LATENCY_CLASS, BOOL_KEYS: BOOL_KEYS,
    validateCapabilities: validateCapabilities, validateTypeConsistency: validateTypeConsistency,
    planDemands: planDemands, eligibleForPlan: eligibleForPlan
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_CAPS = API;
})();
