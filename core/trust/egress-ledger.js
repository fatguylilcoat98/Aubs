/* ============================================================================
   AUBS TRUST OS — Egress Ledger (Layer 1)
   Truth · Safety · We Got Your Back

   An append-only, hash-chained log of every egress decision (sent or blocked) the
   gateway made. The Privacy Proof (Layer 5) renders the COMPLETE recorded list from
   here. Hash-chained so the list itself is tamper-evident — a deletion or reorder is
   detectable. (Folds into the unified Trust Record ledger when the wire is attached.)

   Honest limit: this proves what was RECORDED as leaving, through one door. It cannot
   prove "nothing else left" in a browser — that is the sealed-door's job, not the log's.

   Self-contained; in-memory by default. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var CRYPTO = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto
             : (typeof require !== "undefined" ? require("crypto").webcrypto : null);
  var SUBTLE = CRYPTO ? CRYPTO.subtle : null;
  var ENC = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;
  var GENESIS = "0".repeat(64);

  function canonicalJSON(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    var k = Object.keys(v).sort();
    return "{" + k.map(function (x) { return JSON.stringify(x) + ":" + canonicalJSON(v[x]); }).join(",") + "}";
  }
  function sha256hex(str) {
    return SUBTLE.digest("SHA-256", ENC.encode(String(str))).then(function (buf) {
      var b = new Uint8Array(buf), h = "";
      for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
      return h;
    });
  }

  function createEgressLedger() {
    var rows = [];
    // appendEgress is sync-friendly for the gateway's call site; the hash is computed
    // and back-filled. seq + prev_hash give the chain; entryQueue serializes hashing.
    var chainTail = Promise.resolve(GENESIS);

    function appendEgress(entry) {
      var seq = rows.length;
      var rec = {
        seq: seq, prev_hash: null, entry_hash: null,
        outcome: entry.outcome || "sent", reason: entry.reason || null,
        destination: entry.destination || null, payload_hash: entry.payload_hash || null,
        classification: entry.classification || "unclassified", bytes: entry.bytes || 0
      };
      rows.push(rec);
      // chain it (async, ordered) — the body excludes the chain fields.
      chainTail = chainTail.then(function (prev) {
        rec.prev_hash = prev;
        var body = canonicalJSON({ seq: rec.seq, prev_hash: rec.prev_hash, outcome: rec.outcome, reason: rec.reason, destination: rec.destination, payload_hash: rec.payload_hash, classification: rec.classification, bytes: rec.bytes });
        return sha256hex(body).then(function (h) { rec.entry_hash = h; return h; });
      });
      return rec;
    }

    function ready() { return chainTail; }   // resolves when all appends are chained
    function all() { return rows.slice(); }
    function count() { return rows.length; }
    function sentCount() { return rows.filter(function (r) { return r.outcome === "sent"; }).length; }
    function blockedCount() { return rows.filter(function (r) { return r.outcome === "blocked"; }).length; }

    // Offline verifier: re-walk the chain and recompute every entry hash.
    async function verify() {
      await ready();
      var expectedPrev = GENESIS, issues = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.prev_hash !== expectedPrev) issues.push({ at: i, type: "broken_chain" });
        var body = canonicalJSON({ seq: r.seq, prev_hash: r.prev_hash, outcome: r.outcome, reason: r.reason, destination: r.destination, payload_hash: r.payload_hash, classification: r.classification, bytes: r.bytes });
        var h = await sha256hex(body);
        if (h !== r.entry_hash) issues.push({ at: i, type: "hash_mismatch" });
        expectedPrev = r.entry_hash;
      }
      return { ok: issues.length === 0, issues: issues, count: rows.length };
    }

    return { appendEgress: appendEgress, ready: ready, all: all, count: count, sentCount: sentCount, blockedCount: blockedCount, verify: verify };
  }

  var API = { createEgressLedger: createEgressLedger, GENESIS: GENESIS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_EGRESS_LEDGER = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_EGRESS_LEDGER = API;
})();
