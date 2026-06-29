/* AUBS Trust OS Layer 3 — Integrity + Provenance proofs.
   Integrity wraps the real ledger (re-walk chain + verify sigs offline → self-verifiable;
   tamper is detected). Provenance grades HONESTLY per artifact: content-hash match → ✓
   self-verifiable; mismatch → ✓ detected-failure; id-only → ~ runtime-attested (the
   correction the verification forced). Both assemble into a HARD-LAW-valid Trust Record.
   Usage: node tests/run-trust-proofs.cjs */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");
const H = require("../core/trust/hash.js");
const S = require("../core/trust/strengths.js");
const TR = require("../core/trust/trust-record.js");
const INTEGRITY = require("../core/trust/proofs/integrity.js");
const PROVENANCE = require("../core/trust/proofs/provenance.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const NOW = "2026-06-29T00:00:00Z";

(async () => {
  // ── INTEGRITY against a REAL ledger chain (populated by a real constitutional turn) ────────
  const key = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  await CHAT.runConstitutionalChat({ text: "hello", generate: async () => ({ text: "hi", finish: "stop" }), model_id: "m", intent_id: "i1", plan_id: "p1", created_at: NOW, ledgerStore: store, signingKey: key.privateKey });
  await CHAT.runConstitutionalChat({ text: "again", generate: async () => ({ text: "ok", finish: "stop" }), model_id: "m", intent_id: "i2", plan_id: "p2", created_at: NOW, ledgerStore: store, signingKey: key.privateKey });
  const records = await store.all();

  {
    const proof = await INTEGRITY.buildIntegrityProof({ records, publicKey: key.publicKey });
    t("integrity: intact chain → verified, self-verifiable ✓", proof.verified === true && proof.claims[0].strength === S.SELF_VERIFIABLE && proof.claims[0].badge === "✓");
    t("integrity: claim states the count verified offline", /verified offline/.test(proof.claims[0].what) && proof.count === records.length);
  }
  {
    const tampered = records.map(r => Object.assign({}, r));
    tampered[0] = Object.assign({}, tampered[0], { record_hash: "deadbeef" });
    const proof = await INTEGRITY.buildIntegrityProof({ records: tampered, publicKey: key.publicKey });
    t("integrity: tampered chain → FAILED, still self-verifiable (re-derivable break)", proof.verified === false && /FAILED/.test(proof.claims[0].what) && proof.claims[0].strength === S.SELF_VERIFIABLE);
  }

  // ── PROVENANCE — honest per-artifact grading ───────────────────────────────────────────────
  {
    const modelContent = { model: "qwen2.5-0.5b", build: "abc" };
    const refHash = await H.sha256hex(modelContent);
    const memContent = "User's name is Chris";
    const memHash = await H.sha256hex(memContent);

    const proof = await PROVENANCE.buildProvenanceProof([
      { kind: "model", ref_hash: refHash, content: modelContent },                 // matches → ✓
      { kind: "memory item m_3", ref_hash: memHash, content: memContent },          // matches → ✓
      { kind: "policy bundle", id: "pb_1234" },                                     // id-only → ~
      { kind: "retrieved span", ref_hash: "00ff", content: "different content" }    // mismatch → ✓ failure
    ]);
    t("provenance: matched artifact → self-verifiable ✓", proof.claims[0].strength === S.SELF_VERIFIABLE && /hash-matches/.test(proof.claims[0].what));
    t("provenance: id-only artifact → runtime-attested ~ (honest, not ✓)", proof.claims[2].strength === S.RUNTIME_ATTESTED && /not content-hashed/.test(proof.claims[2].what));
    t("provenance: mismatch → self-verifiable detected-failure", proof.claims[3].strength === S.SELF_VERIFIABLE && /MISMATCH/.test(proof.claims[3].what));
    t("provenance: summary counts (2 matched, 1 attested, 1 mismatched; all_match false)", proof.matched === 2 && proof.attested === 1 && proof.mismatched === 1 && proof.all_match === false);
  }

  // ── assemble both into a HARD-LAW-valid Trust Record ───────────────────────────────────────
  {
    const integrity = await INTEGRITY.buildIntegrityProof({ records, publicKey: key.publicKey });
    const mc = { model: "m" }; const mh = await H.sha256hex(mc);
    const provenance = await PROVENANCE.buildProvenanceProof([{ kind: "model", ref_hash: mh, content: mc }, { kind: "memory", id: "m_1" }]);
    const rec = TR.buildTrustRecord({
      chain: { seq: records[records.length - 1].seq, prev_hash: "x", record_hash: records[records.length - 1].record_hash, signature: records[records.length - 1].signature },
      intent_id: "i2", integrity, provenance, grounding: null, decision: null, privacy: null, memory: null,
      trace: [{ stage: "Integrity", detail: "verified", strength: S.SELF_VERIFIABLE }]
    });
    const v = TR.validateTrustRecord(rec);
    t("trust record with integrity+provenance validates (HARD LAW)", v.ok === true);
    t("strengths map covers all claims; not-yet-built slots null", Object.keys(rec.strengths).length === (integrity.claims.length + provenance.claims.length) && rec.grounding === null);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 3 Integrity+Provenance: integrity self-verifiable against the real ledger (tamper detected); provenance graded honestly per artifact (content-hash ✓ vs id-only ~); assembled into a valid Trust Record.");
  process.exit(0);
})().catch(e => { console.error("trust-proofs test crashed:", e); process.exit(1); });
