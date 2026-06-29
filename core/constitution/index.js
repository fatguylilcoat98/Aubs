/* AUBS Constitutional Integration v0.1 (Milestone 13) — "One Spine".
   One orchestrator runs a request through every subsystem in order, writing exactly one
   DecisionRecord. Plus the canonical dependency graph, the architectural audit, and the
   "Explain Constitution" developer command. Integration only — no new behavior. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = {
      runConstitutionalRequest: require("./pipeline").runConstitutionalRequest,
      graph: require("./graph"),
      audit: require("./audit"),
      explainConstitution: require("./explain").explainConstitution
    };
  } else if (typeof window !== "undefined") {
    var P = window.AUBS_CONSTITUTION_PIPELINE || {}, E = window.AUBS_CONSTITUTION_EXPLAIN || {};
    window.AUBS_CONSTITUTION = {
      runConstitutionalRequest: P.runConstitutionalRequest,
      graph: window.AUBS_CONSTITUTION_GRAPH, audit: window.AUBS_CONSTITUTION_AUDIT,
      explainConstitution: E.explainConstitution
    };
  }
})();
