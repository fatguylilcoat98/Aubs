/* ============================================================================
   AUBS Constitutional Integration — the One-Spine dependency graph (Milestone 13)
   Truth · Safety · We Got Your Back

   The canonical, machine-readable order every constitutional request follows. Each stage
   depends on exactly the previous one — a linear DAG. Reuses the M12 graph validator so a
   cycle (or any structural break) FAILS the architectural audit. No alternate paths.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var G = isNode ? require("../planner/graph") : (typeof window !== "undefined" ? window.AUBS_PLANNER_GRAPH : null);

  var STAGES = ["Intent", "CAC", "Plan", "GEL", "Eligibility", "Execution", "Memory", "Tools", "Grounding", "DecisionRecord", "Ledger", "Replay", "Explanation"];

  function pipelineGraph() {
    var nodes = STAGES.map(function (s, i) {
      return { node_id: s, node_type: (i === STAGES.length - 1) ? "Answer" : "Deterministic", dependencies: i ? [STAGES[i - 1]] : [], required_resources: [], estimated_risk: "low", estimated_egress: "none", status: "planned" };
    });
    return { planner_version: "constitution-0.1", nodes: nodes };
  }
  function validate(graph) { return G.validateGraph(graph || pipelineGraph()); }
  function graphHash(graph) { return G.graphHash(graph || pipelineGraph()); }

  var API = { STAGES: STAGES, pipelineGraph: pipelineGraph, validate: validate, graphHash: graphHash };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONSTITUTION_GRAPH = API;
})();
