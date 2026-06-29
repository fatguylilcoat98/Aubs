/* AUBS Constitutional Tool Framework — Milestone 10 tests.
   Proves every external capability is governed: contract → registry → drift shield → GEL →
   eligibility → execution → DecisionRecord → replay. Models request; the kernel decides. A
   tool cannot execute unless kernel + GEL + eligibility + permissions all authorize it.
   Usage: node tests/run-tools.cjs   (exit 0 = all pass) */
"use strict";
const T = require("../core/tools");
const L = require("../spine/ledger.js");
const F = T.fakes;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const allowAll = { bundle_id: "a", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow-all", precedence_level: "org", effect: "allow", enabled: true, reason: "allow", match: {} }] };
const denyTools = { bundle_id: "d", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-tools", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "tools locked", match: { step_type: "tool_call" } }] };
function vtool(over) { return Object.assign({ tool_id: "v", tool_type: "filesystem", version: "1.0.0", permissions_required: ["filesystem.read"], requires_network: false, requires_user_confirmation: false, supported_operations: ["read"], enabled: true, healthCheck: () => Promise.resolve({ ok: true }), execute: () => Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }), metadata: () => ({ tool_id: "v" }) }, over || {}); }

(async () => {
  const key = await L.generateSigningKeyPair();
  const fullCtx = { actor: { user_id: "u1" }, granted_permissions: ["filesystem.read", "filesystem.write", "calendar.read", "shell.execute", "network.http", "database.query", "camera.capture"], network_available: true, device_capabilities: ["camera", "microphone"], user_confirmed: true };

  // ── Registration validation (fail closed) ───────────────────────────────────────────
  let reg = T.createToolRegistry();
  ok("valid tool registers", reg.registerTool(F.fakeFilesystemTool).ok === true && reg.has("fs.read"));
  ok("duplicate tool_id rejected", reg.registerTool(F.fakeFilesystemTool).ok === false);
  ok("invalid contract (missing execute) rejected", reg.registerTool(vtool({ tool_id: "noexec", execute: undefined })).ok === false);
  ok("missing metadata() rejected", reg.registerTool(vtool({ tool_id: "nometa", metadata: undefined })).ok === false);
  ok("empty supported_operations rejected (no arbitrary methods)", reg.registerTool(vtool({ tool_id: "noops", supported_operations: [] })).ok === false);
  ok("unknown permission rejected", reg.registerTool(vtool({ tool_id: "badperm", permissions_required: ["filesystem.teleport"] })).ok === false);
  ok("bad tool_type rejected", reg.registerTool(vtool({ tool_id: "badtype", tool_type: "quantum" })).ok === false);
  reg.registerTool(F.fakeCalendarTool); reg.registerTool(F.fakeShellTool);
  ok("listTools is deterministic (sorted by id)", JSON.stringify(reg.ids()) === JSON.stringify(["calendar", "fs.read", "shell"]));
  ok("removeTool works", reg.removeTool("calendar").ok === true && !reg.has("calendar"));
  ok("describe() is data-only (no functions)", reg.describe().every(d => typeof d.execute === "undefined" && Array.isArray(d.supported_operations)));

  // ── Permission approval vs denial; the tool NEVER runs when blocked ──────────────────
  let store = L.createMemoryStore();
  let r = await T.executeTool({ tool_id: "fs.read", operation: "read" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("permission granted + GEL allow → success, CAC Result status ok", r.status === "success" && r.result.status === "ok" && /canned file/.test(r.result.output_text));

  let spyCalls = 0;
  reg.registerTool(F.tool({ tool_id: "spy", tool_type: "filesystem", permissions_required: ["filesystem.read"], supported_operations: ["read"], metadata: () => ({}), execute: () => { spyCalls++; return Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }); } }));
  let denied = await T.executeTool({ tool_id: "spy", operation: "read" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: { actor: { user_id: "u1" }, granted_permissions: [], network_available: true } });
  ok("permission denied → BLOCKED, tool NEVER executed", denied.status === "blocked" && denied.result.status === "blocked" && spyCalls === 0 && denied.eligibility.reasons.indexOf("permission_denied") !== -1);

  // ── GEL deny blocks before execution ────────────────────────────────────────────────
  let govBlocked = await T.executeTool({ tool_id: "fs.read", operation: "read" }, { registry: reg, bundle: denyTools, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("GEL deny → BLOCKED (policy_denied)", govBlocked.status === "blocked" && govBlocked.eligibility.reasons.indexOf("policy_denied") !== -1);

  // ── Unknown operation ───────────────────────────────────────────────────────────────
  let unk = await T.executeTool({ tool_id: "fs.read", operation: "delete" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("undeclared operation → BLOCKED (unknown_operation)", unk.status === "blocked" && unk.eligibility.reasons.indexOf("unknown_operation") !== -1);

  // ── User confirmation required ──────────────────────────────────────────────────────
  let noConfirm = await T.executeTool({ tool_id: "shell", operation: "run" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { user_confirmed: false }) });
  ok("tool needing confirmation, not confirmed → BLOCKED (user_confirmation_required)", noConfirm.status === "blocked" && noConfirm.eligibility.reasons.indexOf("user_confirmation_required") !== -1 && noConfirm.eligibility.approval_path === "awaiting_confirmation");
  let confirmed = await T.executeTool({ tool_id: "shell", operation: "run" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("same tool WITH confirmation → success, approval_path recorded", confirmed.status === "success" && confirmed.record.explanation.approval_path === "user_confirmed");

  // ── Network availability + device capability ────────────────────────────────────────
  reg.registerTool(F.fakeHttpTool);
  let noNet = await T.executeTool({ tool_id: "http", operation: "get" }, { registry: reg, bundle: allowAll, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { network_available: false }) });
  ok("network tool with no network → BLOCKED (network_unavailable)", noNet.status === "blocked" && noNet.eligibility.reasons.indexOf("network_unavailable") !== -1);
  let httpOk = await T.executeTool({ tool_id: "http", operation: "get" }, { registry: reg, bundle: allowAll, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("network tool WITH network + allow-egress policy → success, network_used recorded", httpOk.status === "success" && httpOk.record.explanation.network_used === true);
  reg.registerTool(F.tool({ tool_id: "camera", tool_type: "camera", permissions_required: ["camera.capture"], supported_operations: ["capture"], metadata: () => ({}), execute: () => Promise.resolve({ status: "success", output_text: "snap", output_classification: "image_ref" }) }));
  let noCam = await T.executeTool({ tool_id: "camera", operation: "capture" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: Object.assign({}, fullCtx, { device_capabilities: [] }) });
  ok("camera tool without device capability → BLOCKED (device_capability_missing)", noCam.status === "blocked" && noCam.eligibility.reasons.indexOf("device_capability_missing") !== -1);

  // ── Health failure ──────────────────────────────────────────────────────────────────
  reg.registerTool(F.fakeUnhealthyTool);
  let sick = await T.executeTool({ tool_id: "unhealthy", operation: "get" }, { registry: reg, bundle: allowAll, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("unhealthy tool → BLOCKED (tool_unhealthy)", sick.status === "blocked" && sick.eligibility.reasons.indexOf("tool_unhealthy") !== -1);

  // ── Partial + failure + drift outcomes (normalized CAC Results) ─────────────────────
  reg.registerTool(F.fakePartialTool); reg.registerTool(F.fakeFailingTool); reg.registerTool(F.fakeDriftTool); reg.registerTool(F.fakeThrowingTool);
  let partial = await T.executeTool({ tool_id: "partial", operation: "query" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("partial tool → CAC Result status 'partial'", partial.status === "partial" && partial.result.status === "partial");
  let failed = await T.executeTool({ tool_id: "failing", operation: "read" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("failing tool → CAC Result status 'error' (failure)", failed.status === "failure" && failed.result.status === "error");
  let drifted = await T.executeTool({ tool_id: "drift", operation: "read" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("malformed tool result → fails closed (drift → failure)", drifted.status === "failure" && drifted.record.explanation.drift === true);
  let threw = await T.executeTool({ tool_id: "throwing", operation: "run" }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("throwing tool → caught as failure (never crashes the kernel)", threw.status === "failure");

  // ── DecisionRecord: classifications only, no secrets / no raw args ───────────────────
  let withArgs = await T.executeTool({ tool_id: "fs.read", operation: "read", args: { path: "/secret/passwords.txt" } }, { registry: reg, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  ok("record carries tool_id/operation/permission_set/classifications", withArgs.record.execution_type === "tool" && withArgs.record.explanation.tool_id === "fs.read" && withArgs.record.explanation.operation === "read" && withArgs.record.explanation.permission_set.join() === "filesystem.read" && withArgs.record.explanation.result_classification === "file_content");
  ok("record classifies args WITHOUT storing raw values (no secret leaks)", withArgs.record.explanation.arguments_classification === "object{1}" && !/secret|passwords/.test(JSON.stringify(withArgs.record)));

  // ── Ledger verifies after all tool executions ──────────────────────────────────────
  ok("tool DecisionRecord ledger verifies", (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);
  ok("every tool op wrote a record (provider=tool_id, execution_type=tool)", (await store.all()).every(rec => rec.execution_type === "tool"));

  // ── Explainability from recorded state ──────────────────────────────────────────────
  const why = T.explanation.toolWhy(httpOk.record);
  ok("'Why?' derived from record (tool, permission, network, approval)", /Tool used: http/.test(why.text) && /Permission that allowed it: network.http/.test(why.text) && /Network used: Yes/.test(why.text));

  // ── Replay: detect drift WITHOUT re-executing the tool ──────────────────────────────
  let exec = await T.executeTool({ tool_id: "fs.read", operation: "read" }, { registry: reg, bundle: allowAll, ledgerStore: store, signingKey: key.privateKey, ctx: fullCtx });
  let ev = T.replay.captureToolEvidence(exec);
  ok("replay of an unchanged tool → MATCH", (await T.replay.compareTool(ev, { registry: reg })).status === "MATCH");
  let regGone = T.createToolRegistry();
  ok("tool removed → DRIFT(tool_removed)", (await T.replay.compareTool(ev, { registry: regGone })).reasons.indexOf("tool_removed") !== -1);
  let regPerm = T.createToolRegistry(); regPerm.registerTool(F.tool({ tool_id: "fs.read", tool_type: "filesystem", version: "1.0.0", permissions_required: ["filesystem.read", "filesystem.write"], supported_operations: ["read", "list"], metadata: () => ({}), execute: () => Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }) }));
  ok("permission changed → DRIFT(permission_changed)", (await T.replay.compareTool(ev, { registry: regPerm })).reasons.indexOf("permission_changed") !== -1);
  let regVer = T.createToolRegistry(); regVer.registerTool(F.tool({ tool_id: "fs.read", tool_type: "filesystem", version: "2.0.0", permissions_required: ["filesystem.read"], supported_operations: ["read", "list"], metadata: () => ({}), execute: () => Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }) }));
  ok("tool version changed → DRIFT(tool_version_changed)", (await T.replay.compareTool(ev, { registry: regVer })).reasons.indexOf("tool_version_changed") !== -1);
  let regOp = T.createToolRegistry(); regOp.registerTool(F.tool({ tool_id: "fs.read", tool_type: "filesystem", version: "1.0.0", permissions_required: ["filesystem.read"], supported_operations: ["list"], metadata: () => ({}), execute: () => Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }) }));
  ok("operation removed → DRIFT(operation_removed)", (await T.replay.compareTool(ev, { registry: regOp })).reasons.indexOf("operation_removed") !== -1);
  let regSick = T.createToolRegistry(); regSick.registerTool(F.tool({ tool_id: "fs.read", tool_type: "filesystem", version: "1.0.0", permissions_required: ["filesystem.read"], supported_operations: ["read"], metadata: () => ({}), healthCheck: () => Promise.resolve({ ok: false }), execute: () => Promise.resolve({ status: "success", output_text: "x", output_classification: "file_content" }) }));
  ok("tool health changed → DRIFT(health_changed)", (await T.replay.compareTool(ev, { registry: regSick })).reasons.indexOf("health_changed") !== -1);
  ok("policy drift → DRIFT(policy_drift), no re-execution", (await T.replay.compareTool(ev, { registry: reg, currentBundle: denyTools })).reasons.indexOf("policy_drift") !== -1);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("CTF v0.1: tools are governed — contract→registry→GEL→eligibility→execute→record→replay. No tool bypasses the constitution.");
  process.exit(0);
})().catch(e => { console.error("tools test crashed:", e); process.exit(1); });
