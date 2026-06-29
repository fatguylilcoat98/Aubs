/* AUBS Decision Replay & Constitutional Audit — Milestone 7 tests.
   Proves a historical DecisionRecord becomes executable evidence: replay re-derives the
   governance decision and reports MATCH / DRIFT (with explicit reasons) / REJECTED. Replay
   never mutates history, requires ledger integrity first, and refuses tampered records.
   Usage: node tests/run-replay.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const K = require("../core/kernel");
const P = require("../core/providers");
const GEL = require("../core/gel");
const REPLAY = require("../core/replay");
const F = P.fakes;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// permissive + restrictive bundles for policy-change scenarios
const allowAll = { bundle_id: "v1", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow-all", precedence_level: "org", effect: "allow", enabled: true, reason: "v1 allow", match: {} }] };
const denyAll = { bundle_id: "v2", bundle_version: "2", require_explicit_allow: false, policies: [{ policy_id: "REG-14", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "v2 blocks model calls", match: { step_type: "model_call" } }] };

// run one governed kernel decision and capture evidence from it
async function makeDecision(bundle, registry, store, key) {
  const res = await K.executeIntent(
    { user_text: "what's the capital of France?", constraints: { local_only: true, max_egress: "none", data_classification: "personal" } },
    {}, { providerRegistry: registry, bundle: bundle, ledgerStore: store, signingKey: key.privateKey });
  return { res, evidence: REPLAY.captureDecision(res, { policyBundle: bundle, registry: registry }) };
}

(async () => {
  const key = await L.generateSigningKeyPair();

  // a governed local decision under allowAll
  let store = L.createMemoryStore();
  let reg = P.createRegistry(); reg.register(F.fakeLocalOkProvider);
  let { res, evidence } = await makeDecision(allowAll, reg, store, key);
  ok("a governed decision produces a record + capturable evidence", res.record && evidence.intent && evidence.plan && evidence.governance && evidence.policy_bundle);
  ok("evidence records kernel_version + provider snapshot", evidence.kernel_version === "kernel-0.1" && evidence.provider.provider_id === "fake-local-ok" && evidence.provider.capabilities);

  // ── EXACT replay of the identical record under the original bundle → MATCH ───────────
  let r = await REPLAY.replay(evidence, { mode: "exact", registry: reg, publicKey: key.publicKey, ledger: await store.all() });
  ok("exact replay of an identical record → MATCH", r.status === "MATCH" && r.reasons.length === 0);
  ok("replay produced deterministic comparison objects", r.comparison && r.comparison.governance.status === "SAME" && r.comparison.policy.status === "SAME" && r.comparison.provider.status === "SAME");

  // determinism: same evidence + same options → identical result
  let r2 = await REPLAY.replay(evidence, { mode: "exact", registry: reg, publicKey: key.publicKey, ledger: await store.all() });
  ok("replay is deterministic (same evidence → identical result)", JSON.stringify(r) === JSON.stringify(r2));

  // ── CURRENT replay under a CHANGED policy that now denies → DRIFT (governance + policy) ─
  r = await REPLAY.replay(evidence, { mode: "current", currentPolicyBundle: denyAll, registry: reg, publicKey: key.publicKey, ledger: await store.all() });
  ok("policy change → DRIFT", r.status === "DRIFT");
  ok("DRIFT explains policy_changed AND governance_changed (not just 'different')", r.reasons.indexOf("policy_changed") !== -1 && r.reasons.indexOf("governance_changed") !== -1);
  ok("comparison shows governance allow→deny with the new rule reason", r.comparison.governance.original === "allow" && r.comparison.governance.current === "deny" && /v2 blocks/.test(r.comparison.governance.reason || ""));

  // ── COMPARISON replay → side-by-side original vs current with difference ─────────────
  r = await REPLAY.replay(evidence, { mode: "comparison", currentPolicyBundle: denyAll, registry: reg, publicKey: key.publicKey, ledger: await store.all() });
  ok("comparison replay returns original + current + difference", r.mode === "comparison" && r.exact && r.current && r.exact.decision === "allow" && r.current.decision === "deny" && r.status === "DRIFT");

  // ── provider removed → DRIFT(provider_removed) ──────────────────────────────────────
  let emptyReg = P.createRegistry();
  r = await REPLAY.replay(evidence, { mode: "exact", registry: emptyReg, publicKey: key.publicKey, ledger: await store.all() });
  ok("provider removed from registry → DRIFT(provider_removed)", r.status === "DRIFT" && r.reasons.indexOf("provider_removed") !== -1 && r.comparison.provider.status === "REMOVED");

  // ── provider capability changed → DRIFT(provider_capability_changed) ─────────────────
  let changedReg = P.createRegistry();
  changedReg.register(Object.assign({}, F.fakeLocalOkProvider, { capabilities: P.fakes.localCaps({ zero_retention_claimed: false }) }));
  r = await REPLAY.replay(evidence, { mode: "exact", registry: changedReg, publicKey: key.publicKey, ledger: await store.all() });
  ok("provider capability changed → DRIFT(provider_capability_changed)", r.reasons.indexOf("provider_capability_changed") !== -1 && r.comparison.provider.status === "CHANGED");

  // ── provider unhealthy → DRIFT(provider_unhealthy) ──────────────────────────────────
  let sickReg = P.createRegistry();
  sickReg.register(Object.assign({}, F.fakeLocalOkProvider, { healthCheck: () => Promise.resolve({ ok: false }) }));
  r = await REPLAY.replay(evidence, { mode: "exact", registry: sickReg, publicKey: key.publicKey, ledger: await store.all() });
  ok("provider unhealthy → DRIFT(provider_unhealthy)", r.reasons.indexOf("provider_unhealthy") !== -1);

  // ── kernel version difference recorded + detected ───────────────────────────────────
  r = await REPLAY.replay(evidence, { mode: "exact", registry: reg, publicKey: key.publicKey, ledger: await store.all(), kernel_version: "kernel-9.9" });
  ok("kernel version difference → DRIFT(kernel_version_changed)", r.reasons.indexOf("kernel_version_changed") !== -1 && r.comparison.kernel_version.original === "kernel-0.1" && r.comparison.kernel_version.current === "kernel-9.9");

  // ── malformed DecisionRecord rejected ───────────────────────────────────────────────
  r = await REPLAY.replay({ evidence_version: "replay-1", record: null, intent: null }, { mode: "exact" });
  ok("malformed evidence → REJECTED (replay_incomplete), never 'different'", r.status === "REJECTED" && r.reasons.indexOf("replay_incomplete") !== -1);

  // ── ledger verification required: a broken chain blocks replay ──────────────────────
  let recs = await store.all();
  let tamperedLedger = recs.map(x => Object.assign({}, x));
  tamperedLedger.push(Object.assign({}, recs[recs.length - 1], { seq: recs.length + 5 }));  // break the chain/seq
  r = await REPLAY.replay(evidence, { mode: "exact", registry: reg, publicKey: key.publicKey, ledger: tamperedLedger });
  ok("ledger integrity required before replay (broken chain → REJECTED)", r.status === "REJECTED");

  // ── tampered record cannot replay (body modified → hash mismatch) ───────────────────
  let badEvidence = JSON.parse(JSON.stringify(evidence));
  badEvidence.record.output = "tampered output";   // body changed but record_hash not recomputed
  badEvidence.record.model_id = "evil-model";
  r = await REPLAY.replay(badEvidence, { mode: "exact", registry: reg, publicKey: key.publicKey });
  ok("tampered record cannot replay (REJECTED: record_tampered)", r.status === "REJECTED" && r.reasons.indexOf("record_tampered") !== -1);

  // ── intent swapped under an intact-looking record → binding fails → REJECTED ─────────
  let swapped = JSON.parse(JSON.stringify(evidence));
  swapped.intent.user_text = "a completely different question";
  r = await REPLAY.replay(swapped, { mode: "exact", registry: reg, publicKey: key.publicKey });
  ok("intent swapped (binding fails) → REJECTED(intent_changed)", r.status === "REJECTED" && r.reasons.indexOf("intent_changed") !== -1);

  // ── replay never mutates history: the original record/evidence is unchanged ──────────
  const before = JSON.stringify(evidence);
  await REPLAY.replay(evidence, { mode: "current", currentPolicyBundle: denyAll, registry: reg, publicKey: key.publicKey, ledger: await store.all() });
  ok("replay never mutates the evidence (history is immutable)", JSON.stringify(evidence) === before);
  ok("ledger still verifies after replays (replay touched nothing)", (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);

  // verification ≠ replay: an authentic record can still DRIFT under new policy
  ok("verification proves authenticity; replay proves reproducibility (distinct results)",
    (await REPLAY.verifyEvidence(evidence, key.publicKey)).ok === true &&
    (await REPLAY.replay(evidence, { mode: "current", currentPolicyBundle: denyAll, registry: reg, publicKey: key.publicKey })).status === "DRIFT");

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Replay v0.1: authentic records replayed; drift explained explicitly; history immutable; tamper rejected.");
  process.exit(0);
})().catch(e => { console.error("replay test crashed:", e); process.exit(1); });
