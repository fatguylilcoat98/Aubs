/* ============================================================================
   AUBS GOVERNED-FACT REGISTRY — Migration A1 (ownership-clean)
   Truth · Safety · We Got Your Back

   The general table behind the One Rule (architecture doc §3): every governed
   fact has a runtime-owned answerer; the model may originate ONLY the open-ended
   row. Identity is no longer a special subsystem — it is an entry here that
   DELEGATES to the spine's single identity source (resolveRuntimeIdentity /
   identityRoute). The registry never forks identity, capability, or memory
   logic — it composes the spine's existing primitives.

   OWNERSHIP PRECEDENCE (the core invariant — A1 reviewer fix):
   the spine's identity detector (isIdentityQuery) is deliberately broad and
   catches "who made you" and "what can you do". Left first, it would over-capture
   creator/capability questions. So the table is ordered MOST-SPECIFIC OWNER FIRST:
       creator → capabilities → version → identity → user_profile
   Each specific entry's detector catches exactly its phrasings and never an
   identity one ("who are you", "what's your name", "what does AUBS stand for"
   all fall through to identity). This is fixed at the registry layer; the shared
   spine identity source is untouched.

   Deterministic, model-free. Consumed by core/facts/classifier.js, gated by
   FLAG_GOVERNED_FACTS (default OFF → byte-identical: the table is never consulted).

   Entry shape:
     { id, owner, modelMayOriginate:false,
       match(q, ctx) -> null | { answer:string, factId?:string } }
   The classifier returns the FIRST entry whose match() yields an answer.

   ctx (all optional):
     { resolved, identityConfig, appIdentity,
       runtime,   // { version, build, creator, capabilities:[string] }
       entries }  // memory entries for profile recall

   Environment-agnostic: module.exports (Node) or window.AUBS_GOVERNED_FACTS.
   ========================================================================== */
