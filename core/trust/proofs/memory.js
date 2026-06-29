/* ============================================================================
   AUBS TRUST OS — Memory / Context Proof (Layer 6, §4.6)
   Truth · Safety · We Got Your Back

   Claims: these specific memory items (by id/hash, WITH their type) influenced this answer;
   and no private/episodic item was sent.
   Verified: hash-match each carried item; a typed item with content+hash → self-verifiable ✓;
   id-only → runtime-attested ~ (the same honest grading as Provenance). Plus a self-verifiable
   claim that the used set contains NO private/episodic memory (checkable from the record).

   Honest wording: "Used 1 user-approved Fact (m_3). No private Episodes were sent."
   Built off to the side; consumes the used-item list, emits a proof slot.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);
  var H = (typeof require !== "undefined") ? require("../hash.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_HASH : null);
  var MT = (typeof require !== "undefined") ? require("../memory-types.js") : (typeof window !== "undefined" ? window.AUBS_MEMORY_TYPES : null);

  // used: [{ id, type, scope?, content?, ref_hash? }]
  async function buildMemoryProof(used) {
    used = used || [];
    var claims = [], byHash = 0, byId = 0, privateInUsed = [], unknownType = [];
    for (var i = 0; i < used.length; i++) {
      var m = used[i];
      var rawType = m.type ? String(m.type).toUpperCase() : null;
      // A missing/unknown type can NOT be certified non-private — track it conservatively so the
      // "no private sent" claim never falsely covers an item whose sensitivity we don't know.
      if (!rawType || !MT.isRealType(rawType)) unknownType.push(m.id);
      var type = rawType || "UNKNOWN";
      if (rawType && MT.isPrivate(rawType)) privateInUsed.push({ id: m.id, type: type });
      if (m.content !== undefined && m.ref_hash) {
        var h = await H.sha256hex(m.content);
        if (h === m.ref_hash) { byHash++; claims.push(S.claim("Used 1 " + type + " (" + m.id + ") — hash-matches.", [m.ref_hash], S.SELF_VERIFIABLE, "which-only; content-hash verified")); }
        else { claims.push(S.claim(type + " (" + m.id + ") MISMATCH — content does not hash to its record.", [m.ref_hash, h], S.SELF_VERIFIABLE, "tamper detected")); }
      } else {
        byId++; claims.push(S.claim("Used 1 " + type + " (" + m.id + ") — referenced by id.", [m.id], S.RUNTIME_ATTESTED, "id-only; carry the content hash to upgrade to ✓"));
      }
    }
    // The absence claim. Self-verifiable ONLY when every item's type is known and none private.
    // If any item lacks a known type we cannot certify it — downgrade honestly to runtime-attested.
    if (privateInUsed.length === 0 && unknownType.length === 0) {
      claims.push(S.claim("No private/episodic memory was used or sent.", ["used-set types"], S.SELF_VERIFIABLE, "checkable from the record's used set (all types known)"));
    } else if (privateInUsed.length === 0) {
      claims.push(S.claim("No KNOWN private/episodic memory was sent; " + unknownType.length + " item(s) had no recorded type (cannot certify).", unknownType, S.RUNTIME_ATTESTED, "untyped items can't be certified non-private — record their type to upgrade"));
    } else {
      claims.push(S.claim(privateInUsed.length + " private/episodic item(s) WERE in the used set.", privateInUsed.map(function (p) { return p.id; }), S.SELF_VERIFIABLE, "flagged; the record shows exactly which"));
    }
    return TR.proof(claims, { count: used.length, by_hash: byHash, by_id: byId, private_in_used: privateInUsed.length, unknown_type: unknownType.length, no_private_sent: privateInUsed.length === 0 && unknownType.length === 0 });
  }

  var API = { buildMemoryProof: buildMemoryProof };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_MEMORY = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_MEMORY = API;
})();
