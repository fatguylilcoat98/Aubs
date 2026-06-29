/* AUBS GEL v0.1 — single entry point. Evaluator + simulator + default bundle + schema.
   Isolated: the live app does NOT depend on this (Milestone 2 is the policy gate only). */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var evaluate = require("./evaluate");
    module.exports = {
      evaluate: evaluate.evaluate,
      validateBundle: evaluate.validateBundle,
      bundleHash: evaluate.bundleHash,
      PRECEDENCE: evaluate.PRECEDENCE,
      simulate: require("./simulator").simulate,
      defaultBundle: require("./default-policy-bundle.json"),
      bundleSchema: require("./policy-bundle.schema.json")
    };
  } else if (typeof window !== "undefined") {
    window.AUBS_GEL = {
      evaluate: window.AUBS_GEL_EVALUATE && window.AUBS_GEL_EVALUATE.evaluate,
      validateBundle: window.AUBS_GEL_EVALUATE && window.AUBS_GEL_EVALUATE.validateBundle,
      simulate: window.AUBS_GEL_SIMULATOR && window.AUBS_GEL_SIMULATOR.simulate
    };
  }
})();
