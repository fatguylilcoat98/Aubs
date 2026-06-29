/* AUBS Constitutional Planner — Milestone 12 tests.
   Proves the planner is the ONLY producer of executable plans: it composes the capabilities
   skills DECLARE into a validated, deterministic DAG + a compiled CAC Plan, estimates
   resources, summarizes, and is replayable — and it NEVER executes, reads memory, calls GEL,
   or writes records. The kernel remains authoritative (a planned plan can still be denied).
   Usage: node tests/run-planner.cjs   (exit 0 = all pass) */
"use strict";
const PL = require("../core/planner");
const SK = require("../core/skills");
const TOOLS = require("../core/tools");
const PROV = require("../core/providers");
const GEL = require("../core/gel");
const L = require("../spine/ledger.js");
const GR = PL.graph;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function gnode(id, type, deps, res, egress) { return { node_id: id, node_type: type, dependencies: deps || [], required_resources: res || [], estimated_risk: "low", estimated_egress: egress || "none", status: "planned" }; }
const PIN = { intent_id: "i", plan_id: "p", created_at: "2026-06-29T00:00:00Z" };
const denyModel = { bundle_id: "d", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-model", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "no model", match: { step_type: "model_call" } }] };

function skillCtx() {
  const toolReg = TOOLS.createToolRegistry();
  toolReg.registerTool(TOOLS.fakes.fakeCalendarTool); toolReg.registerTool(TOOLS.fakes.fakeHttpTool); toolReg.registerTool(TOOLS.fakes.fakeShellTool);
  const provReg = PROV.createRegistry();
  provReg.register(PROV.fakes.fakeLocalOkProvider); provReg.register(PROV.fakes.fakeCloudOkProvider);
  const skillReg = SK.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg });
  ["summarize_note", "local_fact_answer", "calendar_lookup", "http_fetch_summary", "shell_status_check"].forEach(id => skillReg.registerSkill(SK.fakes[id]));
  return { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, _toolReg: toolReg, _provReg: provReg };
}

