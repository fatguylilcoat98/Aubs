/* ============================================================================
   AUBS Constitutional Planner — planning summary (Milestone 12)
   Truth · Safety · We Got Your Back

   A human-readable summary derived ONLY from graph state — never model-generated. It states
   what the request will require, before anything executes.
   ========================================================================== */
(function () {
  "use strict";

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function planningSummary(graph, estimate) {
    var e = estimate || {};
    var lines = [];
    if ((e.required_providers || []).length) lines.push(plural(e.required_providers.length, "provider"));
    if (e.memory_read_count) lines.push(plural(e.memory_read_count, "memory read"));
    if ((e.required_tools || []).length) lines.push(plural(e.required_tools.length, "tool"));
    if ((e.required_permissions || []).length) lines.push(plural(e.required_permissions.length, "permission"));
    var net = e.requires_network ? "Network: required" : "No network";
    var cloud = e.uses_cloud ? "Cloud: yes" : "No cloud";
    var risk = (e.estimated_risk || "low").charAt(0).toUpperCase() + (e.estimated_risk || "low").slice(1) + " risk";
    var d = {
      requires: lines.length ? lines : ["nothing external"],
      network: net, cloud: cloud, risk: risk, egress: e.max_egress || "none", node_count: e.node_count || 0
    };
    d.text = "This request requires:\n" + d.requires.map(function (l) { return "  - " + l; }).join("\n") + "\n" + net + "\n" + cloud + "\n" + risk + ".";
    return d;
  }

  var API = { planningSummary: planningSummary };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER_SUMMARY = API;
})();
