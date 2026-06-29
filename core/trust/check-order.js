/* ============================================================================
   AUBS TRUST OS — The Check-Order (Layer 6, §6)
   Truth · Safety · We Got Your Back

   The runtime consults in this exact sequence BEFORE the model is ever asked. Typing makes
   the order enforceable: a Constraint can never be silently overridden by a Preference, and
   the model is reached only after every earlier owner has declined.

     1. Constraints      — hard limits. Violated → STOP.
     2. Policies         — rules (CLASPION-authored, via GEL). Deny → STOP.
     3. Governed facts   — runtime owns the answer? Answer from state, model 0×.
     4. Relevant memory  — typed retrieval, provenance-tagged.
     5. Reasoning permission — is the model even allowed to answer? (Layer-6 gate)
     6. Model selection  — cheapest enabled meeting capability (or honest fallback).

   Each step is an INJECTED evaluator (so this is testable in isolation and never wires into
   the live pipeline here). Returns the resolving outcome + a per-step trace, each line
   strength-tagged (seeds the Decision Trace, §7). Deterministic.

   Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("./strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var RP = (typeof require !== "undefined") ? require("./reasoning-permission.js") : (typeof window !== "undefined" ? window.AUBS_REASONING_PERMISSION : null);

  // steps = { constraints(ctx), policies(ctx), governedFacts(ctx), memory(ctx), selection(ctx) }
  // each returns a small result; reasoning-permission is built in (the missing gate).
  async function runCheckOrder(steps, ctx) {
    steps = steps || {}; ctx = ctx || {};
    var trace = [];
    function line(step, detail, strength, status) { trace.push({ step: step, detail: detail || null, strength: strength, status: status || "ok" }); }

    // 1. Constraints — hard limits.
    var con = steps.constraints ? await steps.constraints(ctx) : { violated: false };
    if (con.violated) { line("Constraints", con.reason || "violated", S.SELF_VERIFIABLE, "blocked"); return { outcome: "blocked_constraint", reason: con.reason, model_called: false, trace: trace }; }
    line("Constraints", "passed", S.SELF_VERIFIABLE);

    // 2. Policies — CLASPION-authored, via GEL.
    var pol = steps.policies ? await steps.policies(ctx) : { decision: "allow" };
    if (pol.decision !== "allow") { line("Policies", "policy_" + pol.decision, S.SELF_VERIFIABLE, "blocked"); return { outcome: "blocked_policy", reason: pol.reason || pol.decision, model_called: false, trace: trace }; }
    line("Policies", "allow (" + (pol.winning_rule || "default") + ")", S.SELF_VERIFIABLE);

    // 3. Governed facts — runtime owns it? model 0×.
    var gf = steps.governedFacts ? await steps.governedFacts(ctx) : { handled: false };
    if (gf.handled) { line("GovernedFact", gf.factId || "governed", S.RUNTIME_ATTESTED); return { outcome: "governed_fact", answer: gf.answer, fact_id: gf.factId, model_called: false, trace: trace }; }
    line("GovernedFact", "not a governed fact", S.SELF_VERIFIABLE);

    // 4. Relevant memory — typed retrieval.
    var mem = steps.memory ? await steps.memory(ctx) : { items: [] };
    line("Memory", (mem.items || []).length + " typed item(s)", S.RUNTIME_ATTESTED);

    // 5. Reasoning permission — the gate that was missing.
    var perm = RP.evaluate({ governedFactHandled: false, policyDecision: pol.decision, modelForbidden: ctx.modelForbidden, classification: ctx.classification, escalationGranted: ctx.escalationGranted });
    if (perm.permission === "deny" || perm.permission === "defer") { line("ReasoningPermission", perm.permission + " — " + perm.reason, S.SELF_VERIFIABLE, "blocked"); return { outcome: "reasoning_" + perm.permission, reason: perm.reason, model_called: false, trace: trace }; }
    line("ReasoningPermission", perm.permission, S.SELF_VERIFIABLE);

    // 6. Model selection — only now is the model reached.
    var sel = steps.selection ? await steps.selection(ctx) : { provider: null };
    if (!sel.provider) { line("ModelSelection", "no eligible provider", S.SELF_VERIFIABLE, "blocked"); return { outcome: "blocked_no_provider", reason: sel.reason || "no_eligible_provider", model_called: false, trace: trace }; }
    line("ModelSelection", "selected " + sel.provider + (sel.basis ? " (" + sel.basis + ")" : ""), sel.strength || S.RUNTIME_ATTESTED);
    return { outcome: "model", provider: sel.provider, memory: mem.items || [], model_called: true, trace: trace };
  }

  var API = { runCheckOrder: runCheckOrder };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CHECK_ORDER = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_CHECK_ORDER = API;
})();
