/* ============================================================================
   AUBS Providers — fake/test providers (Milestone 5)
   Truth · Safety · We Got Your Back

   Deterministic fakes for tests. NO network, NO API keys, NO real cloud calls — the
   "cloud" fakes only RETURN canned data so we can exercise the contract, registry,
   eligibility, and Drift Shield without leaving the machine.
   ========================================================================== */
(function () {
  "use strict";

  function localCaps(over) {
    return Object.assign({
      supports_local: true, supports_cloud: false, max_egress: "none",
      data_classes_allowed: ["public", "personal", "sensitive"], requires_network: false,
      supports_streaming: false, supports_json: false, supports_tools: false,
      zero_retention_claimed: true, baa_eligible: false, region: "device",
      cost_class: "free", latency_class: "low"
    }, over || {});
  }
  function cloudCaps(over) {
    return Object.assign({
      supports_local: false, supports_cloud: true, max_egress: "full",
      data_classes_allowed: ["public"], requires_network: true,
      supports_streaming: true, supports_json: true, supports_tools: true,
      zero_retention_claimed: false, baa_eligible: false, region: "us",
      cost_class: "medium", latency_class: "medium"
    }, over || {});
  }

  // valid local provider — succeeds with full metadata
  var fakeLocalOkProvider = {
    provider_id: "fake-local-ok", provider_type: "local", enabled: true, capabilities: localCaps(),
    healthCheck: function () { return Promise.resolve({ ok: true }); },
    execute: function (plan, ctx) {
      var t = (ctx && ctx.intent && ctx.intent.user_text) ? ("(fake local) " + ctx.intent.user_text) : "(fake local answer)";
      return Promise.resolve({ ok: true, output_text: t, model_id: "fake-local-model", provider_id: "fake-local-ok" });
    }
  };

  // valid local provider — returns an explicit, well-formed failure
  var fakeLocalFailProvider = {
    provider_id: "fake-local-fail", provider_type: "local", enabled: true, capabilities: localCaps(),
    healthCheck: function () { return Promise.resolve({ ok: true }); },
    execute: function () { return Promise.resolve({ ok: false, failure_type: "model_error", message: "fake local model produced nothing", recoverable: true }); }
  };

  // valid cloud provider — succeeds (canned; NO network). Only eligible when a plan permits egress.
  var fakeCloudOkProvider = {
    provider_id: "fake-cloud-ok", provider_type: "cloud", enabled: true, capabilities: cloudCaps(),
    healthCheck: function () { return Promise.resolve({ ok: true }); },
    execute: function () { return Promise.resolve({ ok: true, output_text: "(fake cloud answer — no network was used)", model_id: "fake-cloud-model", provider_id: "fake-cloud-ok" }); }
  };

  // DRIFT: cloud provider whose execute() returns a malformed response (missing metadata)
  var fakeCloudMalformedProvider = {
    provider_id: "fake-cloud-malformed", provider_type: "cloud", enabled: true, capabilities: cloudCaps(),
    healthCheck: function () { return Promise.resolve({ ok: true }); },
    execute: function () { return Promise.resolve({ ok: true, text: "wrong field name, no model_id/provider_id" }); }   // <- drift
  };

  // unhealthy provider — registers fine but health check fails (excluded from eligibility)
  var fakeUnhealthyProvider = {
    provider_id: "fake-unhealthy", provider_type: "cloud", enabled: true, capabilities: cloudCaps(),
    healthCheck: function () { return Promise.resolve({ ok: false, error: "provider down" }); },
    execute: function () { return Promise.resolve({ ok: true, output_text: "should not be reached", model_id: "x", provider_id: "fake-unhealthy" }); }
  };

  // a provider that THROWS inside execute (transport blew up) — Drift Shield must catch it
  var fakeThrowingProvider = {
    provider_id: "fake-throwing", provider_type: "cloud", enabled: true, capabilities: cloudCaps(),
    healthCheck: function () { return Promise.resolve({ ok: true }); },
    execute: function () { return Promise.reject(new Error("connection reset")); }
  };

  var API = {
    fakeLocalOkProvider: fakeLocalOkProvider, fakeLocalFailProvider: fakeLocalFailProvider,
    fakeCloudOkProvider: fakeCloudOkProvider, fakeCloudMalformedProvider: fakeCloudMalformedProvider,
    fakeUnhealthyProvider: fakeUnhealthyProvider, fakeThrowingProvider: fakeThrowingProvider,
    localCaps: localCaps, cloudCaps: cloudCaps
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_FAKES = API;
})();
