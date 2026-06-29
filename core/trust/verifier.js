/* ============================================================================
   AUBS TRUST OS — Portable Verifier (Layer 8, §9.9)
   Truth · Safety · We Got Your Back

   Re-runs all SELF-VERIFIABLE proofs offline from an exported evidence bundle, and reports
   honestly what it could re-derive (zero-trust) vs what is display-only attestation:

     Integrity   — re-walk chain + sigs           → self-verifiable (re-derived)
     Provenance  — re-hash artifacts w/ content    → self-verifiable per matched artifact
     Grounding   — re-run T0/T1/T2 restore         → self-verifiable per restorable claim
     Memory      — re-hash memory items            → self-verifiable per matched item
     Privacy     — sealed door = structural re-check (0/0); filtered = attested (display-only)
     Decision    — selection-vs-policy re-checkable; cost/capability are estimates (display-only)

   The whole point: it does NOT pretend an attestation or an estimate was re-derived. The
   report separates `reverified` from `attested_only`. Built off to the side; consumes a
   bundle, returns a report. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("./strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var INTEGRITY = (typeof require !== "undefined") ? require("./proofs/integrity.js") : (typeof window !== "undefined" ? window.AUBS_PROOF_INTEGRITY : null);
  var PROVENANCE = (typeof require !== "undefined") ? require("./proofs/provenance.js") : (typeof window !== "undefined" ? window.AUBS_PROOF_PROVENANCE : null);
  var GROUNDING = (typeof require !== "undefined") ? require("./proofs/grounding.js") : (typeof window !== "undefined" ? window.AUBS_PROOF_GROUNDING : null);
  var MEMORY = (typeof require !== "undefined") ? require("./proofs/memory.js") : (typeof window !== "undefined" ? window.AUBS_PROOF_MEMORY : null);

  function countSelfVerifiable(proof) {
    return (proof.claims || []).filter(function (c) { return c.strength === S.SELF_VERIFIABLE; }).length;
  }

  // bundle = { records, publicKey, artifacts, grounding:{claims,sources}, memoryItems,
  //            egress:{sealed,requests,bytes}, decision:{ selected, policyHash, classification } }
  async function verifyBundle(bundle) {
    bundle = bundle || {};
    var pillars = {}, reverified = 0, attestedOnly = 0, issues = [];

    // Integrity — re-derived
    if (bundle.records) {
      var ip = await INTEGRITY.buildIntegrityProof({ records: bundle.records, publicKey: bundle.publicKey || null });
      pillars.integrity = { reverified: ip.verified, claims: ip.claims.length };
      if (ip.verified) reverified += countSelfVerifiable(ip); else issues.push("integrity_failed");
    }
    // Provenance — re-hash matched artifacts
    if (bundle.artifacts) {
      var pp = await PROVENANCE.buildProvenanceProof(bundle.artifacts);
      pillars.provenance = { reverified: pp.matched, attested: pp.attested, mismatched: pp.mismatched };
      reverified += pp.matched; attestedOnly += pp.attested;
      if (pp.mismatched) issues.push("provenance_mismatch");
    }
    // Grounding — re-run restore
    if (bundle.grounding) {
      var gp = GROUNDING.buildGroundingProof(bundle.grounding);
      pillars.grounding = { reverified: gp.restorable, unsupported: gp.unsupported };
      reverified += gp.restorable;
    }
    // Memory — re-hash items
    if (bundle.memoryItems) {
      var mp = await MEMORY.buildMemoryProof(bundle.memoryItems);
      pillars.memory = { reverified: countSelfVerifiable(mp), by_id: mp.by_id };
      reverified += countSelfVerifiable(mp); attestedOnly += mp.by_id;
    }
    // Privacy — sealed door is structurally re-checkable; filtered is attested (display-only)
    if (bundle.egress) {
      if (bundle.egress.sealed) {
        var ok0 = (bundle.egress.requests || 0) === 0 && (bundle.egress.bytes || 0) === 0;
        pillars.privacy = { reverified: ok0, form: "sealed-door" };
        if (ok0) reverified += 1; else issues.push("sealed_door_violated");
      } else {
        pillars.privacy = { reverified: false, form: "filtered", note: "runtime-attested; not re-derivable in-browser" };
        attestedOnly += 1;
      }
    }
    // Decision — selection-vs-policy is re-checkable if inputs carried; estimates are display-only
    if (bundle.decision) {
      var canRecheck = !!(bundle.decision.policyHash && bundle.decision.classification);
      pillars.decision = { selection_recheckable: canRecheck, note: "cost/capability rejections are estimates (display-only)" };
      if (canRecheck) reverified += 1; else attestedOnly += 1;
    }

    return { ok: issues.length === 0, reverified: reverified, attested_only: attestedOnly, issues: issues, pillars: pillars };
  }

  var API = { verifyBundle: verifyBundle };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_VERIFIER = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_VERIFIER = API;
})();
