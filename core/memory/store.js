/* ============================================================================
   AUBS Typed Scoped Memory — append-only signed store (Milestone 9)
   Truth · Safety · We Got Your Back

   The memory log is append-only, hash-chained, and Ed25519-signed — exactly like the
   provenance ledger (M0). A "delete" is a superseding/deactivating record; history is
   never physically erased. Tampering is detectable by the same generic verifier the
   ledger uses (seq / prev_hash / record_hash / signature).
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var SUBTLE = (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto.subtle : null;
  var ENC = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;
  var GENESIS = LEDGER ? LEDGER.GENESIS : "0".repeat(64);

  function b64(buf) { var b = new Uint8Array(buf), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return (typeof btoa !== "undefined") ? btoa(s) : Buffer.from(s, "binary").toString("base64"); }
  function signHex(hex, privateKey) {
    if (!privateKey || !SUBTLE) return Promise.resolve("unsigned");
    return SUBTLE.sign({ name: "Ed25519" }, privateKey, ENC.encode(hex)).then(b64).catch(function () { return "unsigned"; });
  }

  // in-memory append-only store (tests + a reusable backing for IndexedDB later)
  function createMemoryLog() { return LEDGER.createMemoryStore(); }

  // Append a TSM record to the chain. memObj is the pure (already schema-valid) memory object;
  // chain fields (seq/prev_hash/record_hash/signature) are added here. Never mutates prior records.
  function appendMemory(store, memObj, privateKey) {
    return store.tail().then(function (prev) {
      var seq = prev ? prev.seq + 1 : 0;
      var prev_hash = prev ? prev.record_hash : GENESIS;
      var body = Object.assign({}, memObj, { seq: seq, prev_hash: prev_hash });
      return LEDGER.sha256hex(LEDGER.canonicalJSON(body)).then(function (rh) {
        body.record_hash = rh;
        return signHex(rh, privateKey).then(function (sig) {
          body.signature = sig;
          return store.append(body).then(function () { return body; });
        });
      });
    });
  }

  // Verify the whole memory log with the SAME generic verifier the ledger uses.
  function verifyMemoryLog(records, publicKey) { return LEDGER.verifyLedger(records, publicKey); }

  // Active view: a memory_id is stable; edits append a NEW VERSION with the same id
  // (latest-by-seq wins), and history is kept. The active version is the latest non-deleted
  // record for each id. A delete is a latest record with deleted:true → not active.
  function activeMemories(records) {
    records = (records || []).slice().sort(function (a, b) { return a.seq - b.seq; });
    var latest = {};
    records.forEach(function (r) { latest[r.memory_id] = r; });   // last version wins
    return Object.keys(latest).map(function (k) { return latest[k]; })
      .filter(function (r) { return !r.deleted; })
      .sort(function (a, b) { return a.seq - b.seq; });
  }

  // Full version history (every record) for one memory_id, oldest → newest.
  function historyOf(records, memory_id) {
    return (records || []).filter(function (r) { return r.memory_id === memory_id; }).sort(function (a, b) { return a.seq - b.seq; });
  }

  var API = { createMemoryLog: createMemoryLog, appendMemory: appendMemory, verifyMemoryLog: verifyMemoryLog, activeMemories: activeMemories, historyOf: historyOf, GENESIS: GENESIS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_STORE = API;
})();