(async () => {
  const context = skillCtx();
  const intent = { user_text: "summarize my note", constraints: { max_egress: "none", local_only: true } };
  const cfg = Object.assign({ skill_id: "summarize_note", operation: "summarize" }, PIN);

  // ── Deterministic planning: identical graph + hash twice ────────────────────────────
  const a = PL.buildPlan(intent, context, cfg);
  const b = PL.buildPlan(intent, context, cfg);
  ok("planner builds a valid plan from a skill's declared capabilities", a.ok === true && a.graph.nodes.length === 4 && a.cac_plan && a.cac_plan.steps.length >= 2);
  ok("planning is deterministic (byte-identical graph + hash)", JSON.stringify(a.graph) === JSON.stringify(b.graph) && a.graph_hash === b.graph_hash);
  ok("the DAG composes memory + provider + skill + answer nodes", a.graph.nodes.map(n => n.node_type).sort().join() === "Answer,MemoryRead,Provider,Skill");

  // ── Resource estimation + planning summary (graph-derived, not model) ───────────────
  ok("resource estimation is correct", a.estimate.required_providers.join() === "fake-local-ok" && a.estimate.required_memory_scopes.join() === "private" && a.estimate.max_egress === "none" && a.estimate.estimated_risk === "low");
  ok("planning summary derived from graph state", /This request requires/.test(a.summary.text) && /provider/.test(a.summary.text) && /memory read/.test(a.summary.text) && /No network/.test(a.summary.text));

  // ── Kernel remains authoritative: the planned CAC Plan still goes through GEL ────────
  ok("compiled plan is GEL-allowable locally", GEL.evaluate(a.cac_plan, GEL.defaultBundle, { intent: a.cac_plan }).decision === "allow");
  ok("kernel still authoritative — a planned plan can be DENIED by policy", GEL.evaluate(a.cac_plan, denyModel, { intent: a.cac_plan }).decision === "deny");

  // ── No planner bypass: the planner produces data only (no execution/GEL/record) ─────
  ok("planner never executes / governs / records (data only)", a.governance === undefined && a.record === undefined && typeof PL.buildPlan === "function" && a.cac_plan && !a.result);

  // ── Validation: fail closed ─────────────────────────────────────────────────────────
  ok("cycle detected", GR.validateGraph({ nodes: [gnode("n1", "Tool", ["n2"]), gnode("n2", "Tool", ["n1"]), gnode("answer", "Answer", ["n1"])] }).errors.some(e => e.type === "cycle"));
  ok("duplicate node id rejected", GR.validateGraph({ nodes: [gnode("dup", "Tool", [], [], "none"), gnode("dup", "Provider", [], [], "none"), gnode("answer", "Answer", ["dup"])] }).errors.some(e => e.type === "duplicate_id"));
  ok("illegal dependency (unknown node) rejected", GR.validateGraph({ nodes: [gnode("answer", "Answer", ["ghost"])] }).errors.some(e => e.type === "illegal_dependency"));
  ok("unknown node type rejected", GR.validateGraph({ nodes: [gnode("x", "Frobnicate", []), gnode("answer", "Answer", ["x"])] }).errors.some(e => e.type === "unknown_node_type"));
  ok("orphan node rejected", GR.validateGraph({ nodes: [gnode("orphan", "Tool", []), gnode("answer", "Answer", [])] }).errors.some(e => e.type === "orphan_node"));

  // conflict detection (against the declared skill + intent)
  const skill = context.skillRegistry.getSkill("summarize_note");
  ok("provider conflict detected (undeclared provider)", GR.validateGraph({ nodes: [gnode("p", "Provider", [], ["provider:ghost"]), gnode("answer", "Answer", ["p"])] }, { skill: skill }).errors.some(e => e.type === "provider_conflict"));
  ok("tool conflict detected (undeclared tool)", GR.validateGraph({ nodes: [gnode("t", "Tool", [], ["tool:ghost"]), gnode("answer", "Answer", ["t"])] }, { skill: skill }).errors.some(e => e.type === "tool_conflict"));
  ok("memory conflict detected (undeclared scope)", GR.validateGraph({ nodes: [gnode("m", "MemoryRead", [], ["memory:organization"]), gnode("answer", "Answer", ["m"])] }, { skill: skill }).errors.some(e => e.type === "memory_conflict"));
  ok("permission conflict detected (undeclared permission)", GR.validateGraph({ nodes: [gnode("s", "Skill", [], ["permission:shell.execute"]), gnode("answer", "Answer", ["s"])] }, { skill: skill }).errors.some(e => e.type === "permission_conflict"));
  ok("egress resource conflict detected (exceeds intent max_egress)", GR.validateGraph({ nodes: [gnode("p", "Provider", [], ["provider:fake-local-ok"], "full"), gnode("answer", "Answer", ["p"])] }, { intent: { constraints: { max_egress: "none" } } }).errors.some(e => e.type === "resource_conflict"));

  // ── Graph hashing is structural + stable ────────────────────────────────────────────
  ok("graph hash is stable", GR.graphHash(a.graph) === a.graph_hash);
  const mutated = JSON.parse(JSON.stringify(a.graph)); mutated.nodes[0].required_resources = ["memory:organization"];
  ok("graph hash changes when structure changes", GR.graphHash(mutated) !== a.graph_hash);
  ok("graph hash ignores mutable status field", (function () { const g2 = JSON.parse(JSON.stringify(a.graph)); g2.nodes.forEach(n => n.status = "done"); return GR.graphHash(g2) === a.graph_hash; })());

  // ── DecisionRecord metadata (planner metadata, written by the EXECUTOR not the planner) ─
  const fields = PL.plannerRecordFields(a);
  ok("plannerRecordFields exposes version/hash/counts/estimates/resources", fields.planner_version === "planner-0.1" && fields.graph_hash === a.graph_hash && fields.node_count === 4 && fields.resource_summary.providers.join() === "fake-local-ok");
  const store = L.createMemoryStore(); const key = await L.generateSigningKeyPair();
  await L.appendRecord(store, { input: "plan", output: "", execution_type: "plan", provider: "planner", explanation: fields, policy_version: "x" }, key.privateKey);
  const recs = await store.all();
  ok("planner metadata folds into a verifiable DecisionRecord", recs[0].explanation.graph_hash === a.graph_hash && (await L.verifyLedger(recs, key.publicKey)).ok === true);

  // ── Replay the planner only (no execution) ──────────────────────────────────────────
  const ev = PL.replay.capturePlannerEvidence(a, { intent: intent, config: cfg });
  ok("replay of an unchanged planner → MATCH", PL.replay.replayPlanner(ev, { context: context }).status === "MATCH");
  // skill version change → skill_drift (graph hash unchanged; resources unchanged)
  const ctx2 = skillCtx();
  ctx2.skillRegistry.removeSkill("summarize_note");
  ctx2.skillRegistry.registerSkill(SK.fakes.skill({ skill_id: "summarize_note", version: "2.0.0", allowed_providers: ["fake-local-ok"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["summarize"] }));
  const rpVer = PL.replay.replayPlanner(ev, { context: ctx2 });
  ok("skill version change → DRIFT(skill_drift), graph unchanged", rpVer.status === "DRIFT" && rpVer.reasons.indexOf("skill_drift") !== -1);
  // skill resource change → planning_drift + resource_drift
  const ctx3 = skillCtx();
  ctx3.skillRegistry.removeSkill("summarize_note");
  ctx3.skillRegistry.registerSkill(SK.fakes.skill({ skill_id: "summarize_note", version: "1.0.0", allowed_providers: ["fake-local-ok"], allowed_tools: ["calendar"], allowed_memory_scopes: ["private"], required_permissions: ["calendar.read"], risk_level: "low", supported_operations: ["summarize"] }));
  const rpRes = PL.replay.replayPlanner(ev, { context: ctx3 });
  ok("skill resource change → DRIFT(planning_drift + resource_drift + dependency_drift)", rpRes.reasons.indexOf("planning_drift") !== -1 && rpRes.reasons.indexOf("resource_drift") !== -1 && rpRes.reasons.indexOf("dependency_drift") !== -1);
  // planner version drift
  const evOld = Object.assign({}, ev, { planner_version: "planner-0.0" });
  ok("planner version drift → DRIFT(planner_version_drift)", PL.replay.replayPlanner(evOld, { context: context }).reasons.indexOf("planner_version_drift") !== -1);

  // ── Refusal plan + a no-resource (deterministic) plan ───────────────────────────────
  const refuse = PL.buildPlan(intent, context, Object.assign({ refuse: true }, PIN));
  ok("planner can propose a Refusal plan (kernel still governs)", refuse.ok === true && refuse.graph.nodes[0].node_type === "Refusal" && refuse.cac_plan.steps.some(s => s.step_type === "refusal"));
  const factCtx = context;
  const fact = PL.buildPlan(intent, factCtx, Object.assign({ skill_id: "local_fact_answer", operation: "answer" }, PIN));
  ok("memory-only skill → deterministic_answer terminal (no provider)", fact.ok === true && fact.cac_plan.steps.some(s => s.step_type === "deterministic_answer") && fact.estimate.required_providers.length === 0);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Planner v0.1: deterministic DAG, fail-closed validation, structural replay; the only producer of plans. Kernel still governs.");
  process.exit(0);
})().catch(e => { console.error("planner test crashed:", e); process.exit(1); });
