/* ============================================================================
   AUBS TRUST OS — Decision Trace (Layer 7, §7) — NOT chain-of-thought
   Truth · Safety · We Got Your Back

   A structured, safe, inspectable trace — never the model's private reasoning. Two reasons
   (§7): raw model reasoning is non-deterministic (unprovable) AND it can echo the very
   private memory the Privacy Proof says stayed local. So the trace carries only structured
   lines — classification, constraints checked, facts retrieved, private memory blocked,
   model selected, reason, privacy result — each strength-tagged.

   buildDecisionTrace assembles from the check-order trace + classification + privacy result,
   and HARD-REFUSES any line that smuggles a free-text reasoning/thoughts field. Built off to
   the side. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("./strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);

  var FORBIDDEN = ["reasoning", "thoughts", "chain_of_thought", "cot", "scratchpad", "rationale_text", "model_thoughts"];

  function safeLine(l) {
    // a trace line is { step, detail, strength, status } — no free-text model reasoning fields.
    for (var i = 0; i < FORBIDDEN.length; i++) if (Object.prototype.hasOwnProperty.call(l, FORBIDDEN[i])) return false;
    return typeof l.strength === "string" && S.isCanonical(S.normalize(l.strength).strength || l.strength);
  }

  function hasForbidden(l) {
    for (var i = 0; i < FORBIDDEN.length; i++) if (l && Object.prototype.hasOwnProperty.call(l, FORBIDDEN[i])) return true;
    return false;
  }

  // parts = { classification, checkOrderTrace:[{step,detail,strength,status}], privacy:{strength,claim} }
  function buildDecisionTrace(parts) {
    parts = parts || {};
    // HARD REFUSE on the INPUT — never silently drop a smuggled reasoning field by reconstructing.
    (parts.checkOrderTrace || []).forEach(function (l) {
      if (hasForbidden(l)) throw new Error("decision-trace: input line carried a forbidden model-reasoning field");
    });
    var lines = [];
    lines.push({ step: "Classification", detail: parts.classification || "unclassified", strength: S.SELF_VERIFIABLE, status: "ok" });
    (parts.checkOrderTrace || []).forEach(function (l) {
      lines.push({ step: l.step, detail: l.detail || null, strength: l.strength, status: l.status || "ok" });
    });
    if (parts.privacy) lines.push({ step: "Privacy", detail: parts.privacy.claim || null, strength: parts.privacy.strength || S.RUNTIME_ATTESTED, status: "ok" });

    // HARD REFUSE: no chain-of-thought may enter the trace.
    var bad = lines.filter(function (l) { return !safeLine(l); });
    if (bad.length) throw new Error("decision-trace: a line carried forbidden model-reasoning or an invalid strength");

    return { lines: lines, has_chain_of_thought: false };
  }

  // a guard a caller can run on any candidate line set
  function assertNoChainOfThought(lines) { return (lines || []).every(safeLine); }

  var API = { buildDecisionTrace: buildDecisionTrace, assertNoChainOfThought: assertNoChainOfThought, FORBIDDEN: FORBIDDEN };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_DECISION_TRACE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_DECISION_TRACE = API;
})();
