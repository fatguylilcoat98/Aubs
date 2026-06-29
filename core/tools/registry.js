/* ============================================================================
   AUBS Constitutional Tool Framework — registry (Milestone 10)
   Truth · Safety · We Got Your Back

   A deterministic registry of VALIDATED tools. Registration fails closed: duplicate ids,
   invalid contracts, missing metadata, and undeclared-operation tools are rejected. Only
   validated tools are exposed to the kernel.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var DRIFT = isNode ? require("./drift-shield") : (typeof window !== "undefined" ? window.AUBS_TOOL_DRIFT : null);

  function createToolRegistry() {
    var byId = {};

    function registerTool(tool) {
      var v = DRIFT.validateTool(tool);
      if (!v.ok) return { ok: false, error: "invalid tool contract", issues: v.issues };
      if (Object.prototype.hasOwnProperty.call(byId, tool.tool_id)) return { ok: false, error: "duplicate tool_id: " + tool.tool_id };
      byId[tool.tool_id] = tool;
      return { ok: true, tool_id: tool.tool_id };
    }
    function removeTool(id) { if (!Object.prototype.hasOwnProperty.call(byId, id)) return { ok: false, error: "not registered" }; delete byId[id]; return { ok: true, tool_id: id }; }
    function getTool(id) { return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null; }
    function has(id) { return Object.prototype.hasOwnProperty.call(byId, id); }
    function ids() { return Object.keys(byId).sort(); }
    function listTools() { return ids().map(function (id) { return byId[id]; }); }
    function validateTool(tool) { return DRIFT.validateTool(tool); }
    // data-only view (no functions) for GEL/router/UI to inspect
    function describe() {
      return listTools().map(function (t) {
        var m = (typeof t.metadata === "function") ? t.metadata() : {};
        return { tool_id: t.tool_id, tool_type: t.tool_type, version: t.version, enabled: t.enabled !== false, permissions_required: t.permissions_required, requires_network: t.requires_network, requires_user_confirmation: t.requires_user_confirmation, supported_operations: t.supported_operations, metadata: m };
      });
    }

    return {
      registerTool: registerTool, removeTool: removeTool, getTool: getTool, has: has,
      ids: ids, listTools: listTools, validateTool: validateTool, describe: describe,
      get size() { return Object.keys(byId).length; }
    };
  }

  var API = { createToolRegistry: createToolRegistry };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_REGISTRY = API;
})();
