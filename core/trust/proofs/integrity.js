/* ============================================================================
   AUBS TRUST OS — Integrity Proof (Layer 3, §4.1) — self-verifiable
   Truth · Safety · We Got Your Back

   Claims: these records were not altered, deleted, or reordered.
   Verified: re-walk the hash chain + validate Ed25519 signatures against the device
   public key — exactly what spine/ledger.js verifyLedger does (this proof wraps it).
   Self-verifiable: a third party recomputes and compares, no trust required — with the
   one stated limit that the verifier itself is run honestly (hardware attestation is the
   native/server upgrade path, not a browser promise).

   Built off to the side: consumes records + public key, produces a Trust Record proof slot.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);
  var LEDGER = (typeof require !== "undefined") ? require("../../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);

  var LIMIT = "self-verifiable, but assumes the verifier is run honestly against the bundle (not a malicious local build)";

  // input: { records, publicKey }  (verifies via the real ledger)  OR  { ok, count } (precomputed)
  async function buildIntegrityProof(input) {
    input = input || {};
    var ok, count;
    if (input.records) {
      var res = await LEDGER.verifyLedger(input.records, input.publicKey || null);
      ok = res.ok; count = (typeof res.count === "number") ? res.count : input.records.length;
    } else {
      ok = !!input.ok; count = input.count || 0;
    }
    var c = ok
      ? S.claim("Records intact, " + count + " verified offline.", ["hash-chain", "ed25519-signatures"], S.SELF_VERIFIABLE, LIMIT)
      // a detected break is ALSO self-verifiable — you can re-derive the failure deterministically.
      : S.claim("Integrity FAILED — chain/signature mismatch detected.", ["hash-chain", "ed25519-signatures"], S.SELF_VERIFIABLE, LIMIT);
    return TR.proof([c], { verified: ok, count: count });
  }

  var API = { buildIntegrityProof: buildIntegrityProof };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_INTEGRITY = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_INTEGRITY = API;
})();
