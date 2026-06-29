/* ============================================================================
   AUBS Constitutional Planner — resource estimation (Milestone 12)
   Truth · Safety · We Got Your Back

   Before execution, compute (from graph state only — no model, no randomness) the resources
   a plan will demand: providers, tools, memory scopes, permissions, maximum egress, and the
   estimated risk. These become planner metadata.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var G = isNode ? require("./graph") : (typeof window !== "undefined" ? window.AUBS_PLANNER_GRAPH : null);

  function uniqSort(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o.sort(); }

  function estimate(graph) {
    var nodes = (graph && graph.nodes) || [];
    var providers = [], tools = [], scopes = [], perms = [], maxEgress = "none", maxRisk = "low";
    nodes.forEach(function (n) {
      (n.required_resources || []).forEach(function (r) {
        if (r.indexOf("provider:") === 0) providers.push(r.slice(9));
        else if (r.indexOf("tool:") === 0) tools.push(r.slice(5));
        else if (r.indexOf("memory:") === 0) scopes.push(r.slice(7));
        else if (r.indexOf("permission:") === 0) perms.push(r.slice(11));
      });
      if (G.EGRESS_RANK[n.estimated_egress || "none"] > G.EGRESS_RANK[maxEgress]) maxEgress = n.estimated_egress;
      if (G.RISK.indexOf(n.estimated_risk || "low") > G.RISK.indexOf(maxRisk)) maxRisk = n.estimated_risk || "low";
    });
    var memReads = nodes.filter(function (n) { return n.node_type === "MemoryRead"; }).length;
    return {
      required_providers: uniqSort(providers), required_tools: uniqSort(tools),
      required_memory_scopes: uniqSort(scopes), required_permissions: uniqSort(perms),
      max_egress: maxEgress, estimated_risk: maxRisk,
      node_count: nodes.length, memory_read_count: memReads,
      requires_network: G.EGRESS_RANK[maxEgress] > 0, uses_cloud: providers.length > 0 && G.EGRESS_RANK[maxEgress] > 0
    };
  }

  var API = { estimate: estimate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER_ESTIMATE = API;
})();
