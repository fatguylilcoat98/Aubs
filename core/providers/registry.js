/* ============================================================================
   AUBS Providers — registry + kernel compatibility (Milestone 5)
   Truth · Safety · We Got Your Back

   A deterministic registry of VALIDATED providers. No provider is usable unless it passes
   the Drift Shield contract check. Duplicate ids and invalid providers are rejected. The
   registry exposes only validated providers to the kernel, and exposes eligibility checks
   (capability + health) so GEL/router can LATER pick a provider — routing is NOT built here.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var DRIFT = isNode ? require("./drift-shield") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_DRIFT : null);
  var CAPS  = isNode ? require("./capabilities") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_CAPS : null);

  function createRegistry() {
    var byId = {};                        // id -> provider (validated only)

    function register(provider) {
      var v = DRIFT.validateProvider(provider);
      if (!v.ok) return { ok: false, error: "invalid provider", issues: v.issues };
      if (Object.prototype.hasOwnProperty.call(byId, provider.provider_id)) return { ok: false, error: "duplicate provider_id: " + provider.provider_id };
      byId[provider.provider_id] = provider;
      return { ok: true, provider_id: provider.provider_id };
    }

    function has(id) { return Object.prototype.hasOwnProperty.call(byId, id); }
    function get(id) { return has(id) ? byId[id] : null; }

    // Deterministic: ALWAYS sorted by provider_id, independent of registration order.
    function ids() { return Object.keys(byId).sort(); }
    function list() { return ids().map(function (id) { return byId[id]; }); }

    // Machine-readable view for GEL/router to inspect (no functions, just data).
    function describe() {
      return list().map(function (p) {
        return { provider_id: p.provider_id, provider_type: p.provider_type, enabled: p.enabled !== false, capabilities: p.capabilities };
      });
    }

    // Capability/constraint eligibility (no health). Deterministic, sync. Sorted by id.
    function staticEligibleFor(plan, intent) {
      return list().filter(function (p) { return CAPS.eligibleForPlan(p, plan, intent).eligible; });
    }

    // Full eligibility: capability + LIVE health (disabled/unhealthy excluded). Async because
    // healthCheck is async; deterministic given deterministic health results. Sorted by id.
    function eligibleFor(plan, intent) {
      var candidates = staticEligibleFor(plan, intent);
      return Promise.all(candidates.map(function (p) {
        return DRIFT.checkHealth(p).then(function (h) { return h.healthy ? p : null; });
      })).then(function (arr) { return arr.filter(Boolean); });
    }

    // Run a chosen provider behind the Drift Shield (the only sanctioned execution path).
    function runGuarded(id, plan, context) {
      var p = get(id);
      if (!p) return Promise.resolve(DRIFT.driftFailure(id, [{ key: "provider_id", problem: "not registered" }]));
      return DRIFT.runGuarded(p, plan, context);
    }

    return {
      register: register, has: has, get: get, ids: ids, list: list, describe: describe,
      staticEligibleFor: staticEligibleFor, eligibleFor: eligibleFor, runGuarded: runGuarded,
      get size() { return Object.keys(byId).length; }
    };
  }

  // ── Kernel compatibility (M3/M4) ────────────────────────────────────────────────────
  // Prove the M3/M4 adapter shape and the M5 provider contract are two views of one thing.
  // A provider's execute(plan, ctx) IS the kernel adapter's run(plan, ctx) — so a registered
  // provider plugs straight into kernel.executeIntent({ local: <adapter> }).
  function providerToKernelAdapter(provider) {
    return { id: provider.provider_id, run: function (plan, ctx) { return DRIFT.runGuarded(provider, plan, ctx); } };
  }
  // The reverse: wrap an existing M4-style adapter ({ id, run }) as a provider with a descriptor.
  function adapterToProvider(adapter, descriptor) {
    descriptor = descriptor || {};
    return {
      provider_id: descriptor.provider_id || adapter.id || "local-adapter",
      provider_type: descriptor.provider_type || "local",
      enabled: descriptor.enabled !== false,
      capabilities: descriptor.capabilities || defaultLocalCapabilities(),
      healthCheck: descriptor.healthCheck || function () { return Promise.resolve({ ok: true }); },
      execute: function (plan, ctx) { return adapter.run(plan, ctx); }
    };
  }

  // The conservative capability profile of the on-device local loop (M4): nothing leaves.
  function defaultLocalCapabilities() {
    return {
      supports_local: true, supports_cloud: false, max_egress: "none",
      data_classes_allowed: ["public", "personal", "sensitive"], requires_network: false,
      supports_streaming: false, supports_json: false, supports_tools: false,
      zero_retention_claimed: true, baa_eligible: false, region: "device",
      cost_class: "free", latency_class: "low"
    };
  }

  var API = {
    createRegistry: createRegistry,
    providerToKernelAdapter: providerToKernelAdapter, adapterToProvider: adapterToProvider,
    defaultLocalCapabilities: defaultLocalCapabilities
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_REGISTRY = API;
})();
