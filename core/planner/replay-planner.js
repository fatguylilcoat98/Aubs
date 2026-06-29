/* ============================================================================
   AUBS Constitutional Planner — planner replay / drift (Milestone 12)
   Truth · Safety · We Got Your Back

   Replay the PLANNER ONLY — no execution. Rebuild the DAG from the same Intent + Context +
   Config and compare to the recorded plan STRUCTURALLY (never semantic guesses). Detects
   planning drift, dependency drift, resource drift, skill drift, and planner version drift.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PLANNER = isNode ? require("./planner") : (typeof window !== "undefined" ? window.AUBS_PLANNER : null);

  function capturePlannerEvidence(plannerResult, ctx) {
    ctx = ctx || {};
    return {
      planner_version: plannerResult.planner_version, graph_hash: plannerResult.graph_hash,
      node_count: plannerResult.estimate.node_count, estimate: plannerResult.estimate,
      skill_version: plannerResult.estimate.skill_version || null,
      dependency_map: depMap(plannerResult.graph), node_types: typeMap(plannerResult.graph),
      intent: ctx.intent, config: ctx.config
    };
  }
  function depMap(graph) { var m = {}; ((graph && graph.nodes) || []).forEach(function (n) { m[n.node_id] = (n.dependencies || []).slice().sort(); }); return m; }
  function typeMap(graph) { var m = {}; ((graph && graph.nodes) || []).forEach(function (n) { m[n.node_id] = n.node_type; }); return m; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // replayPlanner(evidence, { context }) → { status, reasons, diffs }. Rebuilds deterministically.
  function replayPlanner(evidence, opts) {
    opts = opts || {};
    var rebuilt = PLANNER.buildPlan(evidence.intent, opts.context || {}, evidence.config || {});
    var reasons = {}, diffs = [];
    function add(r, d) { reasons[r] = true; if (d) diffs.push(d); }

    if (!rebuilt.ok) { add("planning_failed", { error: rebuilt.error, errors: rebuilt.errors }); return finish(); }
    if (rebuilt.planner_version !== evidence.planner_version) add("planner_version_drift", { from: evidence.planner_version, to: rebuilt.planner_version });
    if (rebuilt.graph_hash !== evidence.graph_hash) add("planning_drift", { from: evidence.graph_hash, to: rebuilt.graph_hash });
    if (!same(depMap(rebuilt.graph), evidence.dependency_map)) add("dependency_drift");
    var newResources = { providers: rebuilt.estimate.required_providers, tools: rebuilt.estimate.required_tools, memory_scopes: rebuilt.estimate.required_memory_scopes, permissions: rebuilt.estimate.required_permissions };
    var oldResources = { providers: evidence.estimate.required_providers, tools: evidence.estimate.required_tools, memory_scopes: evidence.estimate.required_memory_scopes, permissions: evidence.estimate.required_permissions };
    if (!same(newResources, oldResources)) add("resource_drift", { from: oldResources, to: newResources });
    if ((rebuilt.estimate.skill_version || null) !== (evidence.skill_version || null)) add("skill_drift", { from: evidence.skill_version, to: rebuilt.estimate.skill_version });
    return finish();

    function finish() { var list = Object.keys(reasons); return { status: list.length ? "DRIFT" : "MATCH", reasons: list, diffs: diffs, rebuilt_hash: rebuilt.ok ? rebuilt.graph_hash : null }; }
  }

  var API = { capturePlannerEvidence: capturePlannerEvidence, replayPlanner: replayPlanner };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER_REPLAY = API;
})();
