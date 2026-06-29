/* ============================================================================
   AUBS Providers — Drift Shield (Milestone 5)
   Truth · Safety · We Got Your Back

   Providers are UNTRUSTED dependencies — not because they're malicious, but because they
   fail, change APIs, rate-limit, and return malformed output. The Drift Shield is the
   membrane between an untrusted provider and the CAC-speaking kernel.

   It validates two things, and it FAILS CLOSED:
     1. the provider CONTRACT (shape, methods, capability consistency) — at registration,
     2. the provider RESPONSE (normalized adapter shape + required metadata) — at runtime.

   A provider that violates either becomes unavailable; a drifting response becomes an
   explicit CAC-compatible Failure rather than leaking a bad shape into the kernel.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAPS = isNode ? require("./capabilities") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_CAPS : null);

  var FAILURE_TYPES = ["model_error", "policy_denied", "unsafe_blocked", "timeout", "internal_error", "provider_drift"];

  // ── Contract validation (registration time) ────────────────────────────────────────
  // Returns { ok, issues:[...] }. Never throws. Anything off-contract => ok:false.
  function validateProvider(provider) {
    var issues = [];
    if (!provider || typeof provider !== "object") return { ok: false, issues: [{ key: "provider", problem: "missing or not an object" }] };
    if (typeof provider.provider_id !== "string" || !provider.provider_id) issues.push({ key: "provider_id", problem: "must be a non-empty string" });
    if (CAPS.PROVIDER_TYPES.indexOf(provider.provider_type) === -1) issues.push({ key: "provider_type", problem: "must be one of " + CAPS.PROVIDER_TYPES.join("/") });
    if (provider.enabled !== undefined && provider.enabled !== true && provider.enabled !== false) issues.push({ key: "enabled", problem: "if present must be boolean" });
    if (typeof provider.healthCheck !== "function") issues.push({ key: "healthCheck", problem: "must be a function" });
    if (typeof provider.execute !== "function") issues.push({ key: "execute", problem: "must be a function" });

    var capChk = CAPS.validateCapabilities(provider.capabilities);
    if (!capChk.ok) issues = issues.concat(capChk.issues);
    else {
      var consist = CAPS.validateTypeConsistency(provider.provider_type, provider.capabilities);
      if (!consist.ok) issues = issues.concat(consist.issues);
    }
    return { ok: issues.length === 0, issues: issues };
  }

  // ── Response validation (runtime) ──────────────────────────────────────────────────
  // The normalized adapter response the kernel expects (same shape as M3/M4 adapters):
  //   success: { ok:true,  output_text:string, model_id, provider_id }
  //   failure: { ok:false, failure_type, message, recoverable }
  // Missing metadata or an unexpected shape is DRIFT.
  function validateResponse(resp) {
    var issues = [];
    if (!resp || typeof resp !== "object") return { ok: false, issues: [{ key: "response", problem: "missing or not an object" }] };
    if (resp.ok !== true && resp.ok !== false) return { ok: false, issues: [{ key: "ok", problem: "must be boolean true/false" }] };
    if (resp.ok === true) {
      if (typeof resp.output_text !== "string") issues.push({ key: "output_text", problem: "success must include output_text string" });
      if (typeof resp.model_id !== "string" || !resp.model_id) issues.push({ key: "model_id", problem: "success must include model_id" });
      if (typeof resp.provider_id !== "string" || !resp.provider_id) issues.push({ key: "provider_id", problem: "success must include provider_id" });
    } else {
      if (FAILURE_TYPES.indexOf(resp.failure_type) === -1) issues.push({ key: "failure_type", problem: "failure must use a known failure_type" });
      if (typeof resp.message !== "string" || !resp.message) issues.push({ key: "message", problem: "failure must include a message" });
      if (resp.recoverable !== true && resp.recoverable !== false) issues.push({ key: "recoverable", problem: "failure must include boolean recoverable" });
    }
    return { ok: issues.length === 0, issues: issues };
  }

  // Turn a drift verdict into an explicit, normalized failure (fail-closed substitute).
  function driftFailure(provider_id, issues) {
    return {
      ok: false, failure_type: "provider_drift",
      message: "provider '" + (provider_id || "?") + "' drifted from contract: " + (issues || []).map(function (i) { return i.key + " (" + i.problem + ")"; }).join("; "),
      recoverable: false, drift: true, issues: issues || []
    };
  }

  // ── Guarded execution ──────────────────────────────────────────────────────────────
  // Run a provider's execute() behind the shield. ANY drift — a throw, a malformed
  // response, missing metadata — is converted to an explicit provider_drift failure.
  // The kernel never sees a bad shape. Deterministic given a deterministic provider.
  function runGuarded(provider, plan, context) {
    return Promise.resolve()
      .then(function () {
        var contract = validateProvider(provider);
        if (!contract.ok) return driftFailure(provider && provider.provider_id, contract.issues);
        return Promise.resolve(provider.execute(plan, context)).then(function (resp) {
          var v = validateResponse(resp);
          if (!v.ok) return driftFailure(provider.provider_id, v.issues);
          return resp;
        });
      })
      .catch(function (e) {
        return driftFailure(provider && provider.provider_id, [{ key: "execute", problem: "threw: " + ((e && e.message) ? e.message : String(e)) }]);
      });
  }

  // Health behind the shield: a throw or a non-{ok:true} result => unhealthy (fail-closed).
  function checkHealth(provider) {
    return Promise.resolve()
      .then(function () { return provider.healthCheck(); })
      .then(function (h) { return { healthy: !!(h && h.ok === true), detail: h || null }; })
      .catch(function (e) { return { healthy: false, detail: { ok: false, error: (e && e.message) ? e.message : String(e) } }; });
  }

  var API = {
    FAILURE_TYPES: FAILURE_TYPES,
    validateProvider: validateProvider, validateResponse: validateResponse,
    driftFailure: driftFailure, runGuarded: runGuarded, checkHealth: checkHealth
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_DRIFT = API;
})();
