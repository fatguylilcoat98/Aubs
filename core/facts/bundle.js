/* ============================================================================
   AUBS DEVICE-BUNDLE TRUST — Migration A2 (Decision Gate 0 §5)
   Truth · Safety · We Got Your Back

   The signed device policy bundle is a NEW trust root: the whole local-enforcement
   story depends on GEL evaluating only a bundle CLASPION actually authored. This
   module signs (authoring side) and verifies (device side, before load) a bundle.

   verifyBundle FAILS CLOSED on every defect — tampered content, expired,
   downgraded version, missing/!valid signature, wrong key. A bad bundle is NEVER
   loaded; the caller falls back to structural-invariants-only (GEL still denies on
   egress/local_only regardless of any bundle). Per the contract, governed-fact
   answers never depend on the bundle source — so an outage/forgery can never turn
   "hello" into a refusal.

   Signed envelope:
     { bundle, content_hash, version_seq, issued_at, expires_at, signature }
   signature is Ed25519 over: content_hash|version_seq|issued_at|expires_at

   Reuses the same Ed25519 + keypair mechanism as spine/ledger.js. Keys come from
   LEDGER.generateSigningKeyPair() (or any WebCrypto Ed25519 keypair).
   Environment-agnostic: module.exports (Node) or window.AUBS_BUNDLE_TRUST.
   ========================================================================== */
(function () {
  "use strict";
  var CRYPTO = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto
             : (typeof require !== "undefined" ? require("crypto").webcrypto : null);
  var SUBTLE = CRYPTO ? CRYPTO.subtle : null;
  var ENC = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;

  function b64(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return (typeof btoa !== "undefined") ? btoa(s) : Buffer.from(b).toString("base64");
  }
  function unb64(str) {
    if (typeof atob !== "undefined") {
      var bin = atob(str), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(str, "base64"));
  }

  // Deterministic, order-independent JSON for a stable content hash.
  function canonicalJSON(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    var k = Object.keys(v).sort();
    return "{" + k.map(function (x) { return JSON.stringify(x) + ":" + canonicalJSON(v[x]); }).join(",") + "}";
  }
  function contentHash(bundle) {
    return SUBTLE.digest("SHA-256", ENC.encode(canonicalJSON(bundle || {}))).then(function (buf) {
      var b = new Uint8Array(buf), h = "";
      for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
      return h;
    });
  }
  function signedPayload(env) {
    return [env.content_hash, env.version_seq, env.issued_at, env.expires_at].join("|");
  }

  // Authoring side (CLASPION). meta = { version_seq:int, issued_at:isoString, expires_at:isoString }
  function signBundle(bundle, privateKey, meta) {
    meta = meta || {};
    return contentHash(bundle).then(function (ch) {
      var env = {
        bundle: bundle, content_hash: ch,
        version_seq: (typeof meta.version_seq === "number") ? meta.version_seq : 1,
        issued_at: meta.issued_at || null, expires_at: meta.expires_at || null
      };
      return SUBTLE.sign({ name: "Ed25519" }, privateKey, ENC.encode(signedPayload(env)))
        .then(function (sig) { env.signature = b64(sig); return env; });
    });
  }

  // Device side: verify BEFORE load. opts = { publicKey, now:isoString, lastVersionSeq?:int }
  // Returns { ok, reason, bundle }. Fail-closed: any defect → ok:false, bundle:null.
  function verifyBundle(env, opts) {
    opts = opts || {};
    if (!env || typeof env !== "object" || !env.bundle) return Promise.resolve({ ok: false, reason: "no_bundle", bundle: null });
    if (!env.signature) return Promise.resolve({ ok: false, reason: "unsigned", bundle: null });
    if (!opts.publicKey || !SUBTLE) return Promise.resolve({ ok: false, reason: "no_verifier", bundle: null });

    // 1) content integrity — recompute the hash; mismatch = tampered.
    return contentHash(env.bundle).then(function (ch) {
      if (ch !== env.content_hash) return { ok: false, reason: "content_tampered", bundle: null };

      // 2) freshness — expired bundles are not honored.
      if (env.expires_at && opts.now && String(opts.now) > String(env.expires_at))
        return { ok: false, reason: "expired", bundle: null };

      // 3) no silent downgrade — version_seq must not go backwards.
      if (typeof opts.lastVersionSeq === "number" && typeof env.version_seq === "number" && env.version_seq < opts.lastVersionSeq)
        return { ok: false, reason: "downgrade", bundle: null };

      // 4) signature — must verify against a trusted key over the exact payload.
      return SUBTLE.verify({ name: "Ed25519" }, opts.publicKey, unb64(env.signature), ENC.encode(signedPayload(env)))
        .then(function (valid) {
          if (!valid) return { ok: false, reason: "bad_signature", bundle: null };
          return { ok: true, reason: "ok", bundle: env.bundle };
        })
        .catch(function () { return { ok: false, reason: "verify_error", bundle: null }; });
    }).catch(function () { return { ok: false, reason: "hash_error", bundle: null }; });
  }

  var API = { signBundle: signBundle, verifyBundle: verifyBundle, contentHash: contentHash, canonicalJSON: canonicalJSON };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_BUNDLE_TRUST = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_BUNDLE_TRUST = API;
})();
