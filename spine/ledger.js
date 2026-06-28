/* ============================================================================
   AUBS LEDGER — Milestone 0: the tamper-evident provenance spine.
   Truth · Safety · We Got Your Back

   Turns "it tells me what happened" into "it can prove what happened."
   An append-only, hash-chained, Ed25519-signed log of DecisionRecords with a
   fully OFFLINE verifier. No server, no cloud, no custom crypto — standard
   WebCrypto (SHA-256 + Ed25519), identical in the browser and in Node tests.

   This module is PURE LOGIC + crypto + pluggable storage. It does NOT touch the
   chat loop, the model, memory, or the UI. It is wired into the app behind
   FLAG_LEDGER (default OFF) so that, disabled, AUBS behaves exactly as before.

   Storage is injected (createMemoryStore for tests, createIndexedDBStore for the
   browser) so the chaining/verify logic is unit-testable without IndexedDB.
   ========================================================================== */
(function () {
  "use strict";

  var DR_VERSION = "dr-1";                          // DecisionRecord schema version
  var GENESIS = "0".repeat(64);                     // prev_hash of the first record
  var CRYPTO = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto : null;
  var SUBTLE = CRYPTO && CRYPTO.subtle ? CRYPTO.subtle : null;
  var ENC = new TextEncoder();

  /* -- deterministic JSON (recursive key sort) so a record always hashes the same -- */
  function canonicalJSON(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    var keys = Object.keys(v).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + canonicalJSON(v[k]); }).join(",") + "}";
  }

  /* -- base64 <-> bytes (works in browser + Node) -- */
  function b64(buf) { var b = new Uint8Array(buf), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(str) { var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

  /* -- SHA-256 hex over a string -- */
  function sha256hex(str) {
    return SUBTLE.digest("SHA-256", ENC.encode(String(str))).then(function (buf) {
      var b = new Uint8Array(buf), h = "";
      for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
      return h;
    });
  }

  /* -- Ed25519: generate / sign / verify. extractable:false → private key can't be
        exfiltrated; the PUBLIC key is still exportable for portable /verify. -------- */
  function ed25519Available() {
    if (!SUBTLE) return Promise.resolve(false);
    return SUBTLE.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]).then(function () { return true; }).catch(function () { return false; });
  }
  function generateSigningKeyPair() { return SUBTLE.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]); }
  function signHex(hex, privateKey) { return SUBTLE.sign({ name: "Ed25519" }, privateKey, ENC.encode(hex)).then(b64); }
  function verifyHex(hex, sigB64, publicKey) {
    try { return SUBTLE.verify({ name: "Ed25519" }, publicKey, unb64(sigB64), ENC.encode(hex)).catch(function () { return false; }); }
    catch (_) { return Promise.resolve(false); }
  }
  function exportPublicRawB64(publicKey) { return SUBTLE.exportKey("raw", publicKey).then(b64); }
  function importPublicRawB64(b64str) { return SUBTLE.importKey("raw", unb64(b64str), { name: "Ed25519" }, false, ["verify"]); }

  /* -- DecisionRecord v1 builder (hashes input/output, sets defaults). The fields
        record_hash + signature are added by appendRecord AFTER hashing. ----------- */
  function buildRecordBody(seq, prev_hash, o) {
    return Promise.all([sha256hex(o.input == null ? "" : o.input), sha256hex(o.output == null ? "" : o.output)])
      .then(function (hh) {
        return {
          record_version: DR_VERSION,
          seq: seq,
          id: o.id || (CRYPTO && CRYPTO.randomUUID ? CRYPTO.randomUUID() : "id_" + seq + "_" + (o.timestamp || "")),
          timestamp: o.timestamp || new Date().toISOString(),
          intent_id: o.intent_id || null,
          input_hash: hh[0],
          output_hash: hh[1],
          model_id: o.model_id || "unknown",
          policy_version: o.policy_version || null,     // spine/policy bundle version
          provider: o.provider || "local",
          execution_type: o.execution_type || "model",  // model | rule | template | blocked | cache
          memory_refs: o.memory_refs || [],
          retrieved_doc_refs: o.retrieved_doc_refs || [],
          explanation: o.explanation || {},             // tag, grounding_source, flags — L2 metadata
          prev_hash: prev_hash
        };
      });
  }

  /* -- append: chain → hash → sign → store. Never modifies an existing record. ----- */
  function appendRecord(store, o, privateKey) {
    return store.tail().then(function (prev) {
      var seq = prev ? prev.seq + 1 : 0;
      var prev_hash = prev ? prev.record_hash : GENESIS;
      return buildRecordBody(seq, prev_hash, o).then(function (rec) {
        return sha256hex(canonicalJSON(rec)).then(function (rh) {        // hash over body only
          rec.record_hash = rh;
          var signP = (privateKey && SUBTLE) ? signHex(rh, privateKey) : Promise.resolve("unsigned");
          return signP.then(function (sig) {
            rec.signature = sig;
            return store.append(rec).then(function () { return rec; });  // append-only store
          });
        });
      });
    });
  }

  /* -- the OFFLINE verifier. Walks every record and reports every problem; it never
        silently recovers. ok=false on any fatal issue (chain/hash/sig/seq). -------- */
  function verifyLedger(records, publicKey) {
    records = records || [];
    var issues = [], i = 0;
    function step() {
      if (i >= records.length) {
        var fatal = issues.filter(function (x) { return x.type !== "unsigned"; });
        return Promise.resolve({ ok: fatal.length === 0, count: records.length, issues: issues, fatal: fatal.length });
      }
      var r = records[i], idx = i;
      if (typeof r.seq !== "number" || r.seq !== idx) issues.push({ at: idx, seq: r.seq, type: "seq_mismatch", detail: "expected seq " + idx + ", got " + r.seq });
      var expectedPrev = idx === 0 ? GENESIS : records[idx - 1].record_hash;
      if (r.prev_hash !== expectedPrev) issues.push({ at: idx, seq: r.seq, type: "broken_chain" });
      var view = {}; for (var k in r) { if (k !== "record_hash" && k !== "signature") view[k] = r[k]; }
      return sha256hex(canonicalJSON(view)).then(function (recomputed) {
        if (recomputed !== r.record_hash) issues.push({ at: idx, seq: r.seq, type: "record_modified" });
        var sigCheck;
        if (!r.signature || r.signature === "unsigned") { issues.push({ at: idx, seq: r.seq, type: "unsigned" }); sigCheck = Promise.resolve(); }
        else if (!publicKey) { issues.push({ at: idx, seq: r.seq, type: "unverifiable_no_pubkey" }); sigCheck = Promise.resolve(); }
        else sigCheck = verifyHex(r.record_hash, r.signature, publicKey).then(function (ok) { if (!ok) issues.push({ at: idx, seq: r.seq, type: "bad_signature" }); });
        return sigCheck.then(function () { i++; return step(); });
      });
    }
    return step();
  }

  /* -- portable export + verify (no key needed at verify-time beyond the bundle). --- */
  function exportLedger(store, publicKey) {
    return store.all().then(function (records) {
      var pubP = publicKey ? exportPublicRawB64(publicKey).catch(function () { return null; }) : Promise.resolve(null);
      return pubP.then(function (pub) {
        return { format: "aubs-ledger-export-1", exported_at: new Date().toISOString(), public_key_raw_b64: pub, record_count: records.length, records: records };
      });
    });
  }
  function verifyExport(bundle) {
    bundle = bundle || {};
    var pubP = bundle.public_key_raw_b64 ? importPublicRawB64(bundle.public_key_raw_b64).catch(function () { return null; }) : Promise.resolve(null);
    return pubP.then(function (pub) { return verifyLedger(bundle.records || [], pub); });
  }

  /* -- in-memory store (tests). _raw is exposed ONLY so tamper tests can attack it. -- */
  function createMemoryStore() {
    var arr = [];
    var store = {
      append: function (rec) { if (arr.some(function (r) { return r.seq === rec.seq; })) return Promise.reject(new Error("seq exists — append-only")); arr.push(rec); return Promise.resolve(); },
      all: function () { return Promise.resolve(arr.slice().sort(function (a, b) { return a.seq - b.seq; })); },
      tail: function () { return store.all().then(function (a) { return a.length ? a[a.length - 1] : null; }); },
      count: function () { return Promise.resolve(arr.length); },
      _raw: arr
    };
    return store;
  }

  /* -- IndexedDB store (browser). add() (not put) enforces append-only: it rejects if
        the seq already exists. No update/delete method is exposed. -------------------- */
  function createIndexedDBStore(dbName, storeName) {
    dbName = dbName || "aubs_ledger"; storeName = storeName || "records";
    function open() {
      return new Promise(function (res, rej) {
        var req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = function () { var db = req.result; if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "seq" }); };
        req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); };
      });
    }
    var store = {
      append: function (rec) {
        return open().then(function (db) {
          return new Promise(function (res, rej) {
            var tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).add(rec);                 // add → fails if seq exists (immutable)
            tx.oncomplete = function () { res(); };
            tx.onerror = function () { rej(tx.error); };
            tx.onabort = function () { rej(tx.error || new Error("append aborted — record already exists")); };
          });
        });
      },
      all: function () {
        return open().then(function (db) {
          return new Promise(function (res, rej) {
            var tx = db.transaction(storeName, "readonly"); var req = tx.objectStore(storeName).getAll();
            req.onsuccess = function () { res((req.result || []).sort(function (a, b) { return a.seq - b.seq; })); };
            req.onerror = function () { rej(req.error); };
          });
        });
      },
      tail: function () { return store.all().then(function (a) { return a.length ? a[a.length - 1] : null; }); },
      count: function () { return store.all().then(function (a) { return a.length; }); }
    };
    return store;
  }

  var AUBS_LEDGER = {
    DR_VERSION: DR_VERSION, GENESIS: GENESIS,
    canonicalJSON: canonicalJSON, sha256hex: sha256hex,
    ed25519Available: ed25519Available, generateSigningKeyPair: generateSigningKeyPair,
    exportPublicRawB64: exportPublicRawB64, importPublicRawB64: importPublicRawB64,
    appendRecord: appendRecord, verifyLedger: verifyLedger,
    exportLedger: exportLedger, verifyExport: verifyExport,
    createMemoryStore: createMemoryStore, createIndexedDBStore: createIndexedDBStore
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AUBS_LEDGER;
  else if (typeof window !== "undefined") window.AUBS_LEDGER = AUBS_LEDGER;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_LEDGER = AUBS_LEDGER;
})();
