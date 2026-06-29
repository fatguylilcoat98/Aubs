/* AUBS Trust OS — END-TO-END capstone. One full turn through the whole stack:
   real ledger turn → build all SIX proofs from evidence → assemble the Trust Record →
   validate HARD LAW → re-verify offline (portable verifier) → render the Glass Box (Easy +
   Detailed). Proves the layers compose into one honest, validated, re-verifiable, rendered
   artifact. Usage: node tests/run-trust-e2e.cjs */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");
const T = require("../core/trust/index.js");
const H = T.hash;

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function throws(fn) { return fn().then(() => false).catch(() => true); }
const NOW = "2026-06-29T00:00:00Z";

(async () => {
  // ── a real turn → real ledger chain ─────────────────────────────────────────────────────────
  const key = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  await CHAT.runConstitutionalChat({ text: "Tell me about Sacramento", generate: async () => ({ text: "Sacramento is the capital of California.", finish: "stop" }), model_id: "qwen2.5-0.5b", intent_id: "i1", plan_id: "p1", created_at: NOW, ledgerStore: store, signingKey: key.privateKey });
  const records = await store.all();
  const last = records[records.length - 1];

  // ── evidence for the six proofs ───────────────────────────────────────────────────────────────
  const modelMeta = { model: "qwen2.5-0.5b", build: "x1" }; const modelHash = await H.sha256hex(modelMeta);
  const memContent = "User asked about Sacramento before."; const memHash = await H.sha256hex(memContent);

  // ── build a Trusted-Egress gateway session (sealed/Incognito for the strongest privacy) ─────
  const elog = T.egressLedger.createEgressLedger();
  const gw = T.egress.createGateway({ gate: { evaluate: () => ({ allow: true, target: "x" }) }, ledger: elog, send: () => Promise.resolve({}), sealed: true });
  await gw.egress({ x: 1 }, { classification: "public" });   // refused (sealed)

  // ── the six proofs ─────────────────────────────────────────────────────────────────────────
  const integrity = await T.proofs.integrity.buildIntegrityProof({ records, publicKey: key.publicKey });
  const provenance = await T.proofs.provenance.buildProvenanceProof([{ kind: "model", ref_hash: modelHash, content: modelMeta }, { kind: "policy bundle", id: "pb_1" }]);
  const grounding = T.proofs.grounding.buildGroundingProof({ claims: [{ text: "Sacramento is the capital of California." }, { text: "It has nine bridges." }], sources: [{ id: "s1", span: "Sacramento is the capital of California, USA." }] });
  const decision = T.proofs.decision.buildDecisionProof({ selected: "qwen2.5-0.5b", classification: "public", policyHash: "pb_1", eligible: ["qwen2.5-0.5b"], rejected: [{ id: "claude-big", reason: "more expensive", kind: "cost" }] });
  const privacy = T.proofs.privacy.buildPrivacyProof(gw, elog);
  const memory = await T.proofs.memory.buildMemoryProof([{ id: "m_1", type: "FACT", content: memContent, ref_hash: memHash }]);

  // ── check-order trace → decision trace (no chain-of-thought) ────────────────────────────────
  const co = await T.checkOrder.runCheckOrder({
    constraints: async () => ({ violated: false }), policies: async () => ({ decision: "allow" }),
    governedFacts: async () => ({ handled: false }), memory: async () => ({ items: [{ id: "m_1", type: "FACT" }] }),
    selection: async () => ({ provider: "qwen2.5-0.5b", basis: "deterministic order" })
  }, { classification: "public" });
  const dtrace = T.decisionTrace.buildDecisionTrace({ classification: "public", checkOrderTrace: co.trace, privacy: { strength: privacy.claims[0].strength, claim: privacy.claims[0].what } });

  // ── assemble + validate the Trust Record ────────────────────────────────────────────────────
  const record = T.record.buildTrustRecord({
    chain: { seq: last.seq, prev_hash: last.prev_hash, record_hash: last.record_hash, signature: last.signature },
    intent_id: "i1", timestamp: NOW, integrity, provenance, grounding, decision, privacy, memory, trace: dtrace.lines
  });
  const v = T.record.validateTrustRecord(record);
  t("E2E: assembled Trust Record validates (HARD LAW)", v.ok === true);
  t("E2E: all six pillars present + a decision trace", T.record.PROOF_SLOTS.every(s => record[s]) && Array.isArray(record.trace));
  t("E2E: decision proof is split-strength (✓ and ~/≈ present)", record.decision.claims.some(c => c.strength === T.strengths.SELF_VERIFIABLE) && record.decision.claims.some(c => c.strength !== T.strengths.SELF_VERIFIABLE));
  t("E2E: privacy is the sealed-door form (door locked)", /door was locked/i.test(record.privacy.claims[0].what));

  // ── portable verifier re-runs the self-verifiable set offline ───────────────────────────────
  const report = await T.verifier.verifyBundle({
    records, publicKey: key.publicKey,
    artifacts: [{ kind: "model", ref_hash: modelHash, content: modelMeta }, { kind: "policy", id: "pb_1" }],
    grounding: { claims: [{ text: "Sacramento is the capital of California." }, { text: "It has nine bridges." }], sources: [{ id: "s1", span: "Sacramento is the capital of California, USA." }] },
    memoryItems: [{ id: "m_1", type: "FACT", content: memContent, ref_hash: memHash }],
    egress: { sealed: true, requests: 0, bytes: 0 },
    decision: { selected: "qwen2.5-0.5b", policyHash: "pb_1", classification: "public" }
  });
  t("E2E: portable verifier re-verifies offline, ok", report.ok === true && report.reverified > 0);
  t("E2E: verifier separates reverified from attested_only", report.attested_only >= 1);

  // ── Glass Box renders from the record only ──────────────────────────────────────────────────
  const easy = T.glassBox.render(record, { mode: "easy" });
  t("E2E: Glass Box Easy is one honest sentence (model + privacy)", /qwen2\.5-0\.5b/.test(easy.text) && /door was locked|went through one/i.test(easy.text));
  const detailed = T.glassBox.render(record, { mode: "detailed" });
  t("E2E: Detailed has all pillar tabs + a 5-badge legend", Object.keys(detailed.tabs).length === 6 && detailed.legend.length === 5);
  t("E2E: every rendered claim carries a badge", Object.keys(detailed.tabs).every(k => detailed.tabs[k].every(c => !!c.badge)));
  t("E2E: the five legend badges are visually distinct", new Set(detailed.legend.map(l => l.badge)).size === 5);

  // ── Glass Box REFUSES to render an unbadged claim or invalid record ─────────────────────────
  t("E2E: render refuses an invalid record", await throws(async () => { const bad = JSON.parse(JSON.stringify(record)); delete bad.signature; T.glassBox.render(bad, { mode: "detailed" }); }));
  t("E2E: render refuses an unbadged claim smuggled into a slot", await throws(async () => { const bad = T.record.buildTrustRecord({ chain: { seq: 1, prev_hash: "a", record_hash: "b", signature: "c" }, intent_id: "i", memory: { claims: [{ what: "secret", limits: "x" }] } }); T.glassBox.render(bad, { mode: "detailed" }); }));
  t("E2E: renderClaim refuses a badge≠strength claim (no borrowed ✓)", await throws(async () => { T.glassBox.renderClaim({ what: "estimate", strength: T.strengths.RUNTIME_ATTESTED, badge: "✓", limits: "none" }); }));

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("\nGlass Box (Easy):\n  " + easy.text);
  console.log("\nTrust OS E2E: one turn → six proofs → validated Trust Record → re-verified offline → rendered Glass Box. The whole stack composes, honestly.");
  process.exit(0);
})().catch(e => { console.error("trust-e2e crashed:", e); process.exit(1); });
