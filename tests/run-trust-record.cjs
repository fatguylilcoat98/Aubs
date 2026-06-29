/* AUBS Trust OS Layer 2 — Trust Record assembler + HARD-LAW validator.
   Assembles the six proof pillars + trace into one record with a complete strengths map;
   validates that every claim carries a canonical strength and chain fields are present. Uses
   honestly-graded claims (e.g. Decision Proof SPLIT: selection ✓ self-verifiable, rejection
   ≈ model-inferred; Provenance ~ runtime-attested because memory/model are ids-not-hashes
   today). Usage: node tests/run-trust-record.cjs */
"use strict";
const S = require("../core/trust/strengths.js");
const TR = require("../core/trust/trust-record.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// A representative, honestly-graded proof set (what Layers 3–8 will populate for real).
function sampleRecord(over) {
  const integrity = TR.proof([S.claim("records intact, chain verified offline", ["chain"], S.SELF_VERIFIABLE, "assumes verifier run honestly")]);
  const provenance = TR.proof([S.claim("model/memory referenced by id", ["ids"], S.RUNTIME_ATTESTED, "ids not content-hashes yet")]);
  const grounding = TR.proof([
    S.claim("3 of 4 claims restorable to sources", ["spans"], S.SELF_VERIFIABLE, "facts only"),
    S.claim("1 claim has no source", [], S.UNSUPPORTED, "flagged, not hidden")
  ]);
  const decision = TR.proof([
    S.claim("selected model satisfies recorded policy", ["policy", "classification"], S.SELF_VERIFIABLE, "re-evaluable offline"),
    S.claim("rejected candidate estimated insufficient", [], S.MODEL_INFERRED, "counterfactual, not verified", { estimate: true })
  ]);
  const privacy = TR.proof([S.claim("nothing left this device", ["0 requests", "0 bytes"], "egress-attested:sealed-door", "in-browser sealed door")]);
  const memory = TR.proof([S.claim("used 1 user-approved Fact (m_3)", ["m_3"], S.SELF_VERIFIABLE, "which-only; no private Episodes sent")]);
  return TR.buildTrustRecord(Object.assign({
    chain: { seq: 7, prev_hash: "ab", record_hash: "cd", signature: "ef" }, intent_id: "i7", timestamp: "2026-06-29T00:00:00Z",
    integrity, provenance, grounding, decision, privacy, memory,
    trace: [{ stage: "GEL", detail: "allow", strength: S.SELF_VERIFIABLE }]
  }, over || {}));
}

// ── assembly ────────────────────────────────────────────────────────────────────────────────
{
  const r = sampleRecord();
  t("record carries all six proof slots + trace", TR.PROOF_SLOTS.every(s => r[s]) && Array.isArray(r.trace));
  t("strengths map covers every claim (8 claims across slots)", Object.keys(r.strengths).length === 8);
  t("strength summary counts are right (4 self-verifiable, 1 runtime, 1 model, 1 unsupported, +sealed-door maps to runtime=2)",
    r.strength_summary[S.SELF_VERIFIABLE] === 4 && r.strength_summary[S.RUNTIME_ATTESTED] === 2 && r.strength_summary[S.MODEL_INFERRED] === 1 && r.strength_summary[S.UNSUPPORTED] === 1);
  t("decision proof is SPLIT (a ✓ and a ≈ in one pillar)",
    r.decision.claims[0].strength === S.SELF_VERIFIABLE && r.decision.claims[1].strength === S.MODEL_INFERRED);
}

// ── validation (HARD LAW) ────────────────────────────────────────────────────────────────────
{
  const r = sampleRecord();
  t("validateTrustRecord ok for an honestly-graded record", TR.validateTrustRecord(r).ok === true);

  const noChain = sampleRecord(); delete noChain.signature;
  t("validate fails on a missing chain field", TR.validateTrustRecord(noChain).ok === false);

  // smuggle an unbadged claim directly into a slot
  const smuggled = sampleRecord(); smuggled.memory.claims.push({ what: "secret influence", limits: "x" });
  t("validate catches an unbadged claim smuggled into a slot", TR.validateTrustRecord(smuggled).ok === false);

  // a slot may be explicitly null (not yet built) without failing
  const partial = sampleRecord({ privacy: null });
  t("a slot explicitly null (not yet built) is allowed", TR.validateTrustRecord(partial).ok === true);
}

// ── honest summary line (feeds Glass Box later, invents nothing) ─────────────────────────────
t("summarize() renders strength counts with badges", /✓/.test(TR.summarize(sampleRecord())) && /⚠/.test(TR.summarize(sampleRecord())));

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Trust Record: six pillars + trace unified; every claim strength-mapped; decision proof split-strength; HARD-LAW validation catches unbadged claims and missing chain fields.");
process.exit(0);
