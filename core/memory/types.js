/* ============================================================================
   AUBS Typed Scoped Memory — types, scopes, classifications (Milestone 9)
   Truth · Safety · We Got Your Back

   Memory is no longer storage. It is a governed asset. Every type and scope is explicit,
   so every memory can answer who owns it, who may read/write it, why it was used, and
   what evidence supports it. Only FACT and PREFERENCE may be auto-created; INFERENCE is
   ALWAYS marked inferred and is never silently promoted to fact.
   ========================================================================== */
(function () {
  "use strict";

  var MEMORY_TYPES = ["FACT", "PREFERENCE", "PROFILE", "TASK", "DOCUMENT", "SUMMARY", "SYSTEM", "INFERENCE"];
  // Types AUBS may create automatically from what the user says. Everything else is explicit.
  var AUTO_CREATABLE = ["FACT", "PREFERENCE"];
  // A type that, by definition, is never certain — it must carry inferred:true forever.
  var ALWAYS_INFERRED = ["INFERENCE"];

  var SCOPES = ["private", "conversation", "workspace", "family", "organization", "device"];

  var SOURCE_CLASSES = ["user_stated", "model_inferred", "document", "system", "imported"];

  var OPS = ["create", "supersede", "deactivate"];   // log operations (never physical delete)

  function isType(t) { return MEMORY_TYPES.indexOf(t) !== -1; }
  function isScope(s) { return SCOPES.indexOf(s) !== -1; }
  function isAutoCreatable(t) { return AUTO_CREATABLE.indexOf(t) !== -1; }
  function mustBeInferred(t) { return ALWAYS_INFERRED.indexOf(t) !== -1; }

  var API = {
    MEMORY_TYPES: MEMORY_TYPES, AUTO_CREATABLE: AUTO_CREATABLE, ALWAYS_INFERRED: ALWAYS_INFERRED,
    SCOPES: SCOPES, SOURCE_CLASSES: SOURCE_CLASSES, OPS: OPS,
    isType: isType, isScope: isScope, isAutoCreatable: isAutoCreatable, mustBeInferred: mustBeInferred
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_TYPES = API;
})();
