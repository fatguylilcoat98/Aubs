/* ============================================================================
   AUBS TRUST OS — Provenance Proof (Layer 3, §4.2)
   Truth · Safety · We Got Your Back

   Claims: every artifact (model id/version, policy bundle, memory record, retrieved span)
   is the one referenced, by hash.
   Verified: hash-match each carried artifact against its reference in the record.

   THE CORRECTION (from verification): today the record references model/memory/docs by
   ID, not content hash — so those are only *runtime-attested*, not self-verifiable. This
   proof grades HONESTLY per artifact:
     - artifact carries content + a reference hash, and they match → SELF-VERIFIABLE ✓
     - hashes DON'T match → self-verifiable FAILURE (tamper detected)
     - artifact is id-only (no content hash carried) → RUNTIME-ATTESTED ~, with the
       explicit upgrade note: carry the content hash to earn ✓.

   So an estimate never wears a proof badge, and an id-only reference never claims to be
   re-derivable. Built off to the side; consumes an artifact list, emits a proof slot.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);
  var H = (typeof require !== "undefined") ? require("../hash.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_HASH : null);

  // artifacts: [{ kind, id?, ref_hash?, content? }]
  //   - content + ref_hash present → hash-matched, self-verifiable
  //   - id-only (no content/ref_hash) → runtime-attested
  async function buildProvenanceProof(artifacts) {
    artifacts = artifacts || [];
    var claims = [], matched = 0, attested = 0, mismatched = 0;
    for (var i = 0; i < artifacts.length; i++) {
      var a = artifacts[i];
      var kind = a.kind || "artifact";
      if (a.content !== undefined && a.ref_hash) {
        var h = await H.sha256hex(a.content);
        if (h === a.ref_hash) {
          matched++;
          claims.push(S.claim(kind + " hash-matches its record.", [a.ref_hash], S.SELF_VERIFIABLE, "re-derivable offline; content-hash verified"));
        } else {
          mismatched++;
          claims.push(S.claim(kind + " MISMATCH — content does not hash to its record.", [a.ref_hash, h], S.SELF_VERIFIABLE, "tamper detected; deterministically re-derivable"));
        }
      } else {
        attested++;
        claims.push(S.claim(kind + " referenced by id" + (a.id ? " " + a.id : "") + " (not content-hashed).", [a.id || "(id)"], S.RUNTIME_ATTESTED, "id-only; carry the content hash to upgrade to self-verifiable"));
      }
    }
    return TR.proof(claims, { matched: matched, attested: attested, mismatched: mismatched, all_match: mismatched === 0 });
  }

  var API = { buildProvenanceProof: buildProvenanceProof };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_PROVENANCE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_PROVENANCE = API;
})();
