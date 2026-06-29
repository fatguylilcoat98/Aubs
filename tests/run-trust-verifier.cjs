/* AUBS Trust OS Layer 8 — portable verifier. Re-runs self-verifiable proofs offline from an
   evidence bundle and honestly separates `reverified` (zero-trust, re-derived) from
   `attested_only` (display-only). A tamper anywhere flips ok=false. Usage: node tests/run-trust-verifier.cjs */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");
const H = require("../core/trust/hash.js");
const V = require("../core/trust/verifier.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const NOW = "2026-06-29T00:00:00Z";

(async () => {
  // a real ledger chain
  const key = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  await CHAT.runConstitutionalChat({ text: "hello", generate: async () => ({ text: "hi", finish: "stop" }), model_id: "m", intent_id: "i1", plan_id: "p1", created_at: NOW, ledgerStore: store, signingKey: key.privateKey });
  const records = await store.all();

  const modelContent = { model: "qwen2.5" }; const modelHash = await H.sha256hex(modelContent);
  const memContent = "User's name is Chris"; const memHash = await H.sha256hex(memContent);

  function bundle(over) {
    return Object.assign({
      records, publicKey: key.publicKey,
      artifacts: [{ kind: "model", ref_hash: modelHash, content: modelContent }, { kind: "policy", id: "pb_1" }],
      grounding: { claims: [{ text: "Chris lives in Sacramento" }, { text: "no source here" }], sources: [{ id: "s1", span: "Chris lives in Sacramento today." }] },
      memoryItems: [{ id: "m_3", type: "FACT", content: memContent, ref_hash: memHash }],
      egress: { sealed: true, requests: 0, bytes: 0 },
      decision: { selected: "local-webllm", policyHash: "pb_1", classification: "personal" }
    }, over || {});
  }

  // ── clean bundle: everything self-verifiable re-derives; ok ─────────────────────────────────
  {
    const r = await V.verifyBundle(bundle());
    t("clean bundle verifies ok", r.ok === true);
    t("integrity re-derived", r.pillars.integrity.reverified === true);
    t("provenance: 1 matched (model), 1 attested (id-only policy)", r.pillars.provenance.reverified === 1 && r.pillars.provenance.attested === 1);
    t("grounding: 1 restorable, 1 unsupported", r.pillars.grounding.reverified === 1 && r.pillars.grounding.unsupported === 1);
    t("memory: 1 re-hashed", r.pillars.memory.reverified >= 1);
    t("privacy sealed-door re-checked structurally (0/0)", r.pillars.privacy.reverified === true && r.pillars.privacy.form === "sealed-door");
    t("report separates reverified from attested_only", r.reverified > 0 && r.attested_only >= 1);
  }

  // ── tampered ledger → ok=false ───────────────────────────────────────────────────────────────
  {
    const bad = records.map(x => Object.assign({}, x)); bad[0] = Object.assign({}, bad[0], { record_hash: "deadbeef" });
    const r = await V.verifyBundle(bundle({ records: bad }));
    t("tampered ledger → ok=false (integrity_failed)", r.ok === false && r.issues.includes("integrity_failed"));
  }

  // ── tampered artifact → provenance_mismatch ─────────────────────────────────────────────────
  {
    const r = await V.verifyBundle(bundle({ artifacts: [{ kind: "model", ref_hash: modelHash, content: { model: "SWAPPED" } }] }));
    t("tampered artifact → ok=false (provenance_mismatch)", r.ok === false && r.issues.includes("provenance_mismatch"));
  }

  // ── sealed-door violated (requests>0 while sealed) → flagged ─────────────────────────────────
  {
    const r = await V.verifyBundle(bundle({ egress: { sealed: true, requests: 3, bytes: 99 } }));
    t("sealed door with traffic → ok=false (sealed_door_violated)", r.ok === false && r.issues.includes("sealed_door_violated"));
  }

  // ── filtered egress is attested-only, not re-derived ────────────────────────────────────────
  {
    const r = await V.verifyBundle(bundle({ egress: { sealed: false, requests: 2, bytes: 50 } }));
    t("filtered egress counted attested_only (not re-derived)", r.pillars.privacy.reverified === false && r.pillars.privacy.form === "filtered");
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 8 Verifier: self-verifiable proofs re-run offline; reverified vs attested_only separated; any tamper (ledger/artifact/sealed-door) flips ok=false.");
  process.exit(0);
})().catch(e => { console.error("trust-verifier test crashed:", e); process.exit(1); });