(function () {
  "use strict";
  var SPINE = (typeof require !== "undefined") ? require("../../spine/spine.js")
            : (typeof window !== "undefined" ? window.AUBS_SPINE : null);

  // Resolve identity once per match from whatever the caller handed us — always
  // through the spine resolver, never re-derived ad hoc.
  function asResolved(ctx) {
    if (ctx && ctx.resolved) return ctx.resolved;
    return SPINE.resolveRuntimeIdentity((ctx && ctx.identityConfig) || {}, ctx && ctx.appIdentity);
  }

  // ── Detectors owned by the registry (the specific owners that must win over the
  //    broad spine identity detector). Each is written to catch ONLY its own
  //    phrasings and never an identity question. ─────────────────────────────────

  // CREATOR — "who made/created/built/developed/designed/wrote you", "who is your
  // maker/creator/...". Must NOT match "who are you" (that is identity).
  function isCreatorQuery(q) {
    var s = String(q || "");
    return /\bwho(?:'?s| is| are)?\s+(?:your\s+)?(?:maker|creator|developer|author|inventor)\b/i.test(s)
        || /\bwho\s+(?:made|created|built|developed|designed|wrote|owns)\s+you\b/i.test(s)
        || /\bwho\s+are\s+you\s+(?:made|built|created|developed)\s+by\b/i.test(s);
  }

  // CAPABILITIES (feature/help phrasings the spine's privacy-oriented detector does
  // not cover). Must NOT match identity ("what are you" / "who are you").
  function isCapabilityListQuery(q) {
    var s = String(q || "");
    return /\bwhat\s+can\s+you\s+do\b/i.test(s)
        || /\bwhat\s+(?:are|is)\s+your\s+capabilit/i.test(s)
        || /\bwhat\s+are\s+you\s+capable\s+of\b/i.test(s)
        || /\bwhat\s+can\s+you\s+help\s+(?:me\s+)?with\b/i.test(s);
  }

  // VERSION / BUILD.
  function isVersionQuery(q) {
    return /\b(?:what\s+(?:version|build)\s+are\s+you|your\s+(?:version|build)|which\s+version|what(?:'?s| is)\s+your\s+version|version\s+number|what\s+build)\b/i.test(String(q || ""));
  }
  // Reality context — date/time the RUNTIME owns (the model hallucinates these, e.g. "Jan 1 2023").
  function isDateQuery(q) {
    return /\b(?:what(?:'?s| is)\s+(?:the\s+|today'?s\s+|current\s+|the\s+current\s+)?date|what\s+day\s+is\s+it|what(?:'?s| is)\s+today(?:'?s\s+date)?|today'?s\s+date|current\s+date|what\s+year\s+is\s+it)\b/i.test(String(q || ""));
  }
  function isTimeQuery(q) {
    return /\b(?:what(?:'?s| is)\s+the\s+time|what\s+time\s+is\s+it|current\s+time)\b/i.test(String(q || ""));
  }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Deterministic UTC formatter from an ISO `now`. The runtime may instead pass a pre-formatted
  // LOCAL string (ctx.runtime.dateStr / timeStr); that takes precedence for correct local time.
  function fmtDateUTC(now) {
    var d = new Date(now); if (isNaN(d.getTime())) return null;
    return DAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
  }
  function fmtTimeUTC(now) {
    var d = new Date(now); if (isNaN(d.getTime())) return null;
    var h = d.getUTCHours(), m = d.getUTCMinutes();
    return (h % 12 || 12) + ":" + (m < 10 ? "0" + m : m) + " " + (h < 12 ? "AM" : "PM") + " UTC";
  }

  function capabilityStatement(ctx) {
    var caps = ctx && ctx.runtime && ctx.runtime.capabilities;
    if (caps && caps.length) {
      // Runtime-supplied capability list (A2 wires the real skills/tools registry here).
      return "I can " + caps.join(", ") + " — all on your device.";
    }
    // Fail toward the runtime: a conservative, honest statement of what is actually
    // present today (conversation, Q&A, memory, on-device). Never an invented feature list.
    return "I'm a private, on-device assistant — I can talk things through, answer questions, and " +
           "remember what you choose to tell me, all running locally with nothing leaving your device.";
  }

  var ENTRIES = [
    // 1) CREATOR — most specific; claims "who made/created/... you" before identity.
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
    },

    // 2) CAPABILITIES / LOCALITY / PRIVACY — claims feature/help phrasings AND the
    //    spine's offline/cloud/data-leaves cluster, before identity.
    {
      id: "capabilities",
      owner: "runtime registry (spine:capabilityAnswer + runtime caps)",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (isCapabilityListQuery(q)) return { answer: capabilityStatement(ctx) };
        if (SPINE.isCapabilityQuery && SPINE.isCapabilityQuery(q)) {
          var a = SPINE.capabilityAnswer ? SPINE.capabilityAnswer(q) : null;
          return a ? { answer: a } : null;
        }
        return null;
      }
    },

    // 3) VERSION / BUILD — from runtime metadata, falling back to the spine version.
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

    // 3b) REALITY — date/time owned by the runtime (never the model). Prefers a runtime-supplied
    //     LOCAL string; falls back to deterministic UTC from ctx.runtime.now; honest if neither.
    {
      id: "reality_date",
      owner: "device clock / runtime",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!isDateQuery(q)) return null;
        var rt = (ctx && ctx.runtime) || {};
        var ds = rt.dateStr || fmtDateUTC(rt.now);
        return { answer: ds ? ("Today is " + ds + ".") : "I don't have the current date from this device right now." };
      }
    },
    {
      id: "reality_time",
      owner: "device clock / runtime",
      modelMayOriginate: false,
      match: function (q, ctx) {
        if (!isTimeQuery(q)) return null;
        var rt = (ctx && ctx.runtime) || {};
        var ts = rt.timeStr || fmtTimeUTC(rt.now);
        return { answer: ts ? ("It's " + ts + ".") : "I don't have the current time from this device right now." };
      }
    },

    // 4) IDENTITY — the catch-all "who/what are you", name, acronym, introduce,
    //    user-name. Delegated wholesale to the spine's one router. Runs AFTER the
    //    specific owners so it can no longer over-capture creator/capability.
    {
      id: "identity",
      owner: "spine:resolveRuntimeIdentity/identityRoute",
      modelMayOriginate: false,
      match: function (q, ctx) {
        var r = SPINE.identityRoute(q, asResolved(ctx));
        return (r && r.handled) ? { answer: r.answer, factId: "identity:" + r.kind } : null;
      }
    },

    // 5) USER PROFILE / MEMORY — "what you know about me". User-name queries are
    //    already taken by identity above; this catches the rest.
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
    }
  ];

  var API = {
    ENTRIES: ENTRIES,
    asResolved: asResolved,
    isCreatorQuery: isCreatorQuery,
    isCapabilityListQuery: isCapabilityListQuery,
    isVersionQuery: isVersionQuery,
    isDateQuery: isDateQuery,
    isTimeQuery: isTimeQuery,
    fmtDateUTC: fmtDateUTC,
    fmtTimeUTC: fmtTimeUTC,
    capabilityStatement: capabilityStatement
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_GOVERNED_FACTS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_GOVERNED_FACTS = API;
})();
