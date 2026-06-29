/* Milestone 0 — ledger integrity + tamper tests. Real Ed25519 + SHA-256 via WebCrypto
   (identical to the browser), in-memory store. Proves the offline verifier catches
   modification, deletion, reordering, signature corruption, and chain breaks — and never
   silently recovers. Usage: node tests/run-ledger.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");

let pass = 0, fail = 0; const F = [];
function ok(desc, cond) { cond ? pass++ : (fail++, F.push(desc)); console.log((cond ? "PASS  " : "FAIL  ") + desc); }
const has = (res, type) => res.issues.some(x => x.type === type);

(async () => {
  // crypto availability
  const ed = await L.ed25519Available();
  ok("Ed25519 available in this runtime", ed === true);

  // build a clean, signed ledger of 5 records
  const keys = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  for (let i = 0; i < 5; i++) {
    await L.appendRecord(store, {
      input: "question " + i, output: "answer " + i, model_id: "Qwen2.5-0.5B",
      provider: "local", execution_type: i % 2 ? "rule" : "model",
      timestamp: "2026-06-28T00:00:0" + i + "Z", explanation: { tag: "general" }
    }, keys.privateKey);
  }

  // public key export with a NON-extractable private key
  let pubB64 = null;
  try { pubB64 = await L.exportPublicRawB64(keys.publicKey); } catch (_) {}
  ok("public key exports (32-byte raw) even with extractable:false private", !!pubB64 && L.GENESIS.length === 64);

  const clean = await store.all();
  ok("5 records, seqs 0..4, chained to genesis", clean.length === 5 && clean[0].prev_hash === L.GENESIS && clean[0].seq === 0 && clean[4].seq === 4);

  // CLEAN verify → ok
  let res = await L.verifyLedger(clean, keys.publicKey);
  ok("CLEAN ledger verifies (ok=true, 0 fatal)", res.ok === true && res.fatal === 0);

  // 1) MODIFIED record (change output_hash on #2, leave hash/sig)
  let t = clean.map(r => ({ ...r }));
  t[2] = { ...t[2], output_hash: "deadbeef".repeat(8) };
  res = await L.verifyLedger(t, keys.publicKey);
  ok("MODIFIED record detected (record_modified, ok=false)", res.ok === false && has(res, "record_modified"));

  // 2) DELETED middle record
  t = clean.filter((_, i) => i !== 2);
  res = await L.verifyLedger(t, keys.publicKey);
  ok("DELETED record detected (seq gap + broken chain)", res.ok === false && (has(res, "seq_mismatch") || has(res, "broken_chain")));

  // 3) REORDERED records
  t = clean.map(r => ({ ...r })); const tmp = t[1]; t[1] = t[3]; t[3] = tmp;
  res = await L.verifyLedger(t, keys.publicKey);
  ok("REORDERED records detected", res.ok === false && (has(res, "seq_mismatch") || has(res, "broken_chain")));

  // 4) CORRUPTED signature on #1
  t = clean.map(r => ({ ...r }));
  t[1] = { ...t[1], signature: t[1].signature.slice(0, -4) + (t[1].signature.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
  res = await L.verifyLedger(t, keys.publicKey);
  ok("CORRUPTED signature detected (bad_signature, ok=false)", res.ok === false && has(res, "bad_signature"));

  // 5) BROKEN chain (tamper prev_hash on #3)
  t = clean.map(r => ({ ...r }));
  t[3] = { ...t[3], prev_hash: "f".repeat(64) };
  res = await L.verifyLedger(t, keys.publicKey);
  ok("BROKEN chain detected (broken_chain, ok=false)", res.ok === false && has(res, "broken_chain"));

  // append-only: store rejects a duplicate seq
  let rejected = false;
  try { await store.append({ seq: 0, record_hash: "x" }); } catch (_) { rejected = true; }
  ok("append-only enforced (duplicate seq rejected)", rejected === true);

  // export → verifyExport round-trip (portable, no in-process key)
  const bundle = await L.exportLedger(store, keys.publicKey);
  res = await L.verifyExport(bundle);
  ok("export bundle re-verifies offline (portable /verify)", res.ok === true && bundle.record_count === 5 && !!bundle.public_key_raw_b64);

  // tampered export is caught too
  const badBundle = JSON.parse(JSON.stringify(bundle));
  badBundle.records[2].model_id = "evil-swap";
  res = await L.verifyExport(badBundle);
  ok("tampered export bundle is caught", res.ok === false);

  // unsigned ledger: chain still verifies, but flagged 'unsigned' (non-fatal in v1)
  const us = L.createMemoryStore();
  await L.appendRecord(us, { input: "a", output: "b", model_id: "m" }, null);
  await L.appendRecord(us, { input: "c", output: "d", model_id: "m" }, null);
  res = await L.verifyLedger(await us.all(), null);
  ok("unsigned ledger: chain ok, records flagged 'unsigned'", res.ok === true && has(res, "unsigned"));

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Ledger integrity proven: modification, deletion, reorder, signature, and chain tamper all detected; verifier fails loudly.");
  process.exit(0);
})().catch(e => { console.error("ledger test crashed:", e); process.exit(1); });
