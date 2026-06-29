/* AUBS Providers v0.1 (Milestone 5) — single entry point.
   Provider contract + capabilities + registry + Drift Shield + fakes + kernel compat.
   Isolated: the live app does NOT depend on this (M5 defines the boundary only). */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var caps = require("./capabilities");
    var drift = require("./drift-shield");
    var registry = require("./registry");
    module.exports = {
      capabilities: caps,
      drift: drift,
      createRegistry: registry.createRegistry,
      providerToKernelAdapter: registry.providerToKernelAdapter,
      adapterToProvider: registry.adapterToProvider,
      defaultLocalCapabilities: registry.defaultLocalCapabilities,
      fakes: require("./fake-providers"),
      schema: require("./provider.schema.json")
    };
  } else if (typeof window !== "undefined") {
    var R = window.AUBS_PROVIDER_REGISTRY || {};
    window.AUBS_PROVIDERS = {
      capabilities: window.AUBS_PROVIDER_CAPS,
      drift: window.AUBS_PROVIDER_DRIFT,
      createRegistry: R.createRegistry,
      providerToKernelAdapter: R.providerToKernelAdapter,
      adapterToProvider: R.adapterToProvider,
      defaultLocalCapabilities: R.defaultLocalCapabilities,
      fakes: window.AUBS_PROVIDER_FAKES
    };
  }
})();
