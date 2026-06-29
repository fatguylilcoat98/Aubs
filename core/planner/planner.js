/* ============================================================================
   AUBS Constitutional Planner — the planner (Milestone 12)
   Truth · Safety · We Got Your Back

   Converts a validated Intent into an executable plan using ONLY constitutional resources.
   The planner decides WHAT should happen — it never executes providers/tools/memory, never
   reads memory, never calls GEL, never writes DecisionRecords. It composes the capabilities
   that skills DECLARE into an explicit DAG, estimates resources, and compiles a CAC Plan for
   the kernel to govern. Deterministic: same Intent + Context + Config → byte-identical plan.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC = isNode ? require("../cac")       : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var G   = isNode ? require("./graph")      : (typeof window !== "undefined" ? window.AUBS_PLANNER_GRAPH : null);
  var EST = isNode ? require("./estimate")   : (typeof window !== "undefined" ? window.AUBS_PLANNER_ESTIMATE : null);
  var SUM = isNode ? require("./summary")    : (typeof window !== "undefined" ? window.AUBS_PLANNER_SUMMARY : null);

  var PLANNER_VERSION = "planner-0.1";

  function normIntent(intent) {
    if (intent && typeof intent === "object" && intent.constraints) return intent;
    var text = (typeof intent === "string") ? intent : (intent && intent.user_text) || "";
    var c = (intent && intent.constraints) || {};
    return { user_text: text, constraints: { max_egress: c.max_egress || "none", local_only: c.local_only !== undefined ? c.local_only : true, data_classification: c.data_classification || "personal" } };
  }

  // buildPlan(intent, context, config) → { ok, graph, graph_hash, estimate, summary, cac_plan, planner_version }
  function buildPlan(intent, context, config) {
    context = context || {}; config = config || {};
    var I = normIntent(intent);
    var pv = config.planner_version || PLANNER_VERSION;

    // Safety refusal is a one-node graph (the planner proposes a refusal; the kernel still governs).
    if (config.refuse) {
      var rg = { planner_version: pv, nodes: [{ node_id: "refusal", node_type: "Refusal", dependencies: [], required_resources: [], estimated_risk: "low", estimated_egress: "none", status: "planned" }] };
      return finalize(rg, I, null, config);
    }

    var skill = (context.skillRegistry && context.skillRegistry.getSkill) ? context.skillRegistry.getSkill(config.skill_id) : null;
    if (!skill) return { ok: false, error: "unknown_skill", skill_id: config.skill_id || null };

    var net = skill.requires_network === true;
    var egress = net ? "full" : "none";
    var nodes = [], resourceDeps = [];

    (skill.allowed_memory_scopes || []).slice().sort().forEach(function (s, i) {
      var id = "mr_" + i; resourceDeps.push(id);
      nodes.push({ node_id: id, node_type: "MemoryRead", dependencies: [], required_resources: ["memory:" + s], estimated_risk: "low", estimated_egress: "none", status: "planned" });
    });
    (skill.allowed_tools || []).slice().sort().forEach(function (t, i) {
      var id = "tool_" + i; resourceDeps.push(id);
      nodes.push({ node_id: id, node_type: "Tool", dependencies: [], required_resources: ["tool:" + t], estimated_risk: "low", estimated_egress: egress, status: "planned" });
    });
    (skill.allowed_providers || []).slice().sort().forEach(function (p, i) {
      var id = "prov_" + i; resourceDeps.push(id);
      nodes.push({ node_id: id, node_type: "Provider", dependencies: [], required_resources: ["provider:" + p], estimated_risk: "low", estimated_egress: egress, status: "planned" });
    });

    var perms = (skill.required_permissions || []).slice().sort().map(function (p) { return "permission:" + p; });
    nodes.push({ node_id: "skill", node_type: "Skill", dependencies: resourceDeps.slice(), required_resources: ["skill:" + skill.skill_id].concat(perms), estimated_risk: skill.risk_level || "low", estimated_egress: egress, status: "planned" });
    nodes.push({ node_id: "answer", node_type: "Answer", dependencies: ["skill"], required_resources: [], estimated_risk: "low", estimated_egress: "none", status: "planned" });

    return finalize({ planner_version: pv, skill_id: skill.skill_id, skill_version: skill.version, nodes: nodes }, I, skill, config);
  }

  function finalize(graph, intent, skill, config) {
    var v = G.validateGraph(graph, { skill: skill, intent: intent });
    if (!v.ok) return { ok: false, error: "invalid_plan", errors: v.errors, graph: graph };
    var estimate = EST.estimate(graph);
    if (skill) estimate.skill_version = skill.version;
    var summary = SUM.planningSummary(graph, estimate);
    var hash = G.graphHash(graph);
    var cac_plan = compileToCAC(graph, intent, config);
    return { ok: true, planner_version: graph.planner_version, graph: graph, graph_hash: hash, estimate: estimate, summary: summary, cac_plan: cac_plan };
  }

  // Compile the DAG into a CAC Plan the kernel can govern. Resource nodes → CAC steps; the
  // Skill/Answer nodes are planner-level grouping (a terminal step is always present).
  function compileToCAC(graph, intent, config) {
    var order = G.topoOrder(graph.nodes).order;
    var byId = {}; graph.nodes.forEach(function (n) { byId[n.node_id] = n; });
    var steps = [], hasProvider = false;
    order.forEach(function (id) {
      var n = byId[id];
      if (n.node_type === "MemoryRead") steps.push({ step_type: "memory_read", egress: "none" });
      else if (n.node_type === "Retrieve") steps.push({ step_type: "retrieve", egress: n.estimated_egress || "none" });
      else if (n.node_type === "Tool") steps.push({ step_type: "tool_call", target: (n.required_resources[0] || "tool:").slice(5), egress: n.estimated_egress || "none" });
      else if (n.node_type === "Provider") { hasProvider = true; steps.push({ step_type: "model_call", target: "provider", egress: n.estimated_egress || "none" }); }
      else if (n.node_type === "Refusal") steps.push({ step_type: "refusal", detail: "planner refusal" });
    });
    if (!steps.some(function (s) { return s.step_type === "refusal"; }) && !hasProvider) steps.push({ step_type: "deterministic_answer" });
    var cacIntent = CAC.builders.buildIntent(intent.user_text || "plan", { intent_id: config.intent_id, created_at: config.created_at, constraints: intent.constraints });
    return CAC.builders.buildPlan(cacIntent, steps, { plan_id: config.plan_id, created_at: config.created_at });
  }

  var API = { buildPlan: buildPlan, PLANNER_VERSION: PLANNER_VERSION, normIntent: normIntent };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PLANNER = API;
})();
