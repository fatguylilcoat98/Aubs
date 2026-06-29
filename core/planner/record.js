/* ============================================================================
   AUBS Constitutional Planner — DecisionRecord metadata (Milestone 12)
   Truth · Safety · We Got Your Back

   The planner NEVER writes DecisionRecords. But planner metadata becomes part of the
   DecisionRecord the EXECUTOR writes, so there is no hidden planner state. This helper
   produces exactly those fields to fold into a record's explanation.
   ========================================================================== */
(function () {
  "use strict";
  function plannerRecordFields(plannerResult) {
    var p = plannerResult || {}, e = p.estimate || {};
    return {
      planner_version: p.planner_version || null,
      graph_hash: p.graph_hash || null,
      node_count: e.node_count != null ? e.node_count : null,
      estimated_risk: e.estimated_risk || null,
      estimated_egress: e.max_egress || null,
      resource_summary: {
        providers: e.required_providers || [], tools: e.required_tools || [],
        memory_scopes: e.required_memory_scopes || [], permissions: e.required_permissions || []
      }
    };
  }
  var API = { plannerRecordFields: plannerRecordFields };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER_RECORD = API;
})();
