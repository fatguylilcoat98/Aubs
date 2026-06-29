/* ============================================================================
   AUBS TRUST OS — Reasoning-Permission gate (Layer 6, §6 step 5) — was MISSING
   Truth · Safety · We Got Your Back

   Verification found the check-order had no explicit gate asking "is the model even ALLOWED
   to answer this?" — eligibility only picks a provider. This is that gate. Deterministic,
   model-free. It runs AFTER constraints/policies/governed-facts/memory and BEFORE model
   selection, and decides whether the language model may be invoked at all.

   evaluate(ctx) → { permission, reason }
     ctx = { governedFactHandled, policyDecision, modelForbidden, classification }
     - governedFactHandled  → "not_needed"  (runtime already owns the answer; model 0×)
     - policyDecision==="deny" → "deny"
     - modelForbidden===true → "deny"        (policy forbids model reasoning on this)
     - classification requires escalation w/o grant → "defer"
     - else → "allow"
   The decision is self-verifiable: same inputs → same permission, re-derivable offline.
   ========================================================================== */
(function () {
  "use strict";
  function evaluate(ctx) {
    ctx = ctx || {};
    if (ctx.governedFactHandled) return { permission: "not_needed", reason: "runtime answered from owned state; model not consulted" };
    if (ctx.policyDecision === "deny") return { permission: "deny", reason: "policy denied this action" };
    if (ctx.modelForbidden === true) return { permission: "deny", reason: "policy forbids model reasoning on this class" };
    if (ctx.classification === "restricted" && !ctx.escalationGranted) return { permission: "defer", reason: "restricted class needs escalation before the model may answer" };
    return { permission: "allow", reason: "model permitted to answer the open-ended remainder" };
  }
  var API = { evaluate: evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_REASONING_PERMISSION = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_REASONING_PERMISSION = API;
})();
