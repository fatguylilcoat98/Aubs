/* AUBS Trust OS Layer 7 — Decision Proof (split-strength) + Decision Trace.
   Selection-satisfies-policy is self-verifiable ✓; the selection BASIS is runtime-attested ~
   (cost is NOT a factor — honest relabel of the false 'cheapest' claim); rejection rationale
   is graded by reason (policy ✓ / capability ≈ / cost ~) and capability/cost can NEVER be ✓.
   The Decision Trace is structured + strength-tagged and HARD-REFUSES chain-of-thought.
   Usage: node tests/run-trust-decision.cjs */
"use strict";
const S = require("../core/trust/strengths.js");
const DEC = require("../core/trust/proofs/decision.js");
const DT = require("../core/trust/decision-trace.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

// ── Decision Proof: split strength ───────────────────────────────────────────────────────────
{
  const proof = DEC.buildDecisionProof({
    selected: "local-webllm", classification: "personal", policyHash: "pb_1234",
    eligible: ["local-webllm", "openai-gpt"],
    rejected: [
      { id: "openai-gpt", reason: "REQUIRES_NETWORK_BUT_LOCAL_ONLY", kind: "policy" },
      { id: "qwen-tiny", reason: "capability too low", kind: "capability" },
      { id: "claude-big", reason: "more expensive", kind: "cost" }
    ]
  });
  const byWhat = (re) => proof.claims.find(c => re.test(c.what));
  t("selection-satisfies-policy is SELF-VERIFIABLE ✓", byWhat(/satisfies the recorded policy/).strength === S.SELF_VERIFIABLE);
  t("selection BASIS is runtime-attested ~ (cost not a factor; honest)", byWhat(/deterministic provider_id order/).strength === S.RUNTIME_ATTESTED);
  t("NO claim says 'cheapest meeting capability' as self-verifiable", !proof.claims.some(c => /cheapest/i.test(c.what) && c.strength === S.SELF_VERIFIABLE));
  t("policy rejection → self-verifiable ✓ (re-checkable)", byWhat(/REQUIRES_NETWORK_BUT_LOCAL_ONLY/).strength === S.SELF_VERIFIABLE);
  t("capability rejection → model-inferred ≈ (counterfactual, never ✓)", byWhat(/insufficient/).strength === S.MODEL_INFERRED);
  t("cost rejection → runtime-attested ~ (estimate, never ✓)", byWhat(/costlier/).strength === S.RUNTIME_ATTESTED);
  t("the pillar genuinely mixes strengths (✓ and ≈ both present)",
    proof.claims.some(c => c.strength === S.SELF_VERIFIABLE) && proof.claims.some(c => c.strength === S.MODEL_INFERRED));
}

// ── Decision Trace: structured, strength-tagged, no chain-of-thought ──────────────────────────
{
  const checkOrderTrace = [
    { step: "Constraints", detail: "passed", strength: S.SELF_VERIFIABLE, status: "ok" },
    { step: "Policies", detail: "allow", strength: S.SELF_VERIFIABLE, status: "ok" },
    { step: "ModelSelection", detail: "selected local-webllm", strength: S.RUNTIME_ATTESTED, status: "ok" }
  ];
  const trace = DT.buildDecisionTrace({ classification: "personal", checkOrderTrace, privacy: { strength: "egress-attested:sealed-door", claim: "door locked" } });
  t("trace starts with Classification and ends with Privacy", trace.lines[0].step === "Classification" && trace.lines[trace.lines.length - 1].step === "Privacy");
  t("every trace line is strength-tagged", trace.lines.every(l => typeof l.strength === "string"));
  t("trace declares it is NOT chain-of-thought", trace.has_chain_of_thought === false);

  // a line that smuggles raw model reasoning is HARD-REFUSED
  t("buildDecisionTrace refuses a line with a 'reasoning' (chain-of-thought) field",
    throws(() => DT.buildDecisionTrace({ classification: "x", checkOrderTrace: [{ step: "Model", reasoning: "first I thought... the user's SSN is...", strength: S.MODEL_INFERRED }] })));
  t("assertNoChainOfThought flags forbidden fields", DT.assertNoChainOfThought([{ step: "ok", strength: S.SELF_VERIFIABLE }]) === true && DT.assertNoChainOfThought([{ step: "x", thoughts: "...", strength: S.SELF_VERIFIABLE }]) === false);
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Layer 7 Decision: split-strength (selection ✓ / basis ~ / rejection policy✓·capability≈·cost~); no 'cheapest' proof; Decision Trace structured, strength-tagged, chain-of-thought refused.");
process.exit(0);
