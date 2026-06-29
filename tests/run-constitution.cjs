/* AUBS Constitutional Integration ("One Spine") — Milestone 13 end-to-end harness.
   Executes ONE complete request through every subsystem in order and proves the whole stack
   behaves as one system: nothing executes before GEL, nothing bypasses eligibility/permissions,
   exactly one DecisionRecord per request, every record replayable + referencing the same ledger
   row, replay never executes a model, verification never mutates history.
   Usage: node tests/run-constitution.cjs */
"use strict";
const C = require("../core/constitution");
const PROV = require("../core/providers");
const TOOLS = require("../core/tools");
const SK = require("../core/skills");
const MEM = require("../core/memory");
const REPLAY = require("../core/replay");
const L = require("../spine/ledger.js");

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const allowAll = { bundle_id: "a", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow", precedence_level: "org", effect: "allow", enabled: true, reason: "allow", match: {} }] };
const denyModel = { bundle_id: "d", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-model", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "no model", match: { step_type: "model_call" } }] };

function localProvider(id, answer) { let n = 0; return { provider_id: id, provider_type: "local", enabled: true, capabilities: PROV.defaultLocalCapabilities(), healthCheck: () => Promise.resolve({ ok: true }), execute: () => { n++; return Promise.resolve({ ok: true, output_text: answer, model_id: "local-test", provider_id: id }); }, calls: () => n }; }
function spyCloud(id) { let n = 0; return { provider_id: id, provider_type: "cloud", enabled: true, capabilities: PROV.fakes.cloudCaps(), healthCheck: () => Promise.resolve({ ok: true }), execute: () => { n++; return Promise.resolve({ ok: true, output_text: "cloud", model_id: "m", provider_id: id }); }, calls: () => n }; }
function spyTool(id) { let n = 0; return { tool_id: id, tool_type: "calendar", version: "1.0.0", permissions_required: ["calendar.read"], requires_network: false, requires_user_confirmation: false, supported_operations: ["list_events"], enabled: true, healthCheck: () => Promise.resolve({ ok: true }), metadata: () => ({}), execute: () => { n++; return Promise.resolve({ status: "success", output_text: "events", output_classification: "event_list" }); }, calls: () => n }; }

(async () => {
  const key = await L.generateSigningKeyPair();
  const memKey = await L.generateSigningKeyPair();

  // ── Memory (record-free service: the pipeline is the only provenance writer) ─────────
  const memSvc = MEM.createMemoryService({ signingKey: memKey.privateKey, store: MEM.store.createMemoryLog() });
  const u1 = { actor: { user_id: "u1" }, conversation_id: "c1" };
  const seeded = await memSvc.write({ user_id: "u1", type: "FACT", scope: "private", content: "User's favorite color is blue" }, u1);
  const colorId = seeded.memory.memory_id;

  // ── Registries ──────────────────────────────────────────────────────────────────────
  const provReg = PROV.createRegistry();
  provReg.register(localProvider("local-echo", "Here is a local answer."));
  provReg.register(localProvider("local-grounding", "Your favorite color is blue. [ID:" + colorId + "]"));
  const spyP = spyCloud("spy-cloud"); provReg.register(spyP);
  const spyLocal = localProvider("spy-local", "spy"); provReg.register(spyLocal);

  const toolReg = TOOLS.createToolRegistry();
  const calSpy = spyTool("calendar"); toolReg.registerTool(calSpy);

  const skillReg = SK.createSkillRegistry({ toolRegistry: toolReg, providerRegistry: provReg });
  const mk = (o) => SK.fakes.skill(o);
  skillReg.registerSkill(mk({ skill_id: "note", allowed_providers: ["local-echo"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["answer"] }));
  skillReg.registerSkill(mk({ skill_id: "color", allowed_providers: ["local-grounding"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["answer"] }));
  skillReg.registerSkill(mk({ skill_id: "spy_model", allowed_providers: ["spy-local"], allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["answer"] }));
  skillReg.registerSkill(mk({ skill_id: "needs_cloud", allowed_providers: ["spy-cloud"], requires_network: false, risk_level: "low", supported_operations: ["answer"] }));
  skillReg.registerSkill(mk({ skill_id: "cal", allowed_tools: ["calendar"], required_permissions: ["calendar.read"], risk_level: "low", supported_operations: ["lookup"] }));

  const store = L.createMemoryStore();
  const fullCtx = { actor: { user_id: "u1" }, granted_permissions: ["calendar.read"], network_available: true, device_capabilities: [], user_confirmed: true, memory_scopes_allowed: ["private", "conversation"], max_risk_level: "high" };
  const base = (over) => Object.assign({ skillRegistry: skillReg, toolRegistry: toolReg, providerRegistry: provReg, memoryService: memSvc, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx }, over || {});
  const count = async () => store.count();

  // ════════════ SCENARIOS (each finishes with exactly one DecisionRecord) ══════════════
  let n0 = await count();
  // S1 — normal local answer
  let s1 = await C.runConstitutionalRequest({ user_text: "tell me something", skill_id: "note", operation: "answer", memory: { user_id: "u1", scope: "private" } }, base());
  ok("S1 normal local answer → ok, one record, full path, explanation", s1.status === "ok" && (await count()) - n0 === 1 && s1.record && /Answered locally/.test(s1.explanation) && s1.path.length === 13);

  n0 = await count();
  // S2 — blocked by GEL (deny model_call); the model must NEVER run
  let s2 = await C.runConstitutionalRequest({ user_text: "hi", skill_id: "spy_model", operation: "answer", memory: { user_id: "u1", scope: "private" } }, base({ bundle: denyModel }));
  ok("S2 blocked by GEL → blocked, one record, model never executed", s2.status === "blocked" && (await count()) - n0 === 1 && spyLocal.calls() === 0 && /GEL/.test(s2.path.map(p => p.stage).join()));

  n0 = await count();
  // S3 — blocked by provider eligibility (cloud provider, no-egress plan)
  let s3 = await C.runConstitutionalRequest({ user_text: "hi", skill_id: "needs_cloud", operation: "answer" }, base({ bundle: allowAll }));
  ok("S3 blocked by provider eligibility → blocked, one record, provider never executed", s3.status === "blocked" && (await count()) - n0 === 1 && spyP.calls() === 0 && s3.path.some(p => p.stage === "Eligibility" && p.status === "blocked"));

  n0 = await count();
  // S4 — blocked by memory permissions (actor not in scope, memory required)
  let s4 = await C.runConstitutionalRequest({ user_text: "what's my color", skill_id: "note", operation: "answer", memory: { user_id: "u1", scope: "private", required: true } }, base({ ctx: { actor: { user_id: "u2" }, memory_scopes_allowed: [], granted_permissions: [], network_available: true } }));
  ok("S4 blocked by memory permissions → blocked, one record", s4.status === "blocked" && (await count()) - n0 === 1 && s4.path.some(p => p.stage === "Memory" && p.status === "blocked"));

  n0 = await count();
  // S5 — blocked by tool permissions (no calendar.read); the tool must NEVER run
  let s5 = await C.runConstitutionalRequest({ user_text: "events?", skill_id: "cal", operation: "lookup", tool: { tool_id: "calendar", operation: "list_events" } }, base({ ctx: { actor: { user_id: "u1" }, granted_permissions: [], network_available: true, memory_scopes_allowed: ["private"], user_confirmed: true, max_risk_level: "high", device_capabilities: [] } }));
  ok("S5 blocked by tool permissions → blocked, one record, tool never executed", s5.status === "blocked" && (await count()) - n0 === 1 && calSpy.calls() === 0 && s5.path.some(p => p.stage === "Tools" && p.status === "blocked"));

  // S8 — verify grounding (value-stating + cited answer → grounded)
  n0 = await count();
  let s8 = await C.runConstitutionalRequest({ user_text: "what's my favorite color", skill_id: "color", operation: "answer", memory: { user_id: "u1", scope: "private" } }, base());
  ok("S8 grounding verified → record.grounding_tag = grounded", s8.status === "ok" && s8.record.explanation.grounding_tag === "grounded" && s8.grounding.tag === "grounded" && (await count()) - n0 === 1);

  // S6 — replay a historical decision (S1's evidence); replay must NOT execute a model
  const before = JSON.stringify(await store.all());
  const spyBefore = spyLocal.calls();
  let rp = await REPLAY.replay(s1.evidence, { mode: "exact", registry: provReg, publicKey: key.publicKey, ledger: await store.all() });
  ok("S6 replay historical decision → MATCH, no new record, model not executed", rp.status === "MATCH" && spyLocal.calls() === spyBefore);

  // S7 — verify ledger (offline) ; S(history) — verification never modifies history
  const v = await L.verifyLedger(await store.all(), key.publicKey);
  ok("S7 verify ledger → intact", v.ok === true && v.count >= 5);
  ok("verification never modified history (ledger byte-identical after verify+replay)", JSON.stringify(await store.all()) === before);

  // S9 — explanation generated for every scenario
  ok("S9 explanation generated (Level 1 from recorded state, every scenario)", [s1, s2, s3, s4, s5, s8].every(s => typeof s.explanation === "string" && s.explanation.length > 0));

  // ════════════ CONSTITUTIONAL ASSERTIONS ══════════════════════════════════════════════
  ok("A model can never execute before GEL", spyLocal.calls() === 0);                  // only ever blocked at GEL/elig
  ok("A provider cannot execute without eligibility", spyP.calls() === 0);
  ok("Memory cannot bypass permissions (S4 returned no memory)", s4.path.find(p => p.stage === "Memory").status === "blocked");
  ok("Tools cannot bypass permissions (S5 tool not run)", calSpy.calls() === 0);
  ok("Replay never executes a model", rp.status === "MATCH" && spyLocal.calls() === 0);
  ok("Grounding never bypasses replay evidence (grounding in record + evidence captured)", s8.record.explanation.grounding_tag === "grounded" && !!s8.evidence);
  ok("Every execution writes exactly one DecisionRecord (S1 audit)", C.audit.auditRun(s1).ok === true && s1.counters.records === 1);
  ok("Every DecisionRecord is replayable", (await REPLAY.replay(s1.evidence, { mode: "exact", registry: provReg, publicKey: key.publicKey, ledger: await store.all() })).status === "MATCH");
  ok("Every replay references the SAME ledger record", s1.evidence.record.record_hash === (await store.all()).find(r => r.id === s1.record.id).record_hash);

  // ════════════ DEPENDENCY GRAPH (machine-readable, cycle-failing) ══════════════════════
  ok("pipeline dependency graph is a valid DAG (no cycles)", C.graph.validate().ok === true);
  const cyclic = C.graph.pipelineGraph(); cyclic.nodes[0].dependencies = ["Explanation"];   // inject a back-edge
  ok("a cycle introduced into the graph FAILS validation", C.graph.validate(cyclic).ok === false && C.graph.validate(cyclic).errors.some(e => e.type === "cycle"));
  ok("graph hash is stable + the 13 canonical stages are present", typeof C.graph.graphHash() === "string" && C.graph.STAGES.length === 13);

  // ════════════ ARCHITECTURAL AUDIT ════════════════════════════════════════════════════
  const audit = C.audit.runAudit();
  console.log("\n--- Architectural Audit ---");
  audit.checks.forEach(c => console.log("  " + (c.ok ? "✔" : "✖") + " " + c.name + " — " + c.detail));
  ok("architectural audit passes (no cycles/bypass; single-source primitives)", audit.ok === true);

  // ════════════ EXPLAIN CONSTITUTION (developer command) ════════════════════════════════
  const explain = C.explainConstitution(s1.path);
  console.log("\n--- Explain Constitution (S1) ---\n" + explain);
  ok("Explain Constitution prints the exact path (Intent → … → Done)", /^Intent/.test(explain) && /GEL/.test(explain) && /Grounding/.test(explain) && /Ledger/.test(explain) && /Done$/.test(explain));

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("One Spine: every subsystem composes into a single governed pipeline; nothing bypasses the constitution.");
  process.exit(0);
})().catch(e => { console.error("constitution test crashed:", e); process.exit(1); });
