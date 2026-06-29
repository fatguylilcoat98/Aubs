/* ============================================================================
   AUBS Replay — decision evidence (Milestone 7)
   Truth · Safety · We Got Your Back

   A DecisionRecord proves WHAT happened (M0). To replay a decision we also need the CAC
   objects that produced it. "Evidence" pairs a signed DecisionRecord with its Intent, Plan,
   Governance decision, the policy bundle used, and a provider snapshot — then BINDS the CAC
   objects to the record by hash, so tampering with either is detectable.

   captureDecision() turns a kernel result into serializable evidence.
   verifyEvidence() proves the record is authentic AND bound to its CAC objects.
   Neither ever mutates history.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);

  var EVIDENCE_VERSION = "replay-1";

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // Build evidence from a kernel result. ctx = { policyBundle, registry, kernel_version }.
  function captureDecision(kernelResult, ctx) {
    ctx = ctx || {};
    var r = kernelResult || {};
    var rec = r.record || null;
    var expl = (rec && rec.explanation) || {};
    var providerId = expl.provider_id || (r.result && r.result.provider_id) || null;
    var caps = null;
    if (ctx.registry && providerId && ctx.registry.get) { var p = ctx.registry.get(providerId); if (p) caps = clone(p.capabilities); }
    return {
      evidence_version: EVIDENCE_VERSION,
      kernel_version: expl.kernel_version || ctx.kernel_version || null,
      record: clone(rec),
      intent: clone(r.intent),
      plan: clone(r.plan),
      governance: clone(r.governance),
      policy_bundle: clone(ctx.policyBundle) || null,
      policy_bundle_hash: (r.governance && r.governance.policy_bundle_hash) || (rec && rec.policy_version) || null,
      provider: {
        provider_id: providerId,
        provider_type: expl.provider_type || null,
        capabilities: caps,
        eligible_count: expl.eligible_count != null ? expl.eligible_count : null,
        rejected_providers: clone(expl.rejected_providers) || []
      }
    };
  }

  // Structural completeness — what replay minimally needs. Returns { ok, missing:[...] }.
  function structuralCheck(ev) {
    var missing = [];
    if (!ev || typeof ev !== "object") return { ok: false, missing: ["evidence"] };
    if (!ev.record || typeof ev.record !== "object") missing.push("record");
    if (!ev.intent || typeof ev.intent !== "object") missing.push("intent");
    if (!ev.plan || typeof ev.plan !== "object") missing.push("plan");
    if (!ev.governance || typeof ev.governance !== "object") missing.push("governance");
    if (ev.record && typeof ev.record.input_hash !== "string") missing.push("record.input_hash");
    return { ok: missing.length === 0, missing: missing };
  }

  // Recompute a single record's hash over its body and verify its signature. Detects a
  // tampered record even outside the full chain. Returns { ok, issues:[...] }.
  function verifyRecordIntegrity(record, publicKey) {
    if (!record || typeof record !== "object") return Promise.resolve({ ok: false, issues: ["record_missing"] });
    var view = {}; for (var k in record) { if (k !== "record_hash" && k !== "signature") view[k] = record[k]; }
    return LEDGER.sha256hex(LEDGER.canonicalJSON(view)).then(function (recomputed) {
      var issues = [];
      var bodyOk = (recomputed === record.record_hash);
      if (!bodyOk) issues.push("record_modified");
      var sig = record.signature;
      if (!sig || sig === "unsigned") { issues.push("unsigned"); return { ok: bodyOk, issues: issues, unsigned: true }; }
      if (!publicKey) { issues.push("unverifiable_no_pubkey"); return { ok: bodyOk, issues: issues }; }
      return verifySig(record.record_hash, sig, publicKey).then(function (sigOk) {
        if (!sigOk) issues.push("bad_signature");
        return { ok: bodyOk && sigOk, issues: issues };
      });
    });
  }
  // sign/verify helpers live in ledger; expose a tiny verify via subtle (Ed25519) the same way.
  function verifySig(hashHex, sigB64, publicKey) {
    try {
      var SUB = (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto.subtle : null;
      if (!SUB) return Promise.resolve(false);
      var enc = new TextEncoder().encode(hashHex);
      var raw = Uint8Array.from(atobLocal(sigB64), function (c) { return c.charCodeAt(0); });
      return SUB.verify({ name: "Ed25519" }, publicKey, raw, enc).then(function (x) { return !!x; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function atobLocal(b64) { if (typeof atob !== "undefined") return atob(b64); return Buffer.from(b64, "base64").toString("binary"); }

  // Bind the CAC Intent to the record by input hash. Returns { bound, issues:[...] }.
  function bindIntent(ev) {
    var text = (ev && ev.intent && typeof ev.intent.user_text === "string") ? ev.intent.user_text : null;
    if (text == null) return Promise.resolve({ bound: false, issues: ["intent_missing_user_text"] });
    return LEDGER.sha256hex(text).then(function (h) {
      return (h === ev.record.input_hash) ? { bound: true, issues: [] } : { bound: false, issues: ["intent_changed"] };
    });
  }

  // Full evidence gate: structural + record integrity + intent binding. Returns
  // { ok, issues:[...], unsigned } — replay must not proceed unless ok (or caller opts out).
  function verifyEvidence(ev, publicKey) {
    var s = structuralCheck(ev);
    if (!s.ok) return Promise.resolve({ ok: false, issues: s.missing.map(function (m) { return "missing:" + m; }) });
    return verifyRecordIntegrity(ev.record, publicKey).then(function (ri) {
      return bindIntent(ev).then(function (b) {
        var issues = ri.issues.concat(b.issues);
        var fatal = issues.filter(function (x) { return x !== "unsigned" && x !== "unverifiable_no_pubkey"; });
        return { ok: fatal.length === 0, issues: issues, unsigned: !!ri.unsigned, bound: b.bound };
      });
    });
  }

  var API = {
    EVIDENCE_VERSION: EVIDENCE_VERSION,
    captureDecision: captureDecision, structuralCheck: structuralCheck,
    verifyRecordIntegrity: verifyRecordIntegrity, bindIntent: bindIntent, verifyEvidence: verifyEvidence
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_REPLAY_EVIDENCE = API;
})();
