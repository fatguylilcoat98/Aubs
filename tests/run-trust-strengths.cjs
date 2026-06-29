/* AUBS Trust OS Layer 2 — proof-strength taxonomy (HARD LAW) + honesty guards.
   Five strengths, distinct badges; every claim declares what/evidence/strength/limits; and
   the guards that make the architecture honest: estimates/counterfactuals and model-assisted
   output can NEVER be self-verifiable, and "nothing leaked" is only claimable as the sealed
   door. Usage: node tests/run-trust-strengths.cjs */
"use strict";
const S = require("../core/trust/strengths.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

// ── five strengths, distinct badges, ranked ───────────────────────────────────────────────
t("five canonical strengths", S.ALL.length === 5);
t("badges are visually distinct (the §8 law)", new Set(S.ALL.map(s => S.BADGE[s])).size === 5);
t("ranked strongest→weakest", S.rank(S.SELF_VERIFIABLE) > S.rank(S.RUNTIME_ATTESTED) && S.rank(S.RUNTIME_ATTESTED) > S.rank(S.MODEL_INFERRED) && S.rank(S.MODEL_INFERRED) > S.rank(S.USER_ASSERTED) && S.rank(S.USER_ASSERTED) > S.rank(S.UNSUPPORTED));

// ── claim() enforces the four declared things ─────────────────────────────────────────────
t("claim() builds a valid claim with what/evidence/strength/limits", (() => { const c = S.claim("X is true", ["src1"], S.SELF_VERIFIABLE, "facts only"); return c.strength === S.SELF_VERIFIABLE && c.badge === "✓" && c.limits === "facts only"; })());
t("claim() throws on undeclared/invalid strength", throws(() => S.claim("x", [], "totally-trustworthy", "none")));
t("claim() throws when limits omitted", throws(() => S.claim("x", [], S.RUNTIME_ATTESTED)));
t("claim() throws when evidence omitted", throws(() => S.claim("x", undefined, S.RUNTIME_ATTESTED, "none")));

// ── HONESTY GUARDS ────────────────────────────────────────────────────────────────────────
t("GUARD: an estimate/counterfactual may NOT be self-verifiable", throws(() => S.claim("Qwen too weak", [], S.SELF_VERIFIABLE, "estimate", { estimate: true })));
t("GUARD: a cost estimate as runtime-attested IS allowed", !throws(() => S.claim("Est. cost $0.002", ["meter"], S.RUNTIME_ATTESTED, "estimate", { estimate: true })));
t("GUARD: model-assisted output may NOT be self-verifiable", throws(() => S.claim("NLI says entailed", [], S.SELF_VERIFIABLE, "model", { modelAssisted: true })));
t("GUARD: 'nothing leaked' is NOT claimable as runtime-attested", throws(() => S.claim("nothing leaked", [], S.RUNTIME_ATTESTED, "none")));
t("GUARD: 'nothing left' IS claimable as the sealed-door form", !throws(() => S.claim("nothing left this device", ["0 requests"], "egress-attested:sealed-door", "in-browser")));

// ── normalize qualified forms → canonical badge class ─────────────────────────────────────
t("normalize sealed-door → runtime-attested + form", (() => { const n = S.normalize("egress-attested:sealed-door"); return n.strength === S.RUNTIME_ATTESTED && n.form === "sealed-door"; })());
t("normalize unknown → invalid (fails closed)", S.normalize("vibes").strength === null);

// ── validateClaims ────────────────────────────────────────────────────────────────────────
{
  const good = [S.claim("a", [], S.SELF_VERIFIABLE, "none"), S.claim("b", [], S.MODEL_INFERRED, "non-deterministic")];
  t("validateClaims ok for a valid set", S.validateClaims(good).ok === true);
  const bad = [{ what: "c", strength: "made-up", limits: "x" }];
  t("validateClaims flags a non-canonical strength", S.validateClaims(bad).ok === false);
  // REGRESSION (audit): a claim whose badge doesn't match its strength is rejected (no borrowed ✓)
  const mismatch = [{ what: "estimate", strength: S.RUNTIME_ATTESTED, badge: "✓", limits: "none" }];
  t("validateClaims flags badge≠strength (estimate wearing a borrowed ✓)", S.validateClaims(mismatch).ok === false && S.validateClaims(mismatch).issues.some(function (i) { return i.type === "badge_strength_mismatch"; }));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Proof-strength taxonomy: five distinct badges; every claim declares four things; estimates/model-assisted can't wear ✓; 'nothing leaked' only at the sealed door.");
process.exit(0);
