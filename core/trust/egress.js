/* ============================================================================
   AUBS TRUST OS — Trusted Egress Gateway (Layer 1)
   Truth · Safety · We Got Your Back

   Built OFF TO THE SIDE: this is self-contained and is NOT yet wired into the live
   app's network paths (openai-adapter transport, sw.js). Wiring those behind this
   door is a later, deliberate step — until then this can be exercised in isolation
   without touching anything that already works.

   The rule (architecture §5): exactly ONE function performs outbound network I/O.
   Every byte that leaves is policy-checked, classified, hashed, and recorded BEFORE
   it leaves. Privacy Proof (Layer 5) reads from here.

   Two honest strengths (taxonomy §3):
     - Filtered egress  → "runtime-attested": every egress we RECORDED went through
       this one door, with payload hashes. NOT "nothing else left" (unprovable in-browser).
     - Sealed door (Incognito) → "egress-attested:sealed-door": the door is hard-disabled;
       0 requests, 0 bytes. A welded door is a binary structural claim — strongest form.

   Deterministic + injectable: pass your own gate/ledger/send for tests; the default
   send is the only place a real network call is made. Environment-agnostic.
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
  function sha256hex(str) {
    return SUBTLE.digest("SHA-256", ENC.encode(String(str))).then(function (buf) {
      var b = new Uint8Array(buf), h = "";
      for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
      return h;
    });
  }
  function byteLen(str) { return ENC ? ENC.encode(String(str)).length : String(str).length; }

  // The default real door. The ONLY place a network call is actually made. Tests inject
  // their own `send`, so no real I/O happens off to the side.
  function defaultSend(target, payload) {
    if (typeof fetch === "undefined") return Promise.reject(new Error("no fetch available"));
    return fetch(target, { method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  // gate: { evaluate(payload, classification, policy) -> { allow:bool, target:string, reason:string } }
  // ledger: { appendEgress(entry) }  (Layer-1 egress log; folds into the Trust Record later)
  // send: the single network sender (default fetch). sealed: Incognito (door welded shut).
  function createGateway(opts) {
    opts = opts || {};
    var policyGate = opts.gate || { evaluate: function (_p, _c, _pol) { return { allow: true, target: opts.target || null, reason: "no_gate_default_allow" }; } };
    var ledger = opts.ledger || null;
    var send = opts.send || defaultSend;
    var sealed = !!opts.sealed;
    var counters = { requests: 0, bytes_out: 0, blocked: 0 };

    function recordBlocked(reason, classification, target) {
      counters.blocked++;
      if (ledger && ledger.appendEgress) ledger.appendEgress({ outcome: "blocked", reason: reason, destination: target || null, payload_hash: null, classification: classification, bytes: 0 });
      return { allowed: false, reason: reason, target: null, payload_hash: null,
               strength: sealed ? "egress-attested:sealed-door" : "runtime-attested" };
    }

    // The ONE door. Returns a structured outcome; on allow it performs the single send().
    async function egress(payload, ctx) {
      ctx = ctx || {};
      var classification = ctx.classification || "unclassified";
      var policy = ctx.policy || null;

      // SEALED DOOR (Incognito): strongest form — refuse structurally, 0 requests, 0 bytes.
      if (sealed) return recordBlocked("incognito_sealed", classification, null);

      // Policy check BEFORE anything leaves.
      var verdict = policyGate.evaluate(payload, classification, policy) || { allow: false, reason: "gate_returned_nothing" };
      if (!verdict.allow) return recordBlocked(verdict.reason || "policy_denied", classification, verdict.target);

      // Hash + record BEFORE sending — the recorded list is what Privacy Proof attests to.
      var body = typeof payload === "string" ? payload : canonicalJSON(payload);
      var hash = await sha256hex(body);
      var bytes = byteLen(body);
      if (ledger && ledger.appendEgress) ledger.appendEgress({ outcome: "sent", reason: verdict.reason || "allowed", destination: verdict.target, payload_hash: hash, classification: classification, bytes: bytes });
      counters.requests++; counters.bytes_out += bytes;

      var response = await Promise.resolve(send(verdict.target, payload));
      return { allowed: true, target: verdict.target, payload_hash: hash, bytes: bytes, response: response, strength: "runtime-attested" };
    }

    return {
      egress: egress,
      counters: function () { return { requests: counters.requests, bytes_out: counters.bytes_out, blocked: counters.blocked }; },
      isSealed: function () { return sealed; },
      seal: function () { sealed = true; },     // weld the door for the rest of the session
      // The honest privacy claim this gateway can make right now (feeds Layer 5).
      privacyClaim: function () {
        return sealed
          ? { strength: "egress-attested:sealed-door", claim: "Nothing left this device. The door was locked.", requests: 0, bytes: 0 }
          : { strength: "runtime-attested", claim: "Every recorded egress went through one audited door.", requests: counters.requests, bytes: counters.bytes_out, blocked: counters.blocked };
      }
    };
  }

  var API = { createGateway: createGateway, defaultSend: defaultSend, sha256hex: sha256hex, canonicalJSON: canonicalJSON };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_EGRESS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_EGRESS = API;
})();
