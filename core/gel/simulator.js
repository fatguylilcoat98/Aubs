/* ============================================================================
   AUBS GEL — policy simulator (Milestone 2)
   Dry-run many sample Plans against a policy bundle and report the outcomes. Future
   enterprise admin infra ("aubs policy simulate"); deterministic, no side effects.
   ========================================================================== */
(function () {
  "use strict";
  var EVAL = (typeof require !== "undefined") ? require("./evaluate") : (typeof window !== "undefined" ? window.AUBS_GEL_EVALUATE : null);

  // samples: array of { plan, intent } (or a bare plan). ctx.intent is a fallback intent.
  function simulate(samples, bundle, ctx) {
    ctx = ctx || {};
    var counts = { allow: 0, deny: 0, modify: 0, require_reauth: 0 };
    var results = (samples || []).map(function (s, i) {
      var plan = (s && s.plan) ? s.plan : s;
      var intent = (s && s.intent) ? s.intent : (ctx.intent || null);
      var d = EVAL.evaluate(plan, bundle, { intent: intent, decision_id: "sim_" + i, created_at: ctx.created_at || "2026-06-29T00:00:00Z" });
      if (counts[d.decision] !== undefined) counts[d.decision]++;
      return { index: i, plan_id: (plan && plan.plan_id) || "invalid", decision: d.decision, winning_rule: d.winning_rule, precedence_level: d.precedence_level, reason: d.reason };
    });
    return { count: results.length, counts: counts, results: results };
  }

  var API = { simulate: simulate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_GEL_SIMULATOR = API;
})();
