/* ============================================================================
   AUBS Constitutional Tool Framework — tool replay / drift (Milestone 10)
   Truth · Safety · We Got Your Back

   A tool execution is replayable: capture what the tool looked like at decision time, then
   later detect — WITHOUT re-executing the tool and WITHOUT side effects — whether the tool
   was removed, its permissions/version changed, the operation was removed, its health
   changed, or policy drifted. Composes with M7 (record verification proves authenticity).
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var DRIFT = isNode ? require("./drift-shield") : (typeof window !== "undefined" ? window.AUBS_TOOL_DRIFT : null);
  var GEL   = isNode ? require("../gel")         : (typeof window !== "undefined" ? window.AUBS_GEL : null);

  // Build replay evidence from an executeTool() result (reads the recorded explanation).
  function captureToolEvidence(execResult) {
    var rec = (execResult && execResult.record) || {};
    var e = rec.explanation || {};
    return {
      tool_id: e.tool_id, tool_version: e.tool_version, operation: e.operation,
      permissions_required: (e.permission_set || []).slice(),
      supported_operations: (e.supported_operations || []).slice(),
      policy_version: rec.policy_version || null
    };
  }
  function sameArr(a, b) { return JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort()); }

  // compareTool(evidence, { registry, currentBundle, checkHealth }) → Promise<{status, reasons, diffs}>.
  // NEVER calls execute(); health is a read-only probe and can be disabled.
  function compareTool(evidence, opts) {
    opts = opts || {}; var reasons = {}, diffs = [];
    function add(r, d) { reasons[r] = true; diffs.push(d); }
    var cur = (opts.registry && opts.registry.getTool) ? opts.registry.getTool(evidence.tool_id) : null;

    var policyP = Promise.resolve();
    if (opts.currentBundle && GEL && GEL.bundleHash && evidence.policy_version) {
      if (GEL.bundleHash(opts.currentBundle) !== evidence.policy_version) add("policy_drift", { change: "policy", from: evidence.policy_version, to: GEL.bundleHash(opts.currentBundle) });
    }

    if (!cur) { add("tool_removed", { tool_id: evidence.tool_id, change: "removed" }); return finish(); }
    if (cur.version !== evidence.tool_version) add("tool_version_changed", { from: evidence.tool_version, to: cur.version });
    if (!sameArr(cur.permissions_required, evidence.permissions_required)) add("permission_changed", { from: evidence.permissions_required, to: cur.permissions_required });
    if ((cur.supported_operations || []).indexOf(evidence.operation) === -1) add("operation_removed", { operation: evidence.operation });

    if (opts.checkHealth === false) return finish();
    return DRIFT.checkHealth(cur).then(function (h) { if (!h.healthy) add("health_changed", { change: "unhealthy" }); return finish(); });

    function finish() {
      var list = Object.keys(reasons);
      return Promise.resolve({ status: list.length ? "DRIFT" : "MATCH", reasons: list, diffs: diffs });
    }
  }

  var API = { captureToolEvidence: captureToolEvidence, compareTool: compareTool };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_REPLAY = API;
})();
