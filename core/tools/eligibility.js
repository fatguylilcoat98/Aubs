/* ============================================================================
   AUBS Constitutional Tool Framework — tool eligibility (Milestone 10)
   Truth · Safety · We Got Your Back

   Mirrors provider eligibility (M6): a tool may run an operation only if it is
   governed-allowed, contract-valid, enabled, the operation is declared, the required
   permissions are granted, the network/device requirements are met, user confirmation is
   present when required, and the tool is healthy. Any failure → an EXPLICIT reason code.
   No eligibility, no execution.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PERMS = isNode ? require("./permissions") : (typeof window !== "undefined" ? window.AUBS_TOOL_PERMS : null);
  var DRIFT = isNode ? require("./drift-shield") : (typeof window !== "undefined" ? window.AUBS_TOOL_DRIFT : null);

  var REASONS = {
    POLICY_DENIED: "policy_denied", TOOL_INVALID: "tool_invalid", TOOL_DISABLED: "tool_disabled",
    UNKNOWN_OPERATION: "unknown_operation", PERMISSION_DENIED: "permission_denied",
    NETWORK_UNAVAILABLE: "network_unavailable", DEVICE_CAPABILITY_MISSING: "device_capability_missing",
    USER_CONFIRMATION_REQUIRED: "user_confirmation_required", TOOL_UNHEALTHY: "tool_unhealthy"
  };

  function dedupe(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // evaluate({ tool, operation, governance, ctx }) → Promise<{ eligible, reasons, approval_path, missing_permissions }>
  function evaluate(args) {
    args = args || {}; var tool = args.tool, ctx = args.ctx || {}, op = args.operation;
    var reasons = [], missing = [];
    var govOk = !!(args.governance && args.governance.decision === "allow");
    if (!govOk) reasons.push(REASONS.POLICY_DENIED);

    if (!tool) { reasons.push(REASONS.TOOL_INVALID); return Promise.resolve(done(reasons, missing, ctx, null)); }
    var contract = DRIFT.validateTool(tool);
    if (!contract.ok) reasons.push(REASONS.TOOL_INVALID);
    if (tool.enabled === false) reasons.push(REASONS.TOOL_DISABLED);
    if (contract.ok && (tool.supported_operations || []).indexOf(op) === -1) reasons.push(REASONS.UNKNOWN_OPERATION);

    if (contract.ok) {
      var perms = tool.permissions_required || [];
      var hp = PERMS.hasPermissions(perms, ctx.granted_permissions);
      if (!hp.ok) { reasons.push(REASONS.PERMISSION_DENIED); missing = hp.missing; }
      var needNet = tool.requires_network === true || PERMS.needsNetwork(perms);
      if (needNet && ctx.network_available === false) reasons.push(REASONS.NETWORK_UNAVAILABLE);
      var devNeeds = (PERMS.deviceRequirements(perms) || []).concat(tool.device_capabilities || []);
      var devHave = ctx.device_capabilities || [];
      if (devNeeds.some(function (d) { return devHave.indexOf(d) === -1; })) reasons.push(REASONS.DEVICE_CAPABILITY_MISSING);
      if (tool.requires_user_confirmation === true && ctx.user_confirmed !== true) reasons.push(REASONS.USER_CONFIRMATION_REQUIRED);
    }

    reasons = dedupe(reasons);
    // health is the LAST gate, only if nothing else disqualifies (deterministic, no needless probe)
    if (reasons.length === 0) {
      return DRIFT.checkHealth(tool).then(function (h) {
        if (!h.healthy) reasons.push(REASONS.TOOL_UNHEALTHY);
        return done(reasons, missing, ctx, tool);
      });
    }
    return Promise.resolve(done(reasons, missing, ctx, tool));
  }

  function done(reasons, missing, ctx, tool) {
    var approval = (tool && tool.requires_user_confirmation === true)
      ? (ctx.user_confirmed === true ? "user_confirmed" : "awaiting_confirmation")
      : "no_confirmation_required";
    return { eligible: reasons.length === 0, reasons: dedupe(reasons), missing_permissions: missing, approval_path: approval };
  }

  var API = { evaluate: evaluate, REASONS: REASONS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_ELIG = API;
})();
