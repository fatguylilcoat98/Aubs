/* ============================================================================
   AUBS GOVERNED-FACT CLASSIFIER — Migration A1
   Truth · Safety · We Got Your Back

   The one hard edge (architecture doc §4): decide "governed fact vs open-ended
   language." Deterministic (pattern/intent rules the runtime owns, never a
   learned model), reproducible (same input → same routing), and it FAILS TOWARD
   THE RUNTIME — a governed fact is answered from owned state; only genuinely
   open-ended language is handed to the model.

   Gating: enabled defaults to the spine flag FLAG_GOVERNED_FACTS. When OFF, this
   returns { type:'open_ended' } for EVERY input — byte-identical to pre-A1
   behavior (the registry is never consulted, the model answers as before).

   This module is NOT yet mounted on the live entry paths — that is Migration A2,
   where Invariant I requires it sit on every path that can reach the model.
   `facts()` is exported so A2's path-enumeration test can introspect the table.

   classify(q, ctx) ->
     { type:'governed_fact', factId, owner, answer, model_called:false }
   | { type:'open_ended', reason? }

   Environment-agnostic: module.exports (Node) or window.AUBS_FACT_CLASSIFIER.
   ========================================================================== */
(function () {
  "use strict";
  var SPINE = (typeof require !== "undefined") ? require("../../spine/spine.js")
            : (typeof window !== "undefined" ? window.AUBS_SPINE : null);
  var REG = (typeof require !== "undefined") ? require("./registry.js")
          : (typeof window !== "undefined" ? window.AUBS_GOVERNED_FACTS : null);

  function flagOn() {
    return !!(SPINE && SPINE.FLAGS && SPINE.FLAGS.FLAG_GOVERNED_FACTS);
  }

  function classify(q, ctx) {
    ctx = ctx || {};
    var enabled = (ctx.enabled !== undefined) ? !!ctx.enabled : flagOn();
    if (!enabled) return { type: "open_ended", reason: "flag_off" };

    var entries = REG.ENTRIES;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var m = e.match(q, ctx);
      if (m && m.answer != null) {
        return {
          type: "governed_fact",
          factId: m.factId || e.id,
          owner: e.owner,
          answer: m.answer,
          model_called: false
        };
      }
    }
    return { type: "open_ended" };
  }

  // The full governed-fact table (introspection for A2's Invariant-I enumeration
  // test). The open-ended row is the ONLY one the model may originate.
  function facts() {
    var rows = REG.ENTRIES.map(function (e) {
      return { id: e.id, owner: e.owner, modelMayOriginate: !!e.modelMayOriginate };
    });
    rows.push({ id: "open_ended", owner: "model", modelMayOriginate: true });
    return rows;
  }

  var API = { classify: classify, facts: facts, flagOn: flagOn };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_FACT_CLASSIFIER = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_FACT_CLASSIFIER = API;
})();
