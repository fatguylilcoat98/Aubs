/* ============================================================================
   AUBS TRUST OS — Decision Proof (Layer 7, §4.4) — SPLIT STRENGTH
   Truth · Safety · We Got Your Back

   The pillar the synthesis mislabeled. It contains different strengths and must declare each:

   - Selection-satisfies-policy (SELF-VERIFIABLE ✓): "the chosen model satisfies the recorded
     policy against the recorded classification." Re-evaluate inputs vs policy — the replay
     engine already does this.
   - Selection BASIS (RUNTIME-ATTESTED ~): HONEST relabel of the verification's FALSE finding.
     Selection is by deterministic provider_id order today; cost is NOT yet a factor. So the
     basis is a runtime policy, not a cost/capability proof. Never ✓.
   - Rejection rationale: graded per reason —
       policy reason   → SELF-VERIFIABLE ✓ (re-checkable against the recorded policy)
       capability est. → MODEL-INFERRED ≈ (a prediction about a model never run; counterfactual)
       cost estimate   → RUNTIME-ATTESTED ~ (a meter estimate, not verified)
     A capability/cost rejection may NEVER carry a self-verifiable ✓.

   Built off to the side. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);

  // input: { selected, classification, policyHash, eligible:[ids],
  //          rejected:[{ id, reason, kind:"policy"|"capability"|"cost" }] }
  function buildDecisionProof(input) {
    input = input || {};
    var claims = [];

    // (a) selection satisfies policy — self-verifiable (re-evaluable offline).
    claims.push(S.claim(
      "Selected " + (input.selected || "(none)") + " satisfies the recorded policy against the recorded classification.",
      [input.policyHash || "(policy)", input.classification || "(classification)"],
      S.SELF_VERIFIABLE, "re-evaluable offline: inputs vs policy (replay)"));

    // (b) selection BASIS — honest relabel: deterministic order, NOT cost.
    claims.push(S.claim(
      "Chosen among " + ((input.eligible || []).length || "the") + " eligible by deterministic provider_id order; cost is not yet a selection factor.",
      ["eligibility"], S.RUNTIME_ATTESTED, "runtime policy, not a cost/capability proof — never self-verifiable"));

    // (c) per rejected candidate — strength by reason kind.
    (input.rejected || []).forEach(function (r) {
      var kind = r.kind || "policy";
      if (kind === "policy") {
        claims.push(S.claim("Rejected " + r.id + ": " + r.reason + " (re-checkable against the recorded policy).", [r.reason], S.SELF_VERIFIABLE, "policy rejection is re-verifiable"));
      } else if (kind === "capability") {
        claims.push(S.claim("Estimated " + r.id + " insufficient: " + r.reason + ".", [], S.MODEL_INFERRED, "counterfactual about a model never run — not verified", { estimate: true }));
      } else { // cost
        claims.push(S.claim("Estimated " + r.id + " costlier: " + r.reason + ".", ["cost-meter"], S.RUNTIME_ATTESTED, "cost estimate, not verified", { estimate: true }));
      }
    });

    return TR.proof(claims, { selected: input.selected || null, eligible_count: (input.eligible || []).length, rejected_count: (input.rejected || []).length });
  }

  var API = { buildDecisionProof: buildDecisionProof };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_DECISION = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_DECISION = API;
})();
