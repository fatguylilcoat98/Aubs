/* ============================================================================
   AUBS Constitutional Tool Framework — Drift Shield (Milestone 10)
   Truth · Safety · We Got Your Back

   Tools are untrusted capabilities. The Drift Shield validates the tool CONTRACT at
   registration and the tool RESULT at runtime, and it FAILS CLOSED. A tool that violates
   its contract, exposes an undeclared operation, throws, or returns a malformed result
   becomes an explicit tool_drift failure — the kernel never sees raw or bad output.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PERMS = isNode ? require("./permissions") : (typeof window !== "undefined" ? window.AUBS_TOOL_PERMS : null);

  var TOOL_TYPES = ["filesystem", "calendar", "contacts", "camera", "microphone", "http", "websocket", "shell", "database", "mcp", "future"];
  var RESULT_STATUSES = ["success", "partial", "failure"];   // what a tool may RETURN (blocked is decided before it runs)

  function validateTool(tool) {
    var issues = [];
    if (!tool || typeof tool !== "object") return { ok: false, issues: [{ key: "tool", problem: "missing or not an object" }] };
    if (typeof tool.tool_id !== "string" || !tool.tool_id) issues.push({ key: "tool_id", problem: "non-empty string required" });
    if (TOOL_TYPES.indexOf(tool.tool_type) === -1) issues.push({ key: "tool_type", problem: "must be one of " + TOOL_TYPES.join("/") });
    if (typeof tool.version !== "string" || !tool.version) issues.push({ key: "version", problem: "non-empty string required" });
    if (tool.requires_network !== true && tool.requires_network !== false) issues.push({ key: "requires_network", problem: "boolean required" });
    if (tool.requires_user_confirmation !== true && tool.requires_user_confirmation !== false) issues.push({ key: "requires_user_confirmation", problem: "boolean required" });
    if (!Array.isArray(tool.supported_operations) || tool.supported_operations.length === 0) issues.push({ key: "supported_operations", problem: "non-empty array required (no arbitrary methods)" });
    var pv = PERMS.validatePermissions(tool.permissions_required);
    if (!pv.ok) issues.push({ key: "permissions_required", problem: "unknown permissions: " + pv.invalid.join(",") });
    if (typeof tool.healthCheck !== "function") issues.push({ key: "healthCheck", problem: "must be a function" });
    if (typeof tool.execute !== "function") issues.push({ key: "execute", problem: "must be a function" });
    if (typeof tool.metadata !== "function") issues.push({ key: "metadata", problem: "must be a function" });
    return { ok: issues.length === 0, issues: issues };
  }

  // normalized tool result: { status:"success"|"partial", output_text, output_classification }
  //                       | { status:"failure", message, output_classification? }
  function validateToolResult(resp) {
    var issues = [];
    if (!resp || typeof resp !== "object") return { ok: false, issues: [{ key: "result", problem: "missing or not an object" }] };
    if (RESULT_STATUSES.indexOf(resp.status) === -1) issues.push({ key: "status", problem: "must be success/partial/failure" });
    if (resp.status === "success" || resp.status === "partial") {
      if (typeof resp.output_text !== "string") issues.push({ key: "output_text", problem: "success/partial must include output_text string" });
      if (typeof resp.output_classification !== "string" || !resp.output_classification) issues.push({ key: "output_classification", problem: "must classify the output (no raw payload leakage)" });
    } else if (resp.status === "failure") {
      if (typeof resp.message !== "string" || !resp.message) issues.push({ key: "message", problem: "failure must include a message" });
    }
    return { ok: issues.length === 0, issues: issues };
  }

  function driftFailure(tool_id, issues) {
    return { status: "failure", drift: true, tool_drift: true, message: "tool '" + (tool_id || "?") + "' drifted from contract: " + (issues || []).map(function (i) { return i.key + " (" + i.problem + ")"; }).join("; "), output_classification: "none", issues: issues || [] };
  }

  // Run a tool's declared operation behind the shield. Any drift becomes an explicit failure.
  function runGuarded(tool, operation, args, ctx) {
    return Promise.resolve()
      .then(function () {
        var c = validateTool(tool);
        if (!c.ok) return driftFailure(tool && tool.tool_id, c.issues);
        if (tool.supported_operations.indexOf(operation) === -1) return driftFailure(tool.tool_id, [{ key: "operation", problem: "undeclared operation '" + operation + "'" }]);
        return Promise.resolve(tool.execute(operation, args, ctx)).then(function (resp) {
          var v = validateToolResult(resp);
          if (!v.ok) return driftFailure(tool.tool_id, v.issues);
          return resp;
        });
      })
      .catch(function (e) { return driftFailure(tool && tool.tool_id, [{ key: "execute", problem: "threw: " + ((e && e.message) ? e.message : String(e)) }]); });
  }

  function checkHealth(tool) {
    return Promise.resolve().then(function () { return tool.healthCheck(); })
      .then(function (h) { return { healthy: !!(h && h.ok === true), detail: h || null }; })
      .catch(function (e) { return { healthy: false, detail: { ok: false, error: (e && e.message) ? e.message : String(e) } }; });
  }

  var API = { TOOL_TYPES: TOOL_TYPES, RESULT_STATUSES: RESULT_STATUSES, validateTool: validateTool, validateToolResult: validateToolResult, driftFailure: driftFailure, runGuarded: runGuarded, checkHealth: checkHealth };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_DRIFT = API;
})();
