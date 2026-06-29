/* AUBS CAC v0.1 — single entry point. Schemas + validation + builders + ledger adapter.
   Isolated module: the live app does NOT depend on this yet (Milestone 1 is contract work). */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var validate = require("./validate");
    module.exports = {
      CAC_VERSION: validate.CAC_VERSION,
      validate: validate,
      builders: require("./builders"),
      adapter: require("./decision-record-adapter"),
      schemas: {
        intent:     require("./schemas/intent.schema.json"),
        plan:       require("./schemas/plan.schema.json"),
        governance: require("./schemas/governance-decision.schema.json"),
        result:     require("./schemas/result.schema.json"),
        failure:    require("./schemas/failure.schema.json")
      }
    };
  } else if (typeof window !== "undefined") {
    window.AUBS_CAC = {
      CAC_VERSION: window.AUBS_CAC_VALIDATE && window.AUBS_CAC_VALIDATE.CAC_VERSION,
      validate: window.AUBS_CAC_VALIDATE,
      builders: window.AUBS_CAC_BUILDERS,
      adapter: window.AUBS_CAC_ADAPTER
    };
  }
})();
