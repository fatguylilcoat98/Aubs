/* AUBS Trust OS Layer 6 — Memory Proof + type reconciliation.
   Typed memory items, graded honestly (content-hash ✓ vs id-only ~), with the self-verifiable
   "no private/episodic memory was sent" claim. Usage: node tests/run-trust-memory.cjs */
"use strict";
const H = require("../core/trust/hash.js");
const S = require("../core/trust/strengths.js");
const MT = require("../core/trust/memory-types.js");
const MEM = require("../core/trust/proofs/memory.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// ── reconciliation ───────────────────────────────────────────────────────────────────────────
t("reconcile: Constraint is NOT a memory row (enforced first)", MT.RECONCILE.Constraint.memory === false);
t("reconcile: Policy/Capability live outside memory", MT.RECONCILE.Policy.memory === false && MT.RECONCILE.Capability.memory === false);
t("reconcile: Source→DOCUMENT, Episode→TASK|SUMMARY are memory", MT.RECONCILE.Source.memory === true && MT.RECONCILE.Episode.memory === true);
t("TASK/SUMMARY are private+episodic; FACT is not", MT.isPrivate("TASK") && MT.isEpisodic("SUMMARY") && !MT.isPrivate("FACT"));

(async () => {
  // ── memory proof: a hashed Fact + an id-only Preference, no private items ───────────────────
  {
    const fc = "User's name is Chris"; const fh = await H.sha256hex(fc);
    const proof = await MEM.buildMemoryProof([
      { id: "m_3", type: "FACT", scope: "private", content: fc, ref_hash: fh },   // ✓ hashed
      { id: "m_9", type: "PREFERENCE" }                                            // ~ id-only
    ]);
    t("memory: hashed Fact → self-verifiable ✓", proof.claims[0].strength === S.SELF_VERIFIABLE && /Used 1 FACT \(m_3\)/.test(proof.claims[0].what));
    t("memory: id-only Preference → runtime-attested ~", proof.claims[1].strength === S.RUNTIME_ATTESTED && /referenced by id/.test(proof.claims[1].what));
    t("memory: 'no private/episodic memory sent' claim, self-verifiable", proof.no_private_sent === true && proof.claims[2].strength === S.SELF_VERIFIABLE);
    t("memory: summary (1 by hash, 1 by id, 0 private)", proof.by_hash === 1 && proof.by_id === 1 && proof.private_in_used === 0);
  }

  // ── a private Episode in the used set is FLAGGED (which) ─────────────────────────────────────
  {
    const proof = await MEM.buildMemoryProof([{ id: "t_1", type: "TASK" }]);
    t("memory: private/episodic item in used set is flagged self-verifiably", proof.no_private_sent === false && proof.claims[proof.claims.length - 1].strength === S.SELF_VERIFIABLE && /private\/episodic/.test(proof.claims[proof.claims.length - 1].what));
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 6 Memory: typed items graded honestly (hash ✓ / id ~); 'no private Episodes sent' is self-verifiable; type taxonomy reconciled (Constraint/Policy/Capability live outside memory).");
  process.exit(0);
})().catch(e => { console.error("trust-memory test crashed:", e); process.exit(1); });
