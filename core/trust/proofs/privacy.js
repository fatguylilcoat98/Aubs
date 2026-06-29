/* ============================================================================
   AUBS TRUST OS — Privacy Proof (Layer 5, §4.5)
   Truth · Safety · We Got Your Back

   Reads from the Layer-1 Trusted Egress Gateway (and its egress ledger). It makes the
   narrowest claim that is actually true — never "nothing else leaked" (unprovable in a
   browser):

   - Sealed door / Incognito (strongest, lead with this): the gateway was hard-disabled;
     0 requests, 0 bytes. A welded door is a binary structural claim →
     "egress-attested:sealed-door". Honest wording: "Nothing left this device. The door was locked."
   - Filtered egress (runtime-attested): every egress the runtime RECORDED passed through
     the one audited door; here are the payload hashes. NOT "nothing bypassed it."

   Built off to the side; consumes a gateway + its egress ledger, emits a proof slot.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);

  function buildPrivacyProof(gateway, egressLedger) {
    var pc = gateway ? gateway.privacyClaim() : { strength: "runtime-attested", requests: 0, bytes: 0, blocked: 0 };
    var sealed = gateway ? gateway.isSealed() : false;

    if (sealed) {
      var c = S.claim("Nothing left this device. The door was locked.", ["0 requests", "0 bytes"], "egress-attested:sealed-door",
        "in-browser sealed door — a binary structural claim; native/server can upgrade toward self-verifiable with OS network controls");
      return TR.proof([c], { sealed: true, requests: 0, bytes: 0 });
    }

    // Filtered: list the COMPLETE recorded egress (payload hashes), and state the limit plainly.
    var sent = egressLedger ? egressLedger.all().filter(function (r) { return r.outcome === "sent"; }) : [];
    var hashes = sent.map(function (r) { return r.payload_hash; });
    var claims = [
      S.claim("Every recorded egress went through one audited door (" + (pc.requests || 0) + " requests, " + (pc.bytes || 0) + " bytes).",
        hashes, S.RUNTIME_ATTESTED,
        "proves what was RECORDED as leaving, through one door; cannot prove nothing else left in-browser")
    ];
    if (pc.blocked) claims.push(S.claim((pc.blocked) + " egress attempt(s) were blocked by policy and not sent.", ["egress-ledger"], S.RUNTIME_ATTESTED, "recorded, not sent"));
    return TR.proof(claims, { sealed: false, requests: pc.requests || 0, bytes: pc.bytes || 0, blocked: pc.blocked || 0, recorded_hashes: hashes });
  }

  var API = { buildPrivacyProof: buildPrivacyProof };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_PRIVACY = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_PRIVACY = API;
})();
