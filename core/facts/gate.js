/* ============================================================================
   AUBS GOVERNED-FACT GATE — Migration A2
   Truth · Safety · We Got Your Back

   The ONE pre-model owner (Invariant I). Every live entry path to the model MUST
   call governedFactGate() FIRST — before the router, before identityRoute, before
   any provider/model call. It gives the governed-fact registry first refusal:
     - a governed fact is answered from runtime-owned state (model 0×);
     - only genuinely open-ended language passes through to the model.

   The spine's identityRoute is reachable ONLY through here (via the registry's
   identity entry), so no live path can answer identity — or over-capture
   creator/capability questions — before the registry has had first refusal.

   Gated by FLAG_GOVERNED_FACTS (or ctx.enabled). OFF → handled:false for every
   input → byte-identical (the path proceeds to the model exactly as before).

   governedFactGate(text, ctx) ->
     { handled:true, answer, factId, owner, model_called:false }
   | { handled:false }

   Environment-agnostic: module.exports (Node) or window.AUBS_FACT_GATE.
   ========================================================================== */
(function () {
  "use strict";
  var CLS = (typeof require !== "undefined") ? require("./classifier.js")
          : (typeof window !== "undefined" ? window.AUBS_FACT_CLASSIFIER : null);

  function governedFactGate(text, ctx) {
    var r = CLS.classify(text, ctx || {});
    if (r && r.type === "governed_fact") {
      return { handled: true, answer: r.answer, factId: r.factId, owner: r.owner, model_called: false };
    }
    return { handled: false };
  }

  // The declared set of LIVE entry paths to the model. Invariant I requires each
  // one to call governedFactGate() as its first pre-model owner. The A2 path tests
  // enumerate this list and prove coverage; adding a model-reaching path without
  // registering + wiring it here is what the regression test is designed to catch.
  var LIVE_ENTRY_PATHS = [
    { id: "constitution_pipeline", desc: "core/constitution/pipeline.js stage 4a (runConstitutionalChat / ?spine=1)" },
    { id: "app_chat_handler",      desc: "aubs-app.html window.send() — governed-fact gate before router/model" }
  ];

  var API = { governedFactGate: governedFactGate, LIVE_ENTRY_PATHS: LIVE_ENTRY_PATHS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_FACT_GATE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_FACT_GATE = API;
})();
