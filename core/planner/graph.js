/* ============================================================================
   AUBS Constitutional Planner — planning DAG: validation + hashing (Milestone 12)
   Truth · Safety · We Got Your Back

   An explicit directed acyclic graph of planning nodes. The planner decides WHAT should
   happen; the kernel decides WHETHER; the executor decides HOW. The graph is validated
   FAIL-CLOSED (cycles, unknown types, duplicate ids, orphans, illegal dependencies, and
   resource/permission/provider/tool/memory conflicts) and hashed structurally so the same
   Intent + Context + Config always yields a byte-identical plan.
   ========================================================================== */
(function () {
  "use strict";

  var NODE_TYPES = ["MemoryRead", "Retrieve", "Skill", "Tool", "Provider", "Deterministic", "Answer", "Refusal"];
  // nodes that may be graph roots (nothing depends on them) without being "orphans"
  var ROOT_TYPES = ["Answer", "Refusal"];
  var EGRESS_RANK = { none: 0, redacted: 1, full: 2 };
  var RISK = ["low", "medium", "high", "critical"];

  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") { var k = Object.keys(v).sort(); return "{" + k.map(function (x) { return JSON.stringify(x) + ":" + canon(v[x]); }).join(",") + "}"; }
    return JSON.stringify(v === undefined ? null : v);
  }
  // structural node view (excludes mutable status) → deterministic hash input
  function nodeView(n) {
    return { node_id: n.node_id, node_type: n.node_type, dependencies: (n.dependencies || []).slice().sort(), required_resources: (n.required_resources || []).slice().sort(), estimated_risk: n.estimated_risk || null, estimated_egress: n.estimated_egress || "none" };
  }
  function graphHash(graph) {
    var nodes = ((graph && graph.nodes) || []).map(nodeView).sort(function (a, b) { return a.node_id < b.node_id ? -1 : a.node_id > b.node_id ? 1 : 0; });
    var s = canon({ planner_version: graph && graph.planner_version, nodes: nodes });
    var h = 0x811c9dc5 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return "g_" + ("00000000" + h.toString(16)).slice(-8);
  }

  // Kahn topological order; returns { ok, order:[ids], cycle:bool }
  function topoOrder(nodes) {
    var byId = {}, indeg = {}, adj = {};
    nodes.forEach(function (n) { byId[n.node_id] = n; indeg[n.node_id] = 0; adj[n.node_id] = []; });
    nodes.forEach(function (n) { (n.dependencies || []).forEach(function (d) { if (adj[d]) { adj[d].push(n.node_id); indeg[n.node_id]++; } }); });
    var q = Object.keys(indeg).filter(function (id) { return indeg[id] === 0; }).sort(), order = [];
    while (q.length) {
      var id = q.shift(); order.push(id);
      adj[id].forEach(function (m) { if (--indeg[m] === 0) { q.push(m); q.sort(); } });
    }
    return { ok: order.length === nodes.length, order: order, cycle: order.length !== nodes.length };
  }

  // validateGraph(graph, opts?) → { ok, errors:[{type, ...}] }. opts.skill / opts.intent enable
  // conflict checks against the declared capability + the intent constraints.
  function validateGraph(graph, opts) {
    opts = opts || {}; var errors = [];
    var nodes = (graph && graph.nodes) || [];
    if (!Array.isArray(nodes)) return { ok: false, errors: [{ type: "invalid_graph" }] };

    var seen = {};
    nodes.forEach(function (n) {
      if (!n || typeof n.node_id !== "string") { errors.push({ type: "invalid_node" }); return; }
      if (seen[n.node_id]) errors.push({ type: "duplicate_id", node_id: n.node_id });
      seen[n.node_id] = true;
      if (NODE_TYPES.indexOf(n.node_type) === -1) errors.push({ type: "unknown_node_type", node_id: n.node_id, node_type: n.node_type });
    });
    // illegal dependency: a dependency referencing an undefined node
    nodes.forEach(function (n) { (n.dependencies || []).forEach(function (d) { if (!seen[d]) errors.push({ type: "illegal_dependency", node_id: n.node_id, missing: d }); }); });
    // cycle
    if (topoOrder(nodes).cycle) errors.push({ type: "cycle" });
    // orphan: a non-root node that nothing depends on
    var dependedOn = {}; nodes.forEach(function (n) { (n.dependencies || []).forEach(function (d) { dependedOn[d] = true; }); });
    nodes.forEach(function (n) { if (ROOT_TYPES.indexOf(n.node_type) === -1 && !dependedOn[n.node_id]) errors.push({ type: "orphan_node", node_id: n.node_id }); });

    // conflicts vs the declared capability + intent constraints (optional)
    if (opts.skill) {
      var sk = opts.skill;
      nodes.forEach(function (n) {
        (n.required_resources || []).forEach(function (r) {
          if (r.indexOf("provider:") === 0 && (sk.allowed_providers || []).indexOf(r.slice(9)) === -1) errors.push({ type: "provider_conflict", node_id: n.node_id, resource: r });
          if (r.indexOf("tool:") === 0 && (sk.allowed_tools || []).indexOf(r.slice(5)) === -1) errors.push({ type: "tool_conflict", node_id: n.node_id, resource: r });
          if (r.indexOf("memory:") === 0 && (sk.allowed_memory_scopes || []).indexOf(r.slice(7)) === -1) errors.push({ type: "memory_conflict", node_id: n.node_id, resource: r });
          if (r.indexOf("permission:") === 0 && (sk.required_permissions || []).indexOf(r.slice(11)) === -1) errors.push({ type: "permission_conflict", node_id: n.node_id, resource: r });
        });
      });
    }
    if (opts.intent && opts.intent.constraints) {
      var cap = opts.intent.constraints.max_egress || "none";
      nodes.forEach(function (n) { if (EGRESS_RANK[n.estimated_egress || "none"] > EGRESS_RANK[cap]) errors.push({ type: "resource_conflict", node_id: n.node_id, detail: "egress exceeds intent max_egress" }); });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  var API = { NODE_TYPES: NODE_TYPES, ROOT_TYPES: ROOT_TYPES, RISK: RISK, EGRESS_RANK: EGRESS_RANK, validateGraph: validateGraph, graphHash: graphHash, topoOrder: topoOrder, nodeView: nodeView };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER_GRAPH = API;
})();
