/* AUBS Typed Scoped Memory — Milestone 9 tests.
   Proves memory is a governed constitutional subsystem: typed + scoped + owned +
   provenanced, GEL-gated reads/writes, ownership + schema enforcement, append-only
   supersession (history survives), tamper-evident signed log, governed DecisionRecords,
   and replayable retrieval drift — all deterministic, nothing silent.
   Usage: node tests/run-memory-tsm.cjs   (exit 0 = all pass) */
"use strict";
const M = require("../core/memory");
const L = require("../spine/ledger.js");

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

(async () => {
  const memKey = await L.generateSigningKeyPair();
  const drKey = await L.generateSigningKeyPair();
  const ledgerStore = L.createMemoryStore();
  const svc = M.createMemoryService({ signingKey: memKey.privateKey, ledgerStore: ledgerStore, ledgerKey: drKey.privateKey });
  const ctx = { actor: { user_id: "u1", scopes: ["private", "conversation"] }, conversation_id: "c1" };

  // ── Automatic FACT/PREFERENCE creation; other types are NOT auto-created ─────────────
  let auto = await svc.captureAuto([{ content: "likes fishing" }, { type: "PREFERENCE", content: "prefers short answers" }, { type: "PROFILE", content: "should not auto-create" }], ctx);
  ok("FACT auto-created from a statement", auto[0].ok === true && auto[0].memory.type === "FACT" && auto[0].memory.inferred === false);
  ok("PREFERENCE auto-created", auto[1].ok === true && auto[1].memory.type === "PREFERENCE");
  ok("PROFILE is NOT auto-creatable (rejected, never silent)", auto[2].ok === false && auto[2].reason === "type_not_auto_creatable");

  // ── Inference is ALWAYS tagged inferred; never silently promoted to fact ─────────────
  let inf = await svc.inferFact({ user_id: "u1", scope: "private", content: "probably drinks coffee", confidence: 0.4 }, ctx);
  ok("INFERENCE is created inferred:true", inf.ok === true && inf.memory.type === "INFERENCE" && inf.memory.inferred === true);
  let infForce = await svc.write({ user_id: "u1", type: "INFERENCE", inferred: false, scope: "private", content: "x" }, ctx);
  ok("INFERENCE can never be promoted to fact (inferred forced true)", infForce.memory.inferred === true);

  // ── Provenance + ownership are recorded ─────────────────────────────────────────────
  let f = await svc.write({ user_id: "u1", type: "FACT", scope: "private", content: "User's name is Chris", source_classification: "user_stated" }, ctx);
  ok("memory records provenance (timestamp, conversation, source) + owner", f.ok && f.memory.owner === "u1" && f.memory.provenance.conversation_id === "c1" && !!f.memory.provenance.timestamp);

  // ── Writes require ownership ─────────────────────────────────────────────────────────
  let ov = await svc.write({ user_id: "u2", owner: "u2", type: "FACT", scope: "private", content: "not mine" }, ctx);
  ok("ownership violation on write is denied", ov.ok === false && ov.reason === "ownership_violation");

  // ── Writes require schema validation ────────────────────────────────────────────────
  let badType = await svc.write({ user_id: "u1", type: "NOTATYPE", scope: "private", content: "x" }, ctx);
  ok("invalid type → schema_invalid (write rejected)", badType.ok === false && badType.reason === "schema_invalid");
  let badConf = await svc.write({ user_id: "u1", type: "FACT", scope: "private", content: "x", confidence: "high" }, ctx);
  ok("invalid confidence → schema_invalid", badConf.ok === false && badConf.reason === "schema_invalid");
  let badScope = await svc.write({ user_id: "u1", type: "FACT", scope: "nowhere", content: "x" }, ctx);
  ok("invalid scope → schema_invalid", badScope.ok === false && badScope.reason === "schema_invalid");

  // ── Read returns the documented shape: memories, reason, confidence, permission ──────
  let rd = await svc.read({ user_id: "u1", scope: "private" }, ctx);
  ok("read returns {memories, reason, confidence, permission}", rd.ok === true && Array.isArray(rd.memories) && typeof rd.confidence === "number" && !!rd.permission && !!rd.reason);
  ok("owner reads own private memory in-scope", rd.memories.some(m => m.content === "User's name is Chris"));

  // ── Cross-scope: denial without authorization, allow WITH an explicit grant ──────────
  await svc.write({ user_id: "u1", type: "PROFILE", scope: "organization", content: "org-only profile" }, { actor: { user_id: "u1", scopes: ["organization"] }, conversation_id: "c1" });
  const outsider = { actor: { user_id: "u9", scopes: ["private"] }, conversation_id: "c2" };
  let denyRead = await svc.read({ user_id: "u1", scope: "organization" }, outsider);
  ok("cross-scope read DENIED without authorization", denyRead.memories.length === 0 && denyRead.denied.some(d => d.reason === "cross_scope_denied"));
  let grantRead = await svc.read({ user_id: "u1", scope: "organization" }, Object.assign({}, outsider, { grants: [{ scope: "organization", allow: true }] }));
  ok("cross-scope read ALLOWED with an explicit grant", grantRead.memories.length === 1);

  // ── Supersession: edit appends a new VERSION (same id); history survives ─────────────
  let base = await svc.write({ user_id: "u1", type: "FACT", scope: "private", content: "old value", confidence: 0.9 }, ctx);
  let beforeRead = await svc.read({ user_id: "u1", text: "old value" }, ctx);
  let memSnap = M.replay.snapshotFromRead(beforeRead);
  let sup = await svc.supersede(base.memory.memory_id, { content: "new value", confidence: 0.7 }, ctx);
  ok("supersede succeeds (new version, same memory_id)", sup.ok === true);
  let snap = await svc.snapshot();
  ok("active view shows the NEW version only; old value not active", snap.active.some(m => m.content === "new value") && !snap.active.some(m => m.content === "old value"));
  ok("history survives (log holds more records than active)", snap.log.length > snap.active.length && M.store.historyOf(snap.log, base.memory.memory_id).length >= 2);

  // ── Deletes never physically erase (logical delete = a deactivating version) ─────────
  let del = await svc.remove(base.memory.memory_id, ctx);
  let snap2 = await svc.snapshot();
  ok("delete removes from ACTIVE but keeps history", del.ok === true && !snap2.active.some(m => m.memory_id === base.memory.memory_id) && M.store.historyOf(snap2.log, base.memory.memory_id).length >= 3);

  // ── Replay / drift detection (no history mutation) ──────────────────────────────────
  let cmpSup = M.replay.compareMemory(memSnap, snap, ctx);
  ok("replay detects supersession + confidence change", cmpSup.status === "DRIFT" && cmpSup.reasons.indexOf("memory_superseded") !== -1 && cmpSup.reasons.indexOf("memory_confidence_changed") !== -1);
  let cmpDel = M.replay.compareMemory(memSnap, snap2, ctx);
  ok("replay detects removal after delete", cmpDel.reasons.indexOf("memory_removed") !== -1);
  // permission drift: same memory, but the reader loses scope authorization
  let privId = (await svc.read({ user_id: "u1", scope: "private" }, ctx)).memories[0];
  let permSnap = M.replay.snapshotFromRead({ memories: [privId] });
  let cmpPerm = M.replay.compareMemory(permSnap, await svc.snapshot(), { actor: { user_id: "u9", scopes: [] } });
  ok("replay detects permission drift (reader can no longer read)", cmpPerm.reasons.indexOf("memory_permission_changed") !== -1);
  // scope drift: supersede that changes scope
  let s2 = await svc.write({ user_id: "u1", type: "FACT", scope: "private", content: "scoped item" }, ctx);
  let s2Read = await svc.read({ user_id: "u1", text: "scoped item" }, ctx);
  let s2Snap = M.replay.snapshotFromRead(s2Read);
  await svc.supersede(s2.memory.memory_id, { scope: "workspace" }, ctx);
  let cmpScope = M.replay.compareMemory(s2Snap, await svc.snapshot(), ctx);
  ok("replay detects scope change", cmpScope.reasons.indexOf("memory_scope_changed") !== -1);
  // determinism
  let cmpA = M.replay.compareMemory(memSnap, snap, ctx), cmpB = M.replay.compareMemory(memSnap, snap, ctx);
  ok("memory replay is deterministic", JSON.stringify(cmpA) === JSON.stringify(cmpB));

  // ── GEL governs memory: a deny policy blocks reads/writes (with a DecisionRecord) ────
  const denyReads = { bundle_id: "mem-deny", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-mem-read", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "memory locked", match: { step_type: "memory_read" } }] };
  const svcDeny = M.createMemoryService({ signingKey: memKey.privateKey, ledgerStore: L.createMemoryStore(), ledgerKey: drKey.privateKey, policyBundle: denyReads });
  await svcDeny.write({ user_id: "u1", type: "FACT", scope: "private", content: "secret" }, ctx);   // write allowed (memory_write not denied)
  let govDenied = await svcDeny.read({ user_id: "u1" }, ctx);
  ok("GEL deny blocks the read (governance_deny), nothing leaks", govDenied.ok === false && /governance_/.test(govDenied.reason) && govDenied.memories.length === 0);

  // ── Every memory op produced a governed DecisionRecord; the ledger verifies ─────────
  ok("memory ops wrote DecisionRecords (provider=memory)", (await ledgerStore.count()) > 5 && (await ledgerStore.all()).every(r => r.provider === "memory"));
  ok("the memory DecisionRecord ledger verifies", (await L.verifyLedger(await ledgerStore.all(), drKey.publicKey)).ok === true);

  // ── Tamper-evident memory log ───────────────────────────────────────────────────────
  const tamperKey = await L.generateSigningKeyPair();
  const tsvc = M.createMemoryService({ signingKey: tamperKey.privateKey });
  await tsvc.write({ user_id: "u1", type: "FACT", scope: "private", content: "honest" }, ctx);
  await tsvc.write({ user_id: "u1", type: "FACT", scope: "private", content: "also honest" }, ctx);
  ok("clean memory log verifies (signed + hash-chained)", (await tsvc.verify(tamperKey.publicKey)).ok === true);
  tsvc._store._raw[0].content = "TAMPERED";   // attack the raw stored record
  ok("tampered memory log FAILS verification", (await tsvc.verify(tamperKey.publicKey)).ok === false);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("TSM v0.1: memory is governed — typed/scoped/owned, GEL-gated, append-only, signed, replayable. Nothing silent.");
  process.exit(0);
})().catch(e => { console.error("memory-tsm test crashed:", e); process.exit(1); });
