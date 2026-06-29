/* AUBS Kernel v0.1 (Milestone 3) — single entry point.
   Intent → Plan → GEL → execute/deny → Result/Failure → DecisionRecord → Level 1.
   Isolated: the live app does NOT depend on this yet. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = {
      executeIntent: require("./execute").executeIntent,
      KERNEL_VERSION: require("./execute").KERNEL_VERSION,
      planBuilder: require("./plan-builder"),
      adapters: require("./adapters"),
      explanation: require("./explanation")
    };
  } else if (typeof window !== "undefined") {
    window.AUBS_KERNEL = {
      executeIntent: window.AUBS_KERNEL_EXECUTE && window.AUBS_KERNEL_EXECUTE.executeIntent,
      planBuilder: window.AUBS_KERNEL_PLAN,
      adapters: window.AUBS_KERNEL_ADAPTERS,
      explanation: window.AUBS_KERNEL_EXPLANATION
    };
  }
})();
