/* AUBS Constitutional Planner v0.1 (Milestone 12) — single entry point.
   The ONLY producer of executable plans. Converts an Intent into a validated DAG of
   constitutional resources + a compiled CAC Plan. The planner decides WHAT; the kernel
   decides WHETHER; the executor decides HOW. It never executes, never reads memory, never
   calls GEL, never writes DecisionRecords. Isolated: the live app does NOT depend on this. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var planner = require("./planner");
    module.exports = {
      buildPlan: planner.buildPlan,
      PLANNER_VERSION: planner.PLANNER_VERSION,
      graph: require("./graph"),
      estimate: require("./estimate").estimate,
      summary: require("./summary").planningSummary,
      plannerRecordFields: require("./record").plannerRecordFields,
      replay: require("./replay-planner")
    };
  } else if (typeof window !== "undefined") {
    var P = window.AUBS_PLANNER || {};
    window.AUBS_PLANNER_API = {
      buildPlan: P.buildPlan, PLANNER_VERSION: P.PLANNER_VERSION,
      graph: window.AUBS_PLANNER_GRAPH,
      estimate: window.AUBS_PLANNER_ESTIMATE && window.AUBS_PLANNER_ESTIMATE.estimate,
      summary: window.AUBS_PLANNER_SUMMARY && window.AUBS_PLANNER_SUMMARY.planningSummary,
      plannerRecordFields: window.AUBS_PLANNER_RECORD && window.AUBS_PLANNER_RECORD.plannerRecordFields,
      replay: window.AUBS_PLANNER_REPLAY
    };
  }
})();
