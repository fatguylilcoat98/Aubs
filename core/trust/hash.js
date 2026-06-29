/* ============================================================================
   AUBS TRUST OS — shared hash util (Layer 3)
   Truth · Safety · We Got Your Back
   Deterministic canonical JSON + SHA-256, the same primitives the ledger uses, so a
   third party recomputes identical hashes offline. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var CRYPTO = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto
             : (typeof require !== "undefined" ? require("crypto").webcrypto : null);
  var SUBTLE = CRYPTO ? CRYPTO.subtle : null;
  var ENC = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;

  function canonicalJSON(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    var k = Object.keys(v).sort();
    return "{" + k.map(function (x) { return JSON.stringify(x) + ":" + canonicalJSON(v[x]); }).join(",") + "}";
  }
  function sha256hex(input) {
    // crypto.subtle exists only in a SECURE CONTEXT (https/localhost). Degrade cleanly instead
    // of throwing a confusing error — callers (assembleTrustRecord) treat rejection as "no record".
    if (!SUBTLE || !ENC) return Promise.reject(new Error("crypto.subtle/TextEncoder unavailable — secure context (https/localhost) required"));
    var str = (typeof input === "string") ? input : canonicalJSON(input);
    return SUBTLE.digest("SHA-256", ENC.encode(str)).then(function (buf) {
      var b = new Uint8Array(buf), h = "";
      for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
      return h;
    });
  }

  var API = { canonicalJSON: canonicalJSON, sha256hex: sha256hex };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TRUST_HASH = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_TRUST_HASH = API;
})();
