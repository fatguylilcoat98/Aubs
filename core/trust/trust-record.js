/* ============================================================================
   AUBS TRUST OS — Trust Record (Layer 2)
   Truth · Safety · We Got Your Back

   One signed, hash-chained record per turn (§2) — the single source the Glass Box renders
   from. It carries the six proof pillars, a Decision Trace, and a strengths map covering
   EVERY claim. The chain/signature fields come from the existing ledger (Integrity, Layer
   exists); the proofs are filled in by Layers 3–8. This module is the container + the HARD
   LAW validator; it is built OFF TO THE SIDE and assembles from pieces, replacing nothing.

   A proof slot = { claims: [Claim,...], ...detail }. Every Claim (from strengths.claim)
   declares what/evidence/strength/limits. validateTrustRecord enforces: all claims carry a
   canonical strength, badges are distinct, and no slot smuggles an unbadged claim.

   Environment-agnostic: module.exports (Node) or window.AUBS_TRUST_RECORD.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("./strengths.js")
        : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);

  var PROOF_SLOTS = ["integrity", "provenance", "grounding", "decision", "privacy", "memory"];

  function proof(claims, detail) {
    return Object.assign({ claims: claims || [] }, detail || {});
  }

  // parts = { chain:{seq,prev_hash,record_hash,signature}, intent_id, timestamp,
  //           integrity, provenance, grounding, decision, privacy, memory, trace }
  function buildTrustRecord(parts) {
    parts = parts || {};
    var chain = parts.chain || {};
    var tr = {
      seq: chain.seq, prev_hash: chain.prev_hash, record_hash: chain.record_hash, signature: chain.signature,
      timestamp: parts.timestamp || null, intent_id: parts.intent_id || null,
      integrity: parts.integrity || null, provenance: parts.provenance || null,
      grounding: parts.grounding || null, decision: parts.decision || null,
      privacy: parts.privacy || null, memory: parts.memory || null,
      trace: parts.trace || null,
      strengths: {}, strength_summary: {}
    };
    // Build the strengths map (every claim → its strength) and the summary counts.
    S.ALL.forEach(function (s) { tr.strength_summary[s] = 0; });
    PROOF_SLOTS.forEach(function (slot) {
      var p = tr[slot];
      if (!p || !p.claims) return;
      p.claims.forEach(function (c, i) {
        var key = slot + "." + i;
        tr.strengths[key] = c.strength;
        if (Object.prototype.hasOwnProperty.call(tr.strength_summary, c.strength)) tr.strength_summary[c.strength]++;
      });
    });
    return tr;
  }

  // HARD LAW: every claim has a canonical strength + badge + limits; badges distinct;
  // chain fields present; every proof slot is either a claim-bearing proof or explicitly null.
  function validateTrustRecord(tr) {
    var issues = [];
    if (!tr) return { ok: false, issues: [{ type: "no_record" }] };
    ["seq", "record_hash", "signature", "intent_id"].forEach(function (f) {
      if (tr[f] === undefined || tr[f] === null) issues.push({ type: "missing_chain_field", field: f });
    });
    var allClaims = [];
    PROOF_SLOTS.forEach(function (slot) {
      var p = tr[slot];
      if (p === null) return;                 // explicitly absent is allowed (not yet built)
      if (!p || !Array.isArray(p.claims)) { issues.push({ slot: slot, type: "malformed_proof" }); return; }
      p.claims.forEach(function (c) { allClaims.push(c); });
    });
    var cv = S.validateClaims(allClaims);
    if (!cv.ok) cv.issues.forEach(function (x) { issues.push(Object.assign({ from: "claims" }, x)); });
    // strengths map must cover exactly the claims present
    var mapped = Object.keys(tr.strengths || {}).length;
    if (mapped !== allClaims.length) issues.push({ type: "strengths_map_incomplete", mapped: mapped, claims: allClaims.length });
    return { ok: issues.length === 0, issues: issues };
  }

  // A plain-English one-liner is the Glass Box "Easy" view (Layer 10); here we expose the
  // honest summary the record supports, without inventing anything.
  function summarize(tr) {
    var parts = [];
    S.ALL.forEach(function (s) { var n = tr.strength_summary[s]; if (n) parts.push(n + " " + S.LABEL[s] + " " + S.BADGE[s]); });
    return parts.join(" · ");
  }

  var API = { PROOF_SLOTS: PROOF_SLOTS, proof: proof, buildTrustRecord: buildTrustRecord, validateTrustRecord: validateTrustRecord, summarize: summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TRUST_RECORD = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_TRUST_RECORD = API;
})();
