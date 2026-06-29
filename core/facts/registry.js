/* ============================================================================
   AUBS GOVERNED-FACT REGISTRY — Migration A1
   Truth · Safety · We Got Your Back

   The general table behind the One Rule (architecture doc §3): every governed
   fact has a runtime-owned answerer; the model may originate ONLY the open-ended
   row. Identity is no longer a special subsystem — it is the first entry here,
   and it DELEGATES to the spine's single identity source
   (resolveRuntimeIdentity / identityRoute). The registry never forks identity,
   capability, or memory logic — it composes the spine's existing primitives so
   there is exactly one source of truth per fact.

   Deterministic, model-free. Consumed by core/facts/classifier.js, which is
   gated by FLAG_GOVERNED_FACTS (default OFF → byte-identical: every turn routes
   to the model and this table is never consulted).

   Entry shape:
     { id, owner, modelMayOriginate:false,
       match(q, ctx) -> null | { answer:string, factId?:string } }
   The classifier returns the FIRST entry whose match() yields an answer.

   ctx (all optional):
     { resolved,         // a resolved identity object (SPINE.resolveRuntimeIdentity)
       identityConfig,   // { assistantName, userName, tone, instructions } — used if no `resolved`
       appIdentity,      // { assistant_name, app_id, persona_ref } — app-declared
       runtime,          // { version, build, creator } — runtime metadata
       entries }         // memory entries for profile recall

   Environment-agnostic: module.exports (Node) or window.AUBS_GOVERNED_FACTS.
   ========================================================================== */
(function () {
  "use strict";
  var SPINE = (typeof require !== "undefined") ? require("../../spine/spine.js")
            : (typeof window !== "undefined" ? window.AUBS_SPINE : null);

  // Resolve identity once per match from whatever the caller handed us — never
  // re-derive it ad hoc, always go through the spine resolver.
  function asResolved(ctx) {
    if (ctx && ctx.resolved) return ctx.resolved;
    return SPINE.resolveRuntimeIdentity((ctx && ctx.identityConfig) || {}, ctx && ctx.appIdentity);
  }

  // --- detectors for the genuinely NEW runtime facts (not owned by the spine) ---
  // NOTE: "who made you" is already owned by the spine's identity route (isIdentityQuery),
  // so it stays an identity answer; creator here catches created/built/developed/designed/owns,
  // which identityRoute does NOT claim. (Reconciling that overlap is an A2 concern.)
  function isCreatorQuery(q) {
    return /\bwho(?:'?s| is| are)?\s+(?:your\s+)?(?:maker|creator|developer|author)\b/i.test(String(q || ""))
        || /\bwho\s+(?:created|built|developed|designed|owns|wrote)\s+you\b/i.test(String(q || ""))
        || /\bwho\s+are\s+you\s+(?:made|built|created|developed)\s+by\b/i.test(String(q || ""));
  }
  function isVersionQuery(q) {
    return /\b(?:what\s+(?:version|build)\s+are\s+you|your\s+(?:version|build)|which\s+version|what(?:'?s| is)\s+your\s+version|version\s+number|what\s+build)\b/i.test(String(q || ""));
  }

  var ENTRIES = [
    // 1) IDENTITY — the first rows, delegated wholesale to the spine's one router.
    {
      id: "identity",
      owner: "spine:resolveRuntimeIdentity/identityRoute",
      modelMayOriginate: false,
      match: function (q, ctx) {
        var r = SPINE.identityRoute(q, asResolved(ctx));
        return (r && r.handled) ? { answer: r.answer, factId: "identity:" + r.kind } : null;
      }
    },

    // 2) USER PROFILE / MEMORY — "what you know about me". Delegated to the spine's
    //    memory recall; user-name queries are already taken by identity above.
    {
      id: "user_profile",
      owner: "memory engine (spine:recallMemory)",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!SPINE.isMemoryQuery || !SPINE.isMemoryQuery(q)) return null;
        var entries = (ctx && ctx.entries) || [];
        var r = SPINE.recallMemory(q, entries);
        if (!r) return { answer: "I don't know that about you yet — tell me and I'll remember." };
        if (r.all) {
          var facts = r.entries.map(function (e) {
            return SPINE.userFactToSecondPerson(e.content).replace(/[.?!]$/, "");
          });
          return { answer: "Here's what I know about you: " + facts.join("; ") + "." };
        }
        return { answer: SPINE.userFactToSecondPerson(r.entry.content).replace(/[.?!]$/, "") + "." };
      }
    },

    // 3) CAPABILITIES / LOCALITY / PRIVACY — online/offline, cloud, data-leaves,
    //    private/secure. Delegated to the spine's existing capability answerer.
    {
      id: "capabilities",
      owner: "runtime registry (spine:capabilityAnswer)",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!SPINE.isCapabilityQuery || !SPINE.isCapabilityQuery(q)) return null;
        var a = SPINE.capabilityAnswer ? SPINE.capabilityAnswer(q) : null;
        return a ? { answer: a } : null;
      }
    },

    // 4) VERSION / BUILD — from runtime metadata, falling back to the spine version.
    {
      id: "version",
      owner: "runtime metadata",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!isVersionQuery(q)) return null;
        var v = (ctx && ctx.runtime && ctx.runtime.version) ? String(ctx.runtime.version)
              : (SPINE.SPINE_VERSION || "unknown");
        return { answer: "I'm running " + (asResolved(ctx).productName || "AUBS") + " " + v + "." };
      }
    },

    // 5) CREATOR — from runtime metadata. Fails TOWARD the runtime: if no creator
    //    is recorded, answer honestly rather than let the model invent one.
    {
      id: "creator",
      owner: "runtime metadata",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!isCreatorQuery(q)) return null;
        var c = (ctx && ctx.runtime && ctx.runtime.creator) ? String(ctx.runtime.creator).trim() : null;
        if (c) return { answer: "I was built by " + c + "." };
        return { answer: "I'm " + (asResolved(ctx).productName || "AUBS") +
                         ", a private on-device assistant. I don't have my creator recorded in my runtime facts yet." };
      }
    }
  ];

  var API = {
    ENTRIES: ENTRIES,
    asResolved: asResolved,
    isVersionQuery: isVersionQuery,
    isCreatorQuery: isCreatorQuery
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_GOVERNED_FACTS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_GOVERNED_FACTS = API;
})();
