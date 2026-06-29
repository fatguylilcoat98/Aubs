/* ============================================================================
   AUBS TRUST OS — barrel (Layer 9)
   Truth · Safety · We Got Your Back
   Convenience aggregator of the off-to-the-side Trust OS modules. Importing this does NOT
   wire anything into the live app — it only gathers the pieces for the harness / future
   wire-up. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  function pick(p, w) { return isNode ? require(p) : (typeof window !== "undefined" ? window[w] : null); }

  var API = {
    strengths:  pick("./strengths.js", "AUBS_STRENGTHS"),
    hash:       pick("./hash.js", "AUBS_TRUST_HASH"),
    record:     pick("./trust-record.js", "AUBS_TRUST_RECORD"),
    egress:     pick("./egress.js", "AUBS_EGRESS"),
    egressLedger: pick("./egress-ledger.js", "AUBS_EGRESS_LEDGER"),
    bundle:     pick("../facts/bundle.js", "AUBS_BUNDLE_TRUST"),
    memoryTypes: pick("./memory-types.js", "AUBS_MEMORY_TYPES"),
    reasoningPermission: pick("./reasoning-permission.js", "AUBS_REASONING_PERMISSION"),
    checkOrder: pick("./check-order.js", "AUBS_CHECK_ORDER"),
    decisionTrace: pick("./decision-trace.js", "AUBS_DECISION_TRACE"),
    verifier:   pick("./verifier.js", "AUBS_VERIFIER"),
    glassBox:   pick("./glass-box.js", "AUBS_GLASS_BOX"),
    proofs: {
      integrity:  pick("./proofs/integrity.js", "AUBS_PROOF_INTEGRITY"),
      provenance: pick("./proofs/provenance.js", "AUBS_PROOF_PROVENANCE"),
      grounding:  pick("./proofs/grounding.js", "AUBS_PROOF_GROUNDING"),
      decision:   pick("./proofs/decision.js", "AUBS_PROOF_DECISION"),
      privacy:    pick("./proofs/privacy.js", "AUBS_PROOF_PRIVACY"),
      memory:     pick("./proofs/memory.js", "AUBS_PROOF_MEMORY")
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TRUST = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_TRUST = API;
})();
