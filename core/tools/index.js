/* AUBS Constitutional Tool Framework v0.1 (Milestone 10) — single entry point.
   Every external capability is a governed resource: contract → registry → drift shield →
   GEL → eligibility → execution → DecisionRecord → replay. Models request; the kernel
   decides. Isolated: the live app does NOT depend on this. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = {
      permissions: require("./permissions"),
      drift: require("./drift-shield"),
      eligibility: require("./eligibility"),
      explanation: require("./explanation"),
      replay: require("./replay-tool"),
      createToolRegistry: require("./registry").createToolRegistry,
      executeTool: require("./execute").executeTool,
      classifyArgs: require("./execute").classifyArgs,
      fakes: require("./fake-tools"),
      schema: require("./tool.schema.json")
    };
  } else if (typeof window !== "undefined") {
    var R = window.AUBS_TOOL_REGISTRY || {}, X = window.AUBS_TOOL_EXECUTE || {};
    window.AUBS_TOOLS = {
      permissions: window.AUBS_TOOL_PERMS, drift: window.AUBS_TOOL_DRIFT,
      eligibility: window.AUBS_TOOL_ELIG, explanation: window.AUBS_TOOL_EXPL, replay: window.AUBS_TOOL_REPLAY,
      createToolRegistry: R.createToolRegistry, executeTool: X.executeTool, classifyArgs: X.classifyArgs,
      fakes: window.AUBS_TOOL_FAKES
    };
  }
})();
