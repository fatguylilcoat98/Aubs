/* AUBS Constitutional Skills Framework — Milestone 11 tests.
   Proves a skill is a declared, governed capability: it REQUESTS providers/memory/tools
   through the constitution and never executes them. A skill runs only if the manifest
   validates, the registry accepts it, GEL allows it, every required resource is eligible,
   permissions pass, the kernel executes it, the ledger records it, and replay can audit it.
   Usage: node tests/run-skills.cjs   (exit 0 = all pass) */
"use strict";
const S = require("../core/skills");
const TOOLS = require("../core/tools");
const PROV = require("../core/providers");
const L = require("../spine/ledger.js");

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const allowAll = { bundle_id: "a", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow-all", precedence_level: "org", effect: "allow", enabled: true, reason: "allow", match: {} }] };
const denyModel = { bundle_id: "d", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-model", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "no model", match: { step_type: "model_call" } }] };

(async () => {
  const key = await L.generateSigningKeyPair();
  const toolReg = TOOLS.createToolRegistry();
  toolReg.registerTool(TOOLS.fakes.fakeCalendarTool); toolReg.registerTool(TOOLS.fakes.fakeHttpTool); toolReg.registerTool(TOOLS.fakes.fakeShellTool);
  const provReg = PROV.createRegistry();
  provReg.register(PROV.fakes.fakeLocalOkProvider); provReg.register(PROV.fakes.fakeCloudOkProvider);
  const skillReg = S.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg });
  const F = S.fakes;
  const fullCtx = { actor: { user_id: "u1" }, granted_permissions: ["calendar.read", "network.http", "shell.execute"], network_available: true, device_capabilities: [], user_confirmed: true, memory_scopes_allowed: ["private", "conversation"], max_risk_level: "high" };

  // ── Registration validation (fail closed) ───────────────────────────────────────────
  ok("valid skill registers", skillReg.registerSkill(F.summarize_note).ok === true && skillReg.has("summarize_note"));
  skillReg.registerSkill(F.local_fact_answer); skillReg.registerSkill(F.calendar_lookup); skillReg.registerSkill(F.http_fetch_summary); skillReg.registerSkill(F.shell_status_check);
  ok("duplicate skill_id rejected", skillReg.registerSkill(F.summarize_note).ok === false);
  ok("invalid manifest (bad risk_level) rejected", skillReg.registerSkill(F.skill({ skill_id: "badrisk", risk_level: "extreme", supported_operations: ["x"] })).ok === false);
  ok("unknown permission rejected", skillReg.registerSkill(F.skill({ skill_id: "badperm", required_permissions: ["filesystem.teleport"], supported_operations: ["x"] })).ok === false);
  ok("unknown tool rejected", skillReg.registerSkill(F.skill({ skill_id: "badtool", allowed_tools: ["ghost_tool"], supported_operations: ["x"] })).ok === false);
  ok("unknown provider rejected", skillReg.registerSkill(F.skill({ skill_id: "badprov", allowed_providers: ["ghost_provider"], supported_operations: ["x"] })).ok === false);
  ok("unknown memory scope rejected", skillReg.registerSkill(F.skill({ skill_id: "badscope", allowed_memory_scopes: ["nowhere"], supported_operations: ["x"] })).ok === false);
  ok("listSkills deterministic (sorted by id)", JSON.stringify(skillReg.ids()) === JSON.stringify(["calendar_lookup", "http_fetch_summary", "local_fact_answer", "shell_status_check", "summarize_note"]));

  // ── A valid fake skill executes (all resources eligible) ────────────────────────────
  let store = L.createMemoryStore();
  let run = await S.executeSkill({ skill_id: "summarize_note", operation: "summarize", inputs: { note_text: "..." } }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("valid skill executes → CAC Result status ok", run.status === "success" && run.result.status === "ok" && /canned summary/.test(run.result.output_text));
  ok("skill run wrote a DecisionRecord (execution_type=skill)", run.record && run.record.execution_type === "skill" && run.record.explanation.skill_id === "summarize_note");
  ok("record carries required/approved resources + risk_level (no secrets)", run.record.explanation.required_resources.indexOf("provider:fake-local-ok") !== -1 && run.record.explanation.approved_resources.indexOf("memory:private") !== -1 && run.record.explanation.risk_level === "low");

  // ── GEL deny blocks the skill (before any resource) ─────────────────────────────────
  let gd = await S.executeSkill({ skill_id: "summarize_note", operation: "summarize" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, bundle: denyModel, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("GEL deny → skill BLOCKED (policy_denied)", gd.status === "blocked" && gd.eligibility.reasons.indexOf("policy_denied") !== -1);

  // ── Memory scope denied blocks the skill ────────────────────────────────────────────
  let ms = await S.executeSkill({ skill_id: "local_fact_answer", operation: "answer" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { memory_scopes_allowed: [] }) });
  ok("memory scope not allowed → BLOCKED (memory_scope_denied)", ms.status === "blocked" && ms.eligibility.reasons.indexOf("memory_scope_denied") !== -1 && ms.eligibility.blocked_resources.some(b => b.resource === "memory:private"));

  // ── Tool denied blocks the skill ────────────────────────────────────────────────────
  let td = await S.executeSkill({ skill_id: "calendar_lookup", operation: "lookup" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { granted_permissions: [] }) });
  ok("required tool ineligible → BLOCKED (tool_denied)", td.status === "blocked" && td.eligibility.reasons.indexOf("tool_denied") !== -1 && td.eligibility.blocked_resources.some(b => b.resource === "tool:calendar"));

  // ── Provider denied blocks the skill (cloud provider can't serve a no-egress skill) ──
  skillReg.registerSkill(F.skill({ skill_id: "mismatch", allowed_providers: ["fake-cloud-ok"], requires_network: false, risk_level: "low", supported_operations: ["x"], execute: () => Promise.resolve({ status: "success", output_text: "y", output_classification: "none" }) }));
  let pd = await S.executeSkill({ skill_id: "mismatch", operation: "x" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("required provider ineligible → BLOCKED (provider_denied)", pd.status === "blocked" && pd.eligibility.reasons.indexOf("provider_denied") !== -1);

  // ── Risk level denied blocks the skill ──────────────────────────────────────────────
  let rl = await S.executeSkill({ skill_id: "shell_status_check", operation: "status" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { max_risk_level: "medium" }) });
  ok("risk level above the permitted max → BLOCKED (risk_level_denied)", rl.status === "blocked" && rl.eligibility.reasons.indexOf("risk_level_denied") !== -1);

  // ── User confirmation gating ────────────────────────────────────────────────────────
  let nc = await S.executeSkill({ skill_id: "shell_status_check", operation: "status" }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { user_confirmed: false }) });
  ok("skill needing confirmation, not confirmed → BLOCKED (user_confirmation_required)", nc.status === "blocked" && nc.eligibility.reasons.indexOf("user_confirmation_required") !== -1);

  // ── Network skill end-to-end (tool + cloud provider) leaves device ──────────────────
  let net = await S.executeSkill({ skill_id: "http_fetch_summary", operation: "fetch_summarize", inputs: { url: "http://secret.example/page" } }, { skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, bundle: allowAll, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("network skill (tool+provider) executes under allow-egress policy", net.status === "success" && net.record.explanation.left_device === true);
  ok("no secrets / raw inputs in the record", !/secret\.example/.test(JSON.stringify(net.record)));

  // ── Ledger + explainability ─────────────────────────────────────────────────────────
  ok("skill DecisionRecord ledger verifies", (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);
  const why = S.explanation.skillWhy(net.record);
  ok("'Why?' derived from record (skill, resources, policy, device)", /Skill used: http_fetch_summary/.test(why.text) && /Resources requested:/.test(why.text) && /Anything left device: Yes/.test(why.text) && /Policy decision: Allowed/.test(why.text));

  // ── Replay (no re-run) ──────────────────────────────────────────────────────────────
  let ev = S.replay.captureSkillEvidence(run);
  ok("replay of an unchanged skill → MATCH", S.replay.compareSkill(ev, { registry: skillReg }).status === "MATCH");
  ok("skill removed → DRIFT(skill_removed)", S.replay.compareSkill(ev, { registry: S.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg }) }).reasons.indexOf("skill_removed") !== -1);
  let verReg = S.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg }); verReg.registerSkill(F.skill({ skill_id: "summarize_note", version: "2.0.0", allowed_providers: ["fake-local-ok"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["summarize"] }));
  ok("skill version changed → DRIFT(skill_version_changed)", S.replay.compareSkill(ev, { registry: verReg }).reasons.indexOf("skill_version_changed") !== -1);
  let permReg = S.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg }); permReg.registerSkill(F.skill({ skill_id: "summarize_note", version: "1.0.0", required_permissions: ["calendar.read"], allowed_providers: ["fake-local-ok"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["summarize"] }));
  ok("skill permissions changed → DRIFT(permissions_changed)", S.replay.compareSkill(ev, { registry: permReg }).reasons.indexOf("permissions_changed") !== -1);
  ok("policy drift → DRIFT(policy_drift), no re-run", S.replay.compareSkill(ev, { registry: skillReg, currentBundle: denyModel }).reasons.indexOf("policy_drift") !== -1);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Skills v0.1: declared+governed — manifest→registry→GEL→resource eligibility→execute→record→replay. No skill bypasses the constitution.");
  process.exit(0);
})().catch(e => { console.error("skills test crashed:", e); process.exit(1); });
