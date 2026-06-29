/* AUBS Trust OS Layer 4 — Grounding Proof (deterministic, offline, model-free).
   Restorable factual claims earn self-verifiable ✓ with the tier (T0/T1/T2); unsupported
   claims are flagged ⚠, never hidden. No model in the loop. Usage: node tests/run-trust-grounding.cjs */
"use strict";
const S = require("../core/trust/strengths.js");
const GR = require("../core/trust/proofs/grounding.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const sources = [
  { id: "s1", span: "Chris lives in Sacramento, California." },
  { id: "s2", span: "The meeting is scheduled for Tuesday at 3pm." }
];

// ── restore tiers ───────────────────────────────────────────────────────────────────────────
t("T0 exact verbatim → restorable", GR.restore("Chris lives in Sacramento, California.", sources).tier === "T0-exact");
t("T1 normalized (case/punct) → restorable", GR.restore("chris lives in sacramento california", sources).tier === "T1-normalized");
t("T2 token-subset → restorable", GR.restore("meeting Tuesday 3pm", sources).tier === "T2-token-subset");
t("no source → not restorable (null)", GR.restore("Chris owns three boats", sources) === null);

// ── proof grading ─────────────────────────────────────────────────────────────────────────
{
  const proof = GR.buildGroundingProof({
    claims: [
      { text: "Chris lives in Sacramento, California." },   // T0 → ✓
      { text: "meeting Tuesday 3pm" },                       // T2 → ✓
      { text: "Chris owns three boats" }                     // none → ⚠ unsupported
    ],
    sources
  });
  t("restorable claims are self-verifiable ✓", proof.claims[0].strength === S.SELF_VERIFIABLE && proof.claims[1].strength === S.SELF_VERIFIABLE);
  t("unsupported claim is flagged ⚠ (not hidden)", proof.claims[2].strength === S.UNSUPPORTED && /no source/.test(proof.claims[2].what));
  t("summary: 2 of 3 restorable, all_restorable false", proof.restorable === 2 && proof.unsupported === 1 && proof.total === 3 && proof.all_restorable === false);
  t("no model strength appears (zero-trust set)", proof.claims.every(c => c.strength !== S.MODEL_INFERRED));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Layer 4 Grounding: deterministic offline restore (T0/T1/T2); restorable → ✓, unsupported → ⚠ flagged; model tier excluded.");
process.exit(0);
