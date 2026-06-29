/* ============================================================================
   AUBS Constitutional Skills Framework — skill eligibility (M11)
   Truth · Safety · We Got Your Back

   A skill is eligible only if its manifest is valid, GEL allows the plan, and EVERY
   resource it requests is itself eligible: required providers (M6), required tools (M10),
   allowed memory scopes (M9), network + user-confirmation requirements, and a permitted
   risk level. Any failure → an explicit reason and the offending resource is recorded as
   blocked. No eligibility, no execution.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var TOOL_ELIG = isNode ? require("../tools/eligibility")     : (typeof window !== "undefined" ? window.AUBS_TOOL_ELIG : null);
  var PROV_ELIG = isNode ? require("../providers/eligibility") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_ELIG : null);
  var CAC       = isNode ? require("../cac")                   : (typeof window !== "undefined" ? window.AUBS_CAC : null);

  var RISK = ["low", "medium", "high", "critical"];
  var REASONS = {
    SKILL_INVALID: "skill_invalid", POLICY_DENIED: "policy_denied", RISK_LEVEL_DENIED: "risk_level_denied",
    NETWORK_UNAVAILABLE: "network_unavailable", USER_CONFIRMATION_REQUIRED: "user_confirmation_required",
    MEMORY_SCOPE_DENIED: "memory_scope_denied", TOOL_DENIED: "tool_denied", PROVIDER_DENIED: "provider_denied",
    UNKNOWN_TOOL: "unknown_tool", UNKNOWN_PROVIDER: "unknown_provider"
  };
  function dedupe(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // evaluate({ skill, operation, governance, ctx, toolRegistry, providerRegistry }) → Promise
  async function evaluate(args) {
    args = args || {}; var skill = args.skill, ctx = args.ctx || {}, gov = args.governance;
    var reasons = [], approved = [], blocked = [];
    if (!skill) { reasons.push(REASONS.SKILL_INVALID); return done(reasons, approved, blocked, ctx, null); }
    if (!gov || gov.decision !== "allow") reasons.push(REASONS.POLICY_DENIED);

    // risk level
    var maxRisk = ctx.max_risk_level || "high";
    if (RISK.indexOf(skill.risk_level) > RISK.indexOf(maxRisk)) reasons.push(REASONS.RISK_LEVEL_DENIED);
    // network + confirmation
    if (skill.requires_network === true && ctx.network_available === false) reasons.push(REASONS.NETWORK_UNAVAILABLE);
    if (skill.requires_user_confirmation === true && ctx.user_confirmed !== true) reasons.push(REASONS.USER_CONFIRMATION_REQUIRED);

    // memory scopes
    var allowedScopes = ctx.memory_scopes_allowed || [];
    (skill.allowed_memory_scopes || []).forEach(function (s) {
      if (allowedScopes.indexOf(s) === -1) { reasons.push(REASONS.MEMORY_SCOPE_DENIED); blocked.push({ resource: "memory:" + s, reason: REASONS.MEMORY_SCOPE_DENIED }); }
      else approved.push({ resource: "memory:" + s });
    });

    // tools (each declared tool must itself be eligible)
    var tools = skill.allowed_tools || [];
    for (var i = 0; i < tools.length; i++) {
      var id = tools[i];
      var tool = (args.toolRegistry && args.toolRegistry.getTool) ? args.toolRegistry.getTool(id) : null;
      if (!tool) { reasons.push(REASONS.UNKNOWN_TOOL); blocked.push({ resource: "tool:" + id, reason: REASONS.UNKNOWN_TOOL }); continue; }
      var te = await TOOL_ELIG.evaluate({ tool: tool, operation: tool.supported_operations[0], governance: { decision: "allow" }, ctx: ctx });
      if (!te.eligible) { reasons.push(REASONS.TOOL_DENIED); blocked.push({ resource: "tool:" + id, reason: te.reasons[0] || "ineligible" }); }
      else approved.push({ resource: "tool:" + id });
    }

    // providers (each declared provider must be eligible for the skill's egress profile)
    var provs = skill.allowed_providers || [];
    if (provs.length) {
      var net = skill.requires_network === true;
      var pIntent = CAC.builders.buildIntent("skill-provider", { constraints: { data_classification: net ? "public" : "personal", local_only: !net, max_egress: net ? "full" : "none" } });
      var pPlan = CAC.builders.buildPlan(pIntent, [{ step_type: "model_call", target: "provider", egress: net ? "full" : "none" }], {});
      var eligibleIds = [];
      if (args.providerRegistry) { var pe = await PROV_ELIG.evaluate({ intent: pIntent, plan: pPlan, governance: { decision: "allow" }, registry: args.providerRegistry }); eligibleIds = pe.eligible.map(function (x) { return x.provider_id; }); }
      provs.forEach(function (id) {
        if (!args.providerRegistry || !args.providerRegistry.has(id)) { reasons.push(REASONS.UNKNOWN_PROVIDER); blocked.push({ resource: "provider:" + id, reason: REASONS.UNKNOWN_PROVIDER }); }
        else if (eligibleIds.indexOf(id) === -1) { reasons.push(REASONS.PROVIDER_DENIED); blocked.push({ resource: "provider:" + id, reason: REASONS.PROVIDER_DENIED }); }
        else approved.push({ resource: "provider:" + id });
      });
    }

    return done(dedupe(reasons), approved, blocked, ctx, skill);
  }

  function done(reasons, approved, blocked, ctx, skill) {
    var approval = (skill && skill.requires_user_confirmation === true) ? (ctx.user_confirmed === true ? "user_confirmed" : "awaiting_confirmation") : "no_confirmation_required";
    return { eligible: reasons.length === 0, reasons: dedupe(reasons), approved_resources: approved, blocked_resources: blocked, approval_path: approval };
  }

  var API = { evaluate: evaluate, REASONS: REASONS, RISK: RISK };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_ELIG = API;
})();
