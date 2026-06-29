/* ============================================================================
   AUBS TRUST OS — Memory-type reconciliation (Layer 6, §6)
   Truth · Safety · We Got Your Back

   The doc proposed 7 types (Constraint·Policy·Fact·Preference·Episode·Source·Capability).
   Verification found the real store has 8 (FACT·PREFERENCE·PROFILE·TASK·DOCUMENT·SUMMARY·
   SYSTEM·INFERENCE), scoped (private…device). Blindly adding 7 new types would duplicate
   things that already live elsewhere. This module reconciles them HONESTLY:

     Constraint  → NOT a memory row — hard limits enforced FIRST by the check-order.
     Policy      → GEL bundle (CLASPION-authored), not memory.
     Capability  → core/providers/capabilities, not memory.
     Source      → memory:DOCUMENT.
     Episode     → memory:TASK / SUMMARY (past events).
     Fact        → memory:FACT.   Preference → memory:PREFERENCE.

   So only `Constraint` is genuinely missing — and it belongs in the check-order, not memory.
   Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var REAL_TYPES = ["FACT", "PREFERENCE", "PROFILE", "TASK", "DOCUMENT", "SUMMARY", "SYSTEM", "INFERENCE"];
  // Types whose items are sensitive/episodic and must never be silently egressed.
  var PRIVATE_KINDS = { TASK: 1, SUMMARY: 1, PROFILE: 1, INFERENCE: 1 };
  var EPISODIC = { TASK: 1, SUMMARY: 1 };

  var RECONCILE = {
    Constraint: { home: "check-order:constraints", memory: false, note: "hard limits, enforced first — not a memory row" },
    Policy:     { home: "gel:bundle",              memory: false, note: "CLASPION-authored policy, not memory" },
    Capability: { home: "providers:capabilities",  memory: false, note: "what a runtime/model can do, not memory" },
    Fact:       { home: "memory:FACT",             memory: true },
    Preference: { home: "memory:PREFERENCE",       memory: true },
    Episode:    { home: "memory:TASK|SUMMARY",     memory: true, note: "past events" },
    Source:     { home: "memory:DOCUMENT",         memory: true }
  };

  function isPrivate(type) { return !!PRIVATE_KINDS[String(type || "").toUpperCase()]; }
  function isEpisodic(type) { return !!EPISODIC[String(type || "").toUpperCase()]; }
  function isRealType(type) { return REAL_TYPES.indexOf(String(type || "").toUpperCase()) >= 0; }

  var API = { REAL_TYPES: REAL_TYPES, PRIVATE_KINDS: PRIVATE_KINDS, RECONCILE: RECONCILE, isPrivate: isPrivate, isEpisodic: isEpisodic, isRealType: isRealType };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_TYPES = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_MEMORY_TYPES = API;
})();
