/* ============================================================================
   AUBS RESPONSE PROVENANCE — Migration A2.1 (the explainability invariant)
   Truth · Safety · We Got Your Back

   EVERY response — governed fact, model answer, blocked, or deterministic — carries
   an internal provenance record that answers four questions:
       owner        — WHO owned this answer (a fact id, "model", "governance")
       source       — WHERE it came from (runtime metadata, the spine, a model id)
       model_called — WAS the model consulted (boolean)
       reason       — WHY (governed_fact:<id> | open_ended | blocked:<r> | deterministic:<k>)

   This is internal by default (not shown to the user unless asked), and it is the
   formal form of the "Why?" indicator. It makes every turn debuggable and is the
   structural proof of the thesis: a governed turn always reports model_called:false.

   Environment-agnostic: module.exports (Node) or window.AUBS_PROVENANCE.
   ========================================================================== */
(function () {
  "use strict";

  function governed(factId, owner) {
    return { owner: factId || "governed_fact", source: owner || "runtime", model_called: false, reason: "governed_fact:" + (factId || "?") };
  }
  function model(modelId, providerId) {
    return { owner: "model", source: modelId || providerId || "model", model_called: true, reason: "open_ended" };
  }
  function blocked(stage, reason) {
    return { owner: "governance", source: stage || "gel", model_called: false, reason: "blocked:" + (reason || stage || "policy") };
  }
  function deterministic(kind, source) {
    return { owner: kind || "runtime", source: source || "runtime", model_called: false, reason: "deterministic:" + (kind || "runtime") };
  }

  // Every provenance MUST answer all four questions — used as an invariant assertion.
  function complete(p) {
    return !!(p && typeof p.owner === "string" && typeof p.source === "string"
      && typeof p.model_called === "boolean" && typeof p.reason === "string");
  }

  var API = { governed: governed, model: model, blocked: blocked, deterministic: deterministic, complete: complete };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVENANCE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROVENANCE = API;
})();
