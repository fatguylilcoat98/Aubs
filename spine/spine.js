/* ============================================================================
   AUBS SPINE — Checkpoint 0 (governed by The Checkpoint Constitution v1.1)
   Truth · Safety · We Got Your Back

   This is the SPINE: the deterministic truth core. It contains NO layers
   (no Distill / Router / Fast Boot / Skills) and makes NO model calls.
   Every function here is deterministic and unit-testable.

   Environment-agnostic: attaches to window (browser) or module.exports (Node),
   so the Golden Set can run against the exact same code the app loads.

   Article map:
     Art. 2  → Memory contract v1.1  (makeMemoryEntry / adaptMemories)
     Art. 3  → Provenance record v1.1 (makeProvenance / logProvenance)
     Art. 3a → Verified grounding      (parseCitations / tagAnswer)
     Art. 3b → Danger fact-check floor  (dangerFactCheck — geo starter)
     Art. 4  → Deterministic pipeline   (classify / retrieve / buildPromptMeta / safetyGate)
     Art. 6  → Feature flag framework   (FLAGS / activeFlags — all OFF)
     Art. 12 → System identity          (SYSTEM_IDENTITY — never user memory)
   ========================================================================== */
(function () {
  "use strict";

  // 1.2.0: adds `grounding_source` to the provenance/trace (Article 1a#6 requires a
  // version bump for any trace-format change) + two default-OFF control flags and the
  // candidate `verifyGrounding` (Article 3a amendment — NOT yet law; council ratifies).
  var SPINE_VERSION = "cp0-spine-1.3.1";

  /* -- Article 6: Feature flag framework. Layers are NOT built; all default OFF.
        Flags here change computation only — never truth/tag semantics. -------- */
  var FLAGS = {
    FLAG_DISTILL: false,
    FLAG_ROUTER: false,
    FLAG_FASTBOOT: false,
    FLAG_SKILLS: false,
    // Control flags (Article 6), default OFF. Dogfood/diagnostic only.
    FLAG_TRACE_VERBOSE: false,           // expose the full per-turn trace in the app
    FLAG_SPINE_VERIFIED_GROUNDING: false,// CANDIDATE Article 3a amendment (see verifyGrounding)
    FLAG_SPINE_GROUNDING_V2: false,      // CANDIDATE Article 3a amendment v2 (semantic fit: query-gated + object disambiguation + value-verified tier)
    FLAG_LEDGER: false,                  // Milestone 0: write tamper-evident DecisionRecords (spine/ledger.js)
    FLAG_IDENTITY_V2: false,             // Slice 0 CANDIDATE Article 12 v2: identity is APP-declared + OS-owned, never model-originated
    FLAG_GOVERNED_FACTS: false,          // Migration A1: governed-fact registry + classifier (core/facts/*). Default OFF = byte-identical (every turn routes to the model).
    FLAG_TRUST_OS: false                 // Trust OS wire-up: a turn emits a validated Trust Record (six proofs). Default OFF = byte-identical (the field is simply absent).
  };
  function activeFlags() {
    return Object.keys(FLAGS).filter(function (k) { return FLAGS[k] === true; });
  }

  /* -- Article 12: immutable system identity. Lives in code, NOT in user memory.
        "Who are you?" is answered from here; the spine never searches the user's
        memory for identity, and a user persona is a style layer only. ---------- */
  var SYSTEM_IDENTITY = Object.freeze({
    name_default: "AUBS",
    expansion: "Autonomous Unit Brain System",   // CANONICAL product fact — the model NEVER invents it (Unified Identity)
    role: "a private, on-device AI assistant — The Good Neighbor Guard",
    creed: "Truth · Safety · We Got Your Back",
    statement: "I am AUBS, a private on-device AI. I run entirely on your device; nothing you say leaves it."
  });
  function isIdentityQuery(q) {
    return /\b(who are you|what are you|your name|are you (a|an) ai|who made you|what can you do)\b/i.test(q || "");
  }

  /* -- Article 12 v2 (Slice 0, behind FLAG_IDENTITY_V2; default OFF until ratified). ------
     The inversion: under the layered architecture AUBS is the OS, not the conversational
     identity. The APP declares the identity; the OS owns the MECHANISM (inject it, answer
     identity queries deterministically from the declared value, forbid the model from being
     the source). A user-typed persona name is a STYLE costume only and can never override the
     app identity. If no app declares an identity (bare OS), the fallback is AUBS — correct,
     because then no application is speaking. This is app-agnostic: spine resolves whatever
     identity it is handed; the specific apps (Splendor/LYLO) live in the app layer. ------- */
  function resolveIdentity(appIdentity, userPersonaName) {
    var name = (appIdentity && appIdentity.assistant_name) ? String(appIdentity.assistant_name)
                                                           : SYSTEM_IDENTITY.name_default; // fallback only if no app
    return {
      name: name,                        // authoritative, from the app (or AUBS fallback)
      style: userPersonaName || null,    // costume only; NEVER the answer to "who are you"
      app_id: (appIdentity && appIdentity.app_id) || "aubs",
      persona_ref: (appIdentity && appIdentity.persona_ref) || "aubs-default",
      creed: SYSTEM_IDENTITY.creed
    };
  }
  // Broader identity detector used ONLY by the v2 route (gated by FLAG_IDENTITY_V2), so the
  // flag-OFF path and the existing isIdentityQuery semantics are untouched. Adds the spec's
  // "Are you AUBS?" / "Are you <AppName>?" forms on top of the base detector.
  function identityQueryV2(q, assistantName) {
    if (isIdentityQuery(q)) return true;
    var s = String(q || "");
    if (/\bare you\b[^?]*\b(aubs|the app|the assistant|an? ai|a bot|chatgpt|gpt|claude|gemini)\b/i.test(s)) return true;
    if (assistantName) {
      var n = String(assistantName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp("\\bare you\\b[^?]*\\b" + n + "\\b", "i").test(s)) return true;
    }
    return false;
  }
  // Deterministic identity answer composed from the INJECTED identity — never generated by a
  // model. Accepts an app_identity (or an Execution Contract carrying one). Model called 0×.
  function answerIdentity(appIdentityOrContract, userPersonaName) {
    var ai = appIdentityOrContract && appIdentityOrContract.app_identity
           ? appIdentityOrContract.app_identity : appIdentityOrContract;
    var resolved = resolveIdentity(ai, userPersonaName);
    return "I'm " + resolved.name + ".";
  }

  /* ========================================================================================
     UNIFIED IDENTITY GOVERNANCE (the One Rule applied to identity). Three concepts kept
     SEPARATE, one resolved object, one resolver, read by every subsystem. The model is never
     the source of truth for any of the five governed answers. Behind FLAG_IDENTITY_V2 (OFF =
     byte-identical: nothing below runs unless a caller opts in).
       • Assistant identity  — what it calls itself ("Tom")        ← resolved by precedence
       • Product / runtime    — what it runs on ("AUBS")            ← constant
       • Product fact         — what AUBS stands for                ← constant (never invented)
     ======================================================================================== */
  // The single resolver. config = { assistantName, userName, tone, instructions }. Precedence
  // for the assistant name: governed app > user-configured > product fallback ("AUBS").
  function resolveRuntimeIdentity(config, appIdentity) {
    config = config || {};
    var PRODUCT_NAME = SYSTEM_IDENTITY.name_default;          // "AUBS" — the runtime/product
    var PRODUCT_EXPANSION = SYSTEM_IDENTITY.expansion;        // canonical, frozen
    var name, source;
    if (appIdentity && appIdentity.assistant_name) { name = String(appIdentity.assistant_name).trim(); source = "app"; }
    else if (config.assistantName && String(config.assistantName).trim()) { name = String(config.assistantName).trim(); source = "user"; }
    else { name = PRODUCT_NAME; source = "default"; }
    return {
      assistantDisplayName: name, assistantNameSource: source,
      productName: PRODUCT_NAME, productExpansion: PRODUCT_EXPANSION,
      appDeclaredIdentity: appIdentity ? (appIdentity.assistant_name || null) : null,
      appId: appIdentity ? (appIdentity.app_id || null) : null,
      personaRef: appIdentity ? (appIdentity.persona_ref || null) : null,
      userName: (config.userName && String(config.userName).trim()) ? String(config.userName).trim() : null,
      activeTone: config.tone || "", customInstructions: config.instructions || "",
      precedence: { assistant: "app>user>default", chosen: source }
    };
  }

  // ── Detectors for the five governed routes (used only on the resolved path) ──────────────
  function isAcronymQuery(q) {
    return /\b(stands? for|acronym|abbreviation|what does (?:aubs|it) (?:stand for|mean))\b/i.test(String(q || ""));
  }
  function isUserNameQuery(q) {
    var s = String(q || "");
    return /\b(what'?s my name|what is my name|who am i|do you know my name|what do you call me)\b/i.test(s) && !/\byour name\b/i.test(s);
  }
  function isIntroduceQuery(q) {
    return /\b(introduce yourself|tell me about yourself|introduce your ?self)\b/i.test(String(q || ""));
  }
  function acronymAnswer() { return SYSTEM_IDENTITY.name_default + " stands for " + SYSTEM_IDENTITY.expansion + "."; }

  /* The single deterministic identity router. Takes a RESOLVED identity object and returns
     { handled, kind, answer, model_called:false } for the five governed intents, or
     { handled:false } to let the governed model turn proceed. The model is NEVER the source. */
  function identityRoute(q, resolved) {
    resolved = resolved || {};
    var s = String(q || "");
    var name = resolved.assistantDisplayName || SYSTEM_IDENTITY.name_default;
    // 1) USER name — about the USER, never the assistant.
    if (isUserNameQuery(s)) {
      return { handled: true, kind: "user_name", model_called: false,
               answer: resolved.userName ? ("Your name is " + resolved.userName + ".") : "I don't know yet — what should I call you?" };
    }
    // 2) ACRONYM — a PRODUCT fact, separate from the assistant's identity. Canonical, never invented.
    if (isAcronymQuery(s)) {
      return { handled: true, kind: "acronym", model_called: false, answer: acronymAnswer() };
    }
    var product = resolved.productName || SYSTEM_IDENTITY.name_default;
    var sameAsProduct = name.toLowerCase() === product.toLowerCase();   // bare-OS / no custom name
    // 3) INTRODUCE — name + runtime, both true at once (no redundant clause when name IS the runtime).
    if (isIntroduceQuery(s)) {
      return { handled: true, kind: "introduce", model_called: false,
               answer: sameAsProduct ? ("I'm " + name + ", your private on-device assistant.")
                                     : ("I'm " + name + ", your private assistant running on " + product + ".") };
    }
    // 4) ASSISTANT identity — "who are you" / "your name" / "are you X".
    if (identityQueryV2(s, name) || identityQueryV2(s, product)) {
      // "who are you" gets name + runtime context; "what's your name" is just the name.
      if (/\bwho are you\b/i.test(s) && !sameAsProduct) return { handled: true, kind: "assistant_identity", model_called: false, answer: "I'm " + name + ", running locally through " + product + "." };
      return { handled: true, kind: "assistant_identity", model_called: false, answer: "I'm " + name + "." };
    }
    return { handled: false };
  }

  /* Post-generation GUARD (the safety net for SIDEWAYS turns where the model drifts into
     self-description). Deterministic, no model in the loop. Corrects: (a) a wrong assistant-name
     self-claim, (b) any non-canonical AUBS expansion, (c) an invented user name when unknown.
     Only rewrites identity claims; ordinary text is untouched. */
  function identityGuard(text, resolved) {
    if (!text || !resolved) return text;
    var out = String(text);
    var name = resolved.assistantDisplayName || SYSTEM_IDENTITY.name_default;
    var esc = function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
    // (b) any "AUBS (stands for|short for|…) <X>" where X ≠ canonical → canonical expansion.
    out = out.replace(/\bAUBS\b[,]?\s+(?:stands for|short for|which stands for|that stands for|is short for|means|standing for|aka|also known as)\s+[^.?!\n]*/gi,
      function (m) { return /Autonomous Unit Brain System/i.test(m) ? m : ("AUBS stands for " + SYSTEM_IDENTITY.expansion); });
    // (a) wrong assistant-name self-claim of the OS name → the declared name (when name ≠ AUBS).
    // Covers "I'm AUBS", "I am AUBS", "my name is AUBS", "i'm called AUBS", "call me AUBS",
    // each optionally trailed by an invented expansion.
    if (name.toLowerCase() !== "aubs") {
      var expTail = "(?:[,]?\\s+(?:short for|which stands for|that stands for|stands for|aka|also known as)\\s+[^.?!\\n]*)?";
      out = out.replace(new RegExp("\\bmy name(?:'?s| is)\\s+AUBS\\b" + expTail, "gi"), "My name is " + name);
      out = out.replace(new RegExp("\\b(?:I(?:'?m| am)|i'?m called|call me)\\s+AUBS\\b" + expTail, "gi"), "I'm " + name);
    }
    // invented expansion attached to the DECLARED name → keep the name, drop the invention
    out = out.replace(new RegExp("\\bI(?:'?m| am)\\s+" + esc(name) + "\\b[,]?\\s+(?:short for|which stands for|that stands for|stands for|aka|also known as)\\s+[^.?!\\n]*", "gi"), "I'm " + name);
    // (c) invented user name when unknown: "your name is <X>" → honest unknown (case-insensitive)
    if (!resolved.userName) {
      out = out.replace(/\byour name(?:'?s| is)\s+[A-Z][A-Za-z'’-]*/gi, "I don't know your name yet");
    }
    return out;
  }

  /* identityPreamble — the leading system text (Article 12 in prose).
     Checkpoint 0 device-audit fix (Bug 2): the system identity is IMMUTABLE and
     always leads the prompt. A user-supplied persona name/tone is a STYLE costume
     only; it must never replace AUBS as the answer to "who are you?". Centralized
     here so the live app and tests share one wording (no drift). Compact on
     purpose (~70 tokens base) — the device GPU faulted on a ~550-token prefill. */
  function identityPreamble(personaName, opts) {
    opts = opts || {};
    var id = SYSTEM_IDENTITY;
    // Unified Identity (resolved path): when a ResolvedIdentity is supplied, the model is TOLD
    // the truth — it speaks AS the resolved assistant name, AUBS is the runtime (not its name),
    // and the canonical AUBS expansion is fixed. This is the prompt BACKSTOP; the governed routes
    // are the guarantee. Absent a resolved object → the original wording (flag-OFF byte-identical).
    if (opts.resolved && opts.resolved.assistantDisplayName) {
      var R = opts.resolved, nm = R.assistantDisplayName, style = String(personaName == null ? "" : personaName).trim();
      var hasStyle = style && style.toLowerCase() !== nm.toLowerCase() && style.toLowerCase() !== "aubs";
      var rp = "You are " + nm + ", a private assistant that lives on this phone. You run on " + R.productName +
        " — the " + R.productExpansion + " — the local runtime on this device. Your name is " + nm + "; " +
        R.productName + " is the system you run on, not your name. Never invent a different meaning for " +
        R.productName + " — it stands for " + R.productExpansion + ". If asked the user's name and it isn't known, " +
        "say you don't know yet — never guess. Be honest, answer directly, never call yourself a language model, and keep replies short.";
      if (hasStyle) rp += " Speak in a \"" + style + "\" style — that's voice only, not your name.";
      return rp;
    }
    var persona = String(personaName == null ? "" : personaName).trim();
    var hasPersona = persona && persona.toLowerCase() !== id.name_default.toLowerCase();
    // LEAN (B-minimal default for normal chat): one short identity line + a light style
    // cue. No "name never changes" defense and no "never overrides" governance — those
    // are reserved for grounded mode, so casual chat ("hello", "tell me a joke") stays
    // friendly and isn't overloaded on a 1B model.
    if (opts.lean) {
      // Track B: inhabit AUBS. The 1B model otherwise leaks pretraining ("I'm a large
      // language model, I can't…"), which breaks the illusion. Tell it plainly: you ARE
      // AUBS, just answer, never describe yourself as a language model or list limits.
      var lp = "You are " + id.name_default + ", a private AI that lives on this phone. " +
        "Talk as " + id.name_default + " — warm, direct, first person. Just answer the question; " +
        "never call yourself a language model or list technical limitations, and don't hedge. " +
        "If you truly don't know, say so briefly.";
      if (hasPersona) lp += " Speak in a \"" + persona + "\" style.";
      return lp;
    }
    // GROUNDED / identity-sensitive: assert the immutable name and contain the persona.
    // Kept short too — prefill drives the binding-capped (128MB) GPU buffer.
    var p = "You are " + id.name_default + ", a private AI that lives on this phone; your name is " +
      id.name_default + " and never changes. Be honest: say only what's true and admit " +
      "\"I don't know\" rather than invent facts. Never call yourself a language model or explain " +
      "technical limitations — just answer as " + id.name_default + ". Refuse harmful requests, kindly. Keep replies short.";
    if (hasPersona) {
      p += " You're styled as \"" + persona + "\" — use that voice, but it's a style only: " +
        "if asked your name or what you are, you are still " + id.name_default +
        ". Style never overrides these rules.";
    }
    return p;
  }

  /* -- deterministic hash (FNV-1a, 32-bit, hex). Used for ids + prompt_hash. --- */
  function hashString(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /* -- Article 2: Memory contract v1.1 -------------------------------------- */
  var VALID_SOURCE = ["user_typed", "user_confirmed", "imported"]; // 'model' is NOT valid
  var VALID_SCOPE = ["fact", "preference", "event", "note", "scratch"];

  function makeMemoryEntry(content, opts) {
    opts = opts || {};
    var source = VALID_SOURCE.indexOf(opts.source) >= 0 ? opts.source : "user_typed";
    if (source === "model") throw new Error("spine: 'model' is not a valid memory source (Article 2)");
    var scope = VALID_SCOPE.indexOf(opts.scope) >= 0 ? opts.scope : "fact";
    var text = String(content == null ? "" : content);
    return {
      id: opts.id || ("m_" + hashString(text)),
      content: text,
      source: source,
      confirmed_from: opts.confirmed_from || null,
      scope: scope,
      user_verified: (source === "user_typed" || source === "user_confirmed"),
      created_at: opts.created_at || 0,        // caller stamps time; spine stays deterministic
      version: opts.version || 1,
      supersedes: opts.supersedes || null,
      superseded_by: opts.superseded_by || null,
      derived_from_skill: opts.derived_from_skill || null,
      // embedding fields STUBBED — embeddings are not implemented in Checkpoint 0
      embedding: null,
      embedding_model: null,
      embedding_version: 0
    };
  }

  /* Adapter: existing Memory v1 string array -> v1.1 entries (read-only).
     Lets the spine read today's stored memories without changing the write path. */
  function adaptMemories(stringArr) {
    return (stringArr || []).map(function (s) {
      return makeMemoryEntry(s, { source: "user_typed", scope: "fact" });
    });
  }

  /* live = retrievable: not superseded AND user_verified (Article 2). */
  function liveEntries(entries) {
    return (entries || []).filter(function (e) {
      return e && e.superseded_by == null && e.user_verified === true;
    });
  }

  /* -- Checkpoint 0 device-audit fix (Bug 1): deterministic fact extraction.
     Centralized here so the live app and the unit tests share ONE matcher.
     Conservative by design: a NOT_NAME stop-list prevents "i'm happy" / "i'm
     here" / "i'm working" from being mistaken for a name, and the casual bare
     "i'm X" name pattern fires only when no other fact matched the clause.
     Handles: "My name is Chris", "call me Chris", "I'm Chris", "well hello im
     chris" (no apostrophe, mid-sentence, lowercase). Names are capitalized for
     storage. ------------------------------------------------------------------ */
  var NOT_NAME = {
    happy:1, sad:1, tired:1, fine:1, good:1, great:1, ok:1, okay:1, back:1, here:1,
    sorry:1, sure:1, ready:1, busy:1, hungry:1, bored:1, late:1, done:1, home:1,
    well:1, glad:1, excited:1, confused:1, lost:1, old:1, young:1, "new":1, curious:1,
    not:1, just:1, still:1, really:1, very:1, so:1, the:1, a:1, an:1, in:1, on:1,
    from:1, at:1, to:1, going:1, trying:1, looking:1, working:1, building:1, making:1,
    creating:1, doing:1, feeling:1, getting:1, thinking:1, living:1, having:1,
    planning:1, reading:1, writing:1, learning:1, using:1, running:1, playing:1,
    gonna:1, about:1
  };
  function tidyFact(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[.?!,;:]+$/, "").trim();
  }
  function capitalizeName(s) {
    return String(s == null ? "" : s).split(/\s+/).map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(" ");
  }
  function looksLikeName(raw) {
    var w = tidyFact(raw);
    if (!w) return false;
    if (!/^[a-z][a-z'-]*( [a-z][a-z'-]*)?$/i.test(w)) return false; // 1-2 alpha tokens only
    var first = w.split(/\s+/)[0].toLowerCase();
    return !NOT_NAME[first];
  }
  function extractFacts(text) {
    var facts = [];
    var clauses = String(text == null ? "" : text).split(/[.;\n]| and | but /i)
      .map(tidyFact).filter(Boolean);
    for (var i = 0; i < clauses.length; i++) {
      var c = clauses[i], m, nameFound = false, otherFound = false;
      // explicit name
      if ((m = c.match(/\b(?:my name is|my name's|call me|i'm called|i am called)\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)/i))) {
        if (looksLikeName(m[1])) { facts.push("User's name is " + capitalizeName(tidyFact(m[1]))); nameFound = true; }
      }
      // location — incl. a MOVE ("I moved to X" / "I now live in X"), which supersedes the old home.
      if ((m = c.match(/\bi\s*(?:'ve\s+|have\s+)?(?:just\s+)?(?:moved|relocated)\s+to\s+(.+)/i))) { facts.push("User lives in " + tidyFact(m[1])); otherFound = true; }
      else if ((m = c.match(/\bi\s*(?:'m\s+|am\s+)?(?:now\s+)?(?:live|living|reside|located)\s+in\s+(.+)/i))) { facts.push("User lives in " + tidyFact(m[1])); otherFound = true; }
      else if ((m = c.match(/\bi(?:'m| am)\s+from\s+(.+)/i))) { facts.push("User is from " + tidyFact(m[1])); otherFound = true; }
      // builds / working on
      if ((m = c.match(/\bi\s+(?:build|make|create|develop|design)\s+(.+)/i))) { facts.push("User builds " + tidyFact(m[1])); otherFound = true; }
      else if ((m = c.match(/\bi(?:'m| am)\s+(?:building|making|creating|working\s+on)\s+(.+)/i))) { facts.push("User is working on " + tidyFact(m[1])); otherFound = true; }
      // work
      if ((m = c.match(/\bi\s+work\s+(?:as|at)\s+(.+)/i))) { facts.push("User works at " + tidyFact(m[1])); otherFound = true; }
      // likes
      if ((m = c.match(/\bi\s+(?:like|love|enjoy|prefer)\s+(.+)/i))) { facts.push("User likes " + tidyFact(m[1])); otherFound = true; }
      // favourite
      if ((m = c.match(/\bmy\s+(favou?rite\s+.+?\s+is\s+.+)/i))) { facts.push("User's " + tidyFact(m[1])); otherFound = true; }
      // possessions / dependents ("I have two dogs", "I have a sister") — quantifier-scoped to
      // avoid abstract noise ("I have a question"); multi-value (each distinct possession is kept).
      if ((m = c.match(/\bi\s+have\s+((?:a|an|one|two|three|four|five|six|some|several|many|no|\d+)\s+.+)/i))) { facts.push("User has " + tidyFact(m[1])); otherFound = true; }
      // casual bare name — ONLY if nothing else matched this clause (so "i'm from X",
      // "i'm building X" don't also yield a name). "i'?m" matches both "i'm" and "im".
      if (!nameFound && !otherFound && (m = c.match(/\b(?:i'?m|i am)\s+([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?)/i))) {
        if (looksLikeName(m[1])) { facts.push("User's name is " + capitalizeName(tidyFact(m[1]))); }
      }
    }
    return facts;
  }

  /* -- Article 4: classify (deterministic, rule-based). The AI router is a later
        LAYER and is suggestion-only; this rule path is the spine. -------------- */
  function classify(q) {
    q = String(q || "");
    if (isIdentityQuery(q)) return "identity";
    if (/^[\s\d+\-*/().^%]+$/.test(q) && /\d/.test(q)) return "math";
    if (/\b(remember|know about me|my name|where do i|what do i|how old am i)\b/i.test(q)) return "personal";
    if (/\b(my|i|me|mine)\b/i.test(q) && /\?\s*$/.test(q)) return "personal";
    return "general";
  }

  /* -- Article 4: retrieve (deterministic ordering + filtering; top_k <= 3).
        NOTE: in Checkpoint 0 the live app still injects all memories into the
        prompt for behavioral parity; this capped retrieval is the frozen target
        the live build will adopt under its own validation. ---------------------- */
  function retrieve(entries, q) {
    var live = liveEntries(entries);
    var selected = live.slice(0, 3); // top_k <= 3, no rerank (no embeddings yet)
    return { selected: selected, memory_ids_in_prompt: selected.map(function (e) { return e.id; }) };
  }

  /* -- Article 3a: verified grounding ---------------------------------------- */
  function parseCitations(text, opts) {
    opts = opts || {};
    var ids = [], t = String(text || ""), m;
    var re = /\[ID:([A-Za-z0-9_\-]+)\]/g;
    while ((m = re.exec(t)) !== null) ids.push(m[1]);
    if (opts.tolerant === true) {
      // Checkpoint 0.6 spike: also accept a bare bracketed memory id like [m_123]
      // (the "ID:" prefix dropped). Does not match inside [ID:m_123] (preceded by ':').
      var re2 = /\[(m_[A-Za-z0-9]+)\]/g, m2;
      while ((m2 = re2.exec(t)) !== null) { if (ids.indexOf(m2[1]) < 0) ids.push(m2[1]); }
    }
    return ids;
  }

  /* -- Checkpoint 0.6: deterministic relevance / answerability guard ----------
     A cited memory may ground an answer ONLY if it is relevant to the user's
     query. Deterministic, model-free, conservative (defaults to NOT relevant
     when it cannot establish a link).

     Query normalization:
       - both query and memory content are lowercased;
       - slot patterns match the lowercased query with word boundaries (\b), so
         trailing/embedded punctuation ("what's my name?") does not interfere and
         the apostrophe form ("what's") is handled explicitly;
       - the keyword-overlap fallback additionally strips punctuation
         ([^a-z0-9 ] -> space) and removes short/stopwords before comparing.

     Two signals:
       1) query-intent slots: a known query type must cite a memory whose content
          matches that type (name->name, location->location, ...). Slots:
          name, location, birth, sister, wifi/password, job, pet, likes.
       2) keyword-overlap fallback when no slot matches: >=1 non-stopword from the
          query must appear in the memory content.

     Known strict cases that downgrade SAFELY (to 'inferred', never a false
     'grounded'): out-of-slot phrasings ("Where am I?" — no live/located verb),
     synonyms/morphology with no literal overlap ("birthplace" vs "born",
     "cities" vs "city"), and pronoun-only queries that reduce to stopwords.

     Returns { relevant, basis }. ------------------------------------------------ */
  var REL_SLOTS = [
    { intent: "sister",   q: /\bsister('?s)?\b/,                                                              m: /\bsister\b/ },
    { intent: "wifi",     q: /\b(wi-?fi|password|passcode|passphrase|\bpin\b)\b/,                              m: /\b(wi-?fi|password|passcode|passphrase|\bpin\b)\b/ },
    { intent: "birth",    q: /\b(year .*\bborn\b|when .*\bborn\b|birth ?year|how old am i|my age)\b/,           m: /\b(born|birth|18\d\d|19\d\d|20\d\d|years? old)\b/ },
    { intent: "location", q: /\bwhere (do|am) i (live|living|located|reside)\b|\bmy (address|city|location|hometown|state)\b/, m: /\b(live|lives|living|located|reside|resides|from|city|address|hometown|state)\b/ },
    { intent: "name",     q: /\b(what('?s| is) my name|my name|who am i)\b/,                                    m: /\bname is\b|\bcalled\b/ },
    { intent: "job",      q: /\b(what do i do|my (job|work|occupation|profession)|where do i work)\b/,          m: /\b(work|works|job|occupation|profession|build|builds|develop|engineer|developer)\b/ },
    { intent: "pet",      q: /\b(my (dog|cat|pet)|pet('?s)? name)\b/,                                           m: /\b(dog|cat|pet)\b/ },
    { intent: "likes",    q: /\b(what do i like|my favou?rite|do i (like|love|enjoy))\b/,                       m: /\b(like|likes|love|loves|favou?rite|enjoy|enjoys|prefers?)\b/ }
  ];
  var REL_STOP = { the:1,a:1,an:1,is:1,are:1,do:1,does:1,did:1,i:1,me:1,my:1,mine:1,you:1,your:1,what:1,where:1,when:1,who:1,how:1,why:1,of:1,to:1,in:1,on:1,for:1,and:1,or:1,about:1,tell:1,know:1,remember:1,whats:1,was:1 };
  // Verified Grounding v2 (Layer 2): deterministic object extractor — the noun the query
  // asks ABOUT, for coarse slots. "what's my favorite color" -> "color"; specific slots -> null.
  function extractQueryObject(query, intent) {
    var q = String(query || "").toLowerCase();
    if (intent === "likes") {
      var m = q.match(/favou?rite\s+([a-z]+)/);
      if (m) return m[1];
      var m2 = q.match(/\bdo i (?:like|love|enjoy)\s+([a-z]+)/);
      if (m2) return m2[1];
    }
    return null;   // specific slots are already disambiguated by their pattern
  }
  // opts.disambiguate (v2): for object-bearing slots, the memory must mention the query's
  // object noun (closes the same-slot cross-grounding hole: "favorite color" vs "favorite food").
  function relevanceCheck(query, content, opts) {
    opts = opts || {};
    var q = String(query || "").toLowerCase();
    var c = String(content || "").toLowerCase();
    if (!q) return { relevant: false, basis: "no-query" };
    for (var i = 0; i < REL_SLOTS.length; i++) {
      var s = REL_SLOTS[i];
      if (s.q.test(q)) {
        // Known query intent: the cited memory must match that intent's content.
        if (!s.m.test(c)) return { relevant: false, basis: "slot-miss:" + s.intent };
        if (opts.disambiguate === true) {
          var obj = extractQueryObject(q, s.intent);
          if (obj && c.indexOf(obj) < 0) return { relevant: false, basis: "object-miss:" + s.intent + ":" + obj };
          return { relevant: true, basis: "slot:" + s.intent + (obj ? ":" + obj : "") };
        }
        return { relevant: true, basis: "slot:" + s.intent };
      }
    }
    // No known intent -> require keyword overlap between query and memory.
    var words = q.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !REL_STOP[w]; });
    if (!words.length) return { relevant: false, basis: "no-content-words" };
    var hit = words.filter(function (w) { return c.indexOf(w) >= 0; });
    return hit.length > 0 ? { relevant: true, basis: "overlap:" + hit.join(",") } : { relevant: false, basis: "no-overlap" };
  }

  /* tagAnswer: the deterministic 'tag' stage.
     opts = { answer, memory_ids_in_prompt, entries, classification, conflict } */
  function tagAnswer(opts) {
    opts = opts || {};
    var inPrompt = {};
    (opts.memory_ids_in_prompt || []).forEach(function (id) { inPrompt[id] = true; });
    var byId = {};
    (opts.entries || []).forEach(function (e) { byId[e.id] = e; });

    var cited = parseCitations(opts.answer, { tolerant: opts.tolerantFormat === true });
    var validCited = cited.filter(function (id) {
      return inPrompt[id] === true && byId[id] && byId[id].user_verified === true && byId[id].superseded_by == null;
    });

    // Conflict between two live, non-superseded contradictory memories -> unknown (Art. 2)
    if (opts.conflict === true) return { tag: "unknown", memory_ids_cited: [] };
    // Article 12: identity answers come from immutable system identity, never user
    // memory — so they can never be 'grounded', even if the model cites a user fact.
    if (opts.classification === "identity") return { tag: "general", memory_ids_cited: [] };

    // === Article 3a — Verified Grounding (RATIFIED, Checkpoint 0.6) ===
    // A response may be tagged 'grounded' ONLY when a cited id satisfies ALL of:
    //   1. valid citation format  — [ID:x], or [m_x] when tolerantFormat is on;
    //   2. the id is in memory_ids_in_prompt (it was actually offered to the model);
    //   3. the cited memory is user_verified;
    //   4. the cited memory is not superseded (superseded_by == null);
    //   5. the cited memory is RELEVANT to the user query (relevanceCheck).
    // Conflicts -> unknown; identity -> general (Art. 12); anything cited but not
    // groundable -> downgraded to 'inferred'. Conditions 1-4 are checked above
    // (validCited); condition 5 is the relevance guard below.
    //
    // Relevance is enforced when opts.query is provided; if no query is given we
    // cannot verify relevance, so (conservatively) nothing grounds.
    var groundable = validCited;
    if (FLAGS.FLAG_SPINE_GROUNDING_V2 === true) {
      // === Verified Grounding v2 (CANDIDATE Article 3a amendment, flag-gated) ===
      // Layer 1: grounding REQUIRES a query (default fail-closed; no query -> no ground).
      // Layer 2: relevance uses object disambiguation (relevanceCheck disambiguate:true).
      // Layer 3 (conservative): only the value_verified tier displays as 'grounded';
      //   a merely topic_relevant citation downgrades to 'inferred'. The tier + basis are
      //   returned so the Glass Box never shows a weak match identically to a strong one.
      var requireRelV2 = (opts.requireRelevance !== false);
      if (opts.query != null && opts.query !== "") {
        groundable = validCited.filter(function (id) { return relevanceCheck(opts.query, byId[id].content, { disambiguate: true }).relevant; });
      } else if (requireRelV2) {
        groundable = [];
      }
      var valueVerified = groundable.filter(function (id) { return groundingStrength(opts.answer, byId[id], opts.query) === "value_verified"; });
      if (valueVerified.length > 0) {
        return { tag: "grounded", memory_ids_cited: valueVerified, grounded_on: valueVerified, grounding_strength: "value_verified", relevance_basis: relevanceCheck(opts.query, byId[valueVerified[0]].content, { disambiguate: true }).basis };
      }
      if (cited.length > 0) return { tag: "inferred", memory_ids_cited: [], grounding_strength: groundable.length ? "topic_relevant" : null };
      // else fall through to the shared no-citation tail
    } else {
      // === Article 3a (RATIFIED) — unchanged when the v2 flag is off ===
      if (opts.query != null && opts.query !== "") {
        groundable = validCited.filter(function (id) { return relevanceCheck(opts.query, byId[id].content).relevant; });
      } else if (opts.requireRelevance === true) {
        groundable = [];
      }
      if (groundable.length > 0) return { tag: "grounded", memory_ids_cited: groundable };
      if (cited.length > 0) return { tag: "inferred", memory_ids_cited: [] }; // cited but unverifiable/irrelevant -> downgrade
    }

    // No citation (shared tail):
    if (opts.classification === "identity") return { tag: "general", memory_ids_cited: [] }; // from system identity
    if (opts.classification === "personal") {
      return { tag: liveEntries(opts.entries).length ? "inferred" : "unknown", memory_ids_cited: [] };
    }
    return { tag: "general", memory_ids_cited: [] };
  }
  // Verified Grounding v2 (Layer 3): the grounding tier for one memory vs the answer.
  //   "value_verified" — relevant (disambiguated) AND the answer states the memory's value
  //                      (substring), negation-guarded; "topic_relevant" — relevant only;
  //   null — not relevant. Deterministic, model-free, conservative.
  function groundingStrength(answer, memory, query) {
    if (!memory || !relevanceCheck(query, memory.content, { disambiguate: true }).relevant) return null;
    var val = extractMemoryValue(memory.content).toLowerCase();
    var lc = String(answer || "").toLowerCase();
    var idx = val.length >= 2 ? lc.indexOf(val) : -1;
    if (idx >= 0) {
      var pre = lc.slice(Math.max(0, idx - 18), idx);
      if (!/\b(not|isn'?t|aren'?t|don'?t|never|no longer|wrong)\b/.test(pre)) return "value_verified";
    }
    return "topic_relevant";
  }

  /* ===========================================================================
     verifyGrounding — CANDIDATE Article 3a AMENDMENT (NOT yet ratified law).
     ---------------------------------------------------------------------------
     Article 3a as written grounds ONLY on a model-emitted [ID:x]. Device evidence
     shows 1B models rarely emit that tag, so memory-backed answers almost never
     reach 'grounded' even when they correctly state the fact. This function is a
     DETERMINISTIC, model-free post-hoc check proposed as an amendment: it grounds an
     answer only when ALL hold —
       1. a cited-or-not memory is in_prompt, user_verified, not superseded,
       2. it passes relevanceCheck(query, content)  (same guard as 3a), AND
       3. the answer AFFIRMATIVELY states that memory's exact value (substring match,
          with a negation guard so "your code is not 1234" does NOT ground 1234 —
          the classic 3a false-positive trap).
     It is invoked ONLY when FLAG_SPINE_VERIFIED_GROUNDING is ON (default OFF), and
     it records grounding_source:'spine_verified' (vs 'model_cited') so the Glass Box
     never blurs the two. Conservative by design: when unsure, it does NOT ground.
     KNOWN LIMITS (for council): literal value match only (no paraphrase/synonyms);
     the negation guard is a fixed window, not a parser. Ratification required before
     this becomes law; until then it stays behind the flag. ====================== */
  function extractMemoryValue(content) {
    var c = String(content || "").replace(/[.?!,;:]+$/, "").trim();
    c = c.replace(/^user('?s)?\s+/i, "");
    c = c.replace(/^(name\s+is|favou?rite\s+.+?\s+is|is\s+working\s+on|is\s+from|lives?\s+in|works?\s+at|works?\s+as|builds?|makes?|creates?|likes?|loves?|enjoys?|prefers?|is|are)\s+/i, "");
    return c.trim();
  }
  function verifyGrounding(opts) {
    opts = opts || {};
    var q = opts.query, ans = String(opts.answer || ""), lc = ans.toLowerCase();
    if (!q || !ans) return { grounded: false };
    var inPrompt = {};
    (opts.memory_ids_in_prompt || []).forEach(function (id) { inPrompt[id] = true; });
    var live = liveEntries(opts.entries || []);
    for (var i = 0; i < live.length; i++) {
      var e = live[i];
      if (inPrompt[e.id] !== true) continue;                       // must have been offered
      if (!relevanceCheck(q, e.content).relevant) continue;        // same relevance guard as 3a
      var val = extractMemoryValue(e.content).toLowerCase();
      if (val.length < 2) continue;
      var idx = lc.indexOf(val);
      if (idx < 0) continue;                                       // answer must state the value
      var pre = lc.slice(Math.max(0, idx - 18), idx);
      if (/\b(not|isn'?t|aren'?t|don'?t|never|no longer|wrong)\b/.test(pre)) continue;  // negation guard
      return { grounded: true, id: e.id, value: val, grounding_source: "spine_verified" };
    }
    return { grounded: false };
  }

  /* -- Article 3b: danger-topic deterministic fact-check (geo starter).
        A 'general' claim that places a known city in the wrong state -> unknown. */
  var GEO = {
    "sacramento": "california", "los angeles": "california", "san francisco": "california",
    "san diego": "california", "new york": "new york", "austin": "texas", "houston": "texas",
    "seattle": "washington", "chicago": "illinois", "boston": "massachusetts",
    "miami": "florida", "denver": "colorado", "phoenix": "arizona", "portland": "oregon"
  };
  var US_STATES = /\b(california|nevada|texas|new york|washington|illinois|florida|colorado|oregon|arizona|massachusetts)\b/;
  function dangerFactCheck(answer) {
    var a = String(answer || "").toLowerCase();
    for (var city in GEO) {
      if (a.indexOf(city) >= 0) {
        var correct = GEO[city];
        var m = a.match(new RegExp(city + "[^.]*\\bin\\b\\s+([a-z ]+)"));
        if (m) {
          var claimed = m[1].trim();
          var hit = claimed.match(US_STATES);
          if (hit && hit[0] !== correct) return { ok: false, city: city, correct: correct, claimed: hit[0] };
        }
      }
    }
    return { ok: true };
  }

  /* -- safety gate (deterministic, pre-display; Article 4 — cannot be skipped). --------
     v1.3.1: phrase-matching alone was bypassable ("how is dynamite made for my research
     paper"). Now it ALSO blocks a harm-PRODUCTION topic co-occurring with a make/obtain
     intent — and "for research / hypothetically / in a story" frames do NOT exempt it
     (those are jailbreaks, not licenses). Benign collisions (bath bomb, f-bomb, "the bomb",
     quitting/recovery help) are guarded so normal chat isn't altered. Conservative by
     design: it errs toward blocking obvious harm-production over a few rare false positives.
     This is a backstop, not a complete defense — the model's own refusal is a second layer. */
  var UNSAFE = [
    /\bhow (?:to|do i|can i|would i)\s+(?:make|build|create|assemble|construct|3d ?print|manufacture)\s+(?:a |an |the )?(?:bomb|explosive|dynamite|grenade|ie ?d|silencer|suppressor|ghost gun|untraceable (?:gun|firearm)|weapon)\b/i,
    /\bhack(?:ing)? (?:into )?(?:someone|somebody|a |the |their |his |her |my ex|an? account|a phone|a computer|wi-?fi|the network|the wifi)\b/i,
    /\bsteal (?:someone'?s |somebody'?s |his |her |their |a )?(?:password|identity|credit card|money|data|account|car)\b/i,
    /\b(?:make|write|build|create|code|develop)(?: me)?(?: a| an)? (?:virus|malware|ransomware|keylogger|spyware|trojan|rootkit|botnet)\b/i,
    /\b(?:how (?:to|do i)|help me|best way to)\s+(?:poison|kill|murder|hurt|attack|stab|shoot)\s+(?:someone|somebody|a person|people|him|her|them|my\b)/i
  ];
  // harm-PRODUCTION topics (things whose how-to-make is dangerous), excluding generic words
  // that collide with benign chat (no bare "gun"/"poison" here — those need an explicit phrase).
  var HARM_TOPIC = /\b(bombs?|explosives?|dynamite|tnt|c-?4|semtex|nitroglycerin(?:e)?|grenades?|ie ?ds?|napalm|thermite|molotov|blasting caps?|det(?:onator)? cord|nerve (?:agent|gas)|sarin|vx gas|mustard gas|ricin|anthrax|botulinum|chemical weapons?|bio(?:logical)? ?weapons?|dirty bomb|nuclear (?:bomb|weapon|device)|meth(?:amphetamine)?|crystal meth|fentanyl|heroin|cocaine|crack cocaine|lsd|mdma|ecstasy|cyanide|ghost guns?|untraceable (?:gun|firearm)|auto[- ]?sear|full[- ]auto conversion|silencers?|suppressors?)\b/i;
  // production / acquisition intent (NOT generic "how to" — that collides with "how to quit X")
  // NOTE: no trailing \b on the group — bare stems (manufactur, detonat, synthes…) must
  // match their inflections (manufacture/manufacturing) which a closing \b would block.
  var HARM_INTENT = /\b(make|made|making|build|building|built|create|creating|construct|synthes|manufactur|produc|cook|brew|assembl|detonat|obtain|acquir|buy|purchase|sell|recipe|formula|blueprint|schematic|instruction|tutorial|step[- ]by[- ]step|how .{0,40}\b(?:made|built|done))/i;
  // common BENIGN collisions stripped before topic detection (bath bomb, f-bomb, "the bomb"…)
  var BENIGN_STRIP = /\b(?:bath|f|the|da|glitter|photo|stink|sex|cherry|cinnamon|smoke) bombs?\b/gi;
  // Self-harm detection. HIGH-RECALL by design (Safety Path Hardening, from the M14 device
  // pass): a missed crisis is the worst failure the system can produce, so for self-harm ONLY
  // we accept some false positives to catch the colloquial/indirect family people actually type
  // under distress ("i'm just gonna end it", "can't do this anymore", "no reason to go on",
  // "better off dead"). The one genuine benign collision — bare "end it" (ending a meeting/game)
  // — is guarded by requiring a crisis verb-phrase ("gonna/about to/ready to … end it"); bare
  // "end it" / "end the meeting" / "end this subscription" do NOT match.
  var SELF_HARM = /\b(kill myself|killing myself|suicide|suicidal|end (?:my|it all) life|end my life|ending my life|end it all|take my (?:own )?life|want to die|wanna die|better off dead|don'?t want to (?:live|be alive|be here|exist)|no longer want to be here|(?:gonna|going to|just gonna|just going to|might as well|ready to|about to) end it|can'?t (?:go on|keep going)|can'?t (?:do|take) this any ?more|no reason to (?:live|go on)|tired of living|give up on life|nothing to live for|end my pain|hurt myself|harm myself|cut(?:ting)? myself|overdose on)\b/i;

  // Health-harm: a medical SUBSTANCE co-occurring with a lethal/overdose INTENT, but NOT an
  // ordinary care intent. Routed to the self-harm CARE response — a "lethal dose of X" question
  // is far more often a person in crisis than a chemist. PRECISE by design (opposite of the
  // self-harm asymmetry): ordinary dosing/safety questions must pass, so the discriminator is
  // intent vocabulary, not the substance. (Safety Path Hardening, Part 2.)
  var HEALTH_SUBSTANCE = /\b(acetaminophen|tylenol|paracetamol|ibuprofen|advil|motrin|aspirin|insulin|benadryl|diphenhydramine|tramadol|oxycodone|opioids?|benzodiazepines?|xanax|valium|antifreeze|bleach|sleeping pills?|pain ?killers?)\b/i;
  var HEALTH_HARM_INTENT = /\b(lethal|fatal|deadly|overdose|to die|enough to (?:die|kill)|kill (?:me|myself)|how (?:much|many) .{0,30}(?:die|death|fatal|lethal|overdose))\b/i;
  var HEALTH_SAFE_INTENT = /\b(safe (?:dose|amount)|recommended|normal dose|usual dose|is it (?:safe|okay|ok)|how often|with food|side ?effects?|for (?:a )?(?:headache|fever|pain|cold|inflammation))\b/i;

  function safetyGate(text) {
    var t = String(text || "");
    if (SELF_HARM.test(t)) return { blocked: true, reason: "self_harm", category: "self_harm" };
    for (var i = 0; i < UNSAFE.length; i++) {
      if (UNSAFE[i].test(t)) return { blocked: true, reason: "unsafe_request", category: "harm" };
    }
    var scan = t.replace(BENIGN_STRIP, " ");                       // drop bath-bomb etc. before topic test
    if (HARM_TOPIC.test(scan) && HARM_INTENT.test(scan)) return { blocked: true, reason: "unsafe_topic", category: "harm" };
    // Health-harm → CARE (self_harm), not a flat refusal. Substance + harm-intent, never an
    // ordinary care intent. Errs toward care on overdose/lethal framing; ordinary dosing passes.
    if (HEALTH_SUBSTANCE.test(scan) && HEALTH_HARM_INTENT.test(scan) && !HEALTH_SAFE_INTENT.test(scan))
      return { blocked: true, reason: "self_harm", category: "self_harm" };
    return { blocked: false };
  }
  /* The text shown when the gate blocks. Self-harm gets care + a real resource, not a flat
     "I can't help" — "we got your back" includes the hard moments. */
  function safeResponse(reason) {
    if (reason === "self_harm")
      return "I'm really sorry you're carrying this right now — and I'm glad you said something. You deserve real support. If you're in the US, you can call or text 988 (Suicide & Crisis Lifeline) any time, or reach your local emergency number. Please talk to someone you trust too — you don't have to get through this alone.";
    return "I can't help with that — it could cause real harm. If there's a safe, legal version of what you're after, tell me and I'll do my best to help with that instead.";
  }

  /* -- Checkpoint 0.5: citation instruction + memory recall block.
        Centralized here so the app and the test harness use IDENTICAL wording
        (no drift). Kept simple for 1B models. ---------------------------------- */
  function citationInstruction(exampleId) {
    var ex = exampleId || "abc123";
    // Path 2.1 (device audit): simpler + more direct + a worked example, because 1B
    // models followed the old wording unreliably. Kept short (prefill budget).
    return "RULE: when a fact below answers the question, end your sentence by copying that " +
      "fact's id in square brackets, exactly like [ID:" + ex + "]. " +
      "Example — fact \"[ID:" + ex + "] User's name is Chris\", question \"what's my name?\", " +
      "you answer: \"Your name is Chris [ID:" + ex + "].\" " +
      "Use only the ids shown below. If no fact answers, write no id.";
  }
  // Full memory-recall block injected at build_prompt. Returns null if no live memory.
  function memoryRecallBlock(entries) {
    var live = liveEntries(entries);
    if (!live.length) return null;
    // Enabling, not just restrictive: small models under-recalled because the old
    // framing only fired "when asked what you remember". State plainly that these are
    // the USER's facts, are true, and should be USED to answer questions about the
    // user — and disambiguate them from AUBS's own identity (the device confused the
    // two and replied "I'm not Chris, I'm AUBS").
    var framing = "Known facts about the USER, saved from earlier (these describe the user, not you). " +
      "Treat them as true and use them to answer the user's questions about themselves — for example, " +
      "if the user asks their own name, answer with the name below. Your own name is still AUBS; do not confuse the two.";
    var lines = live.map(function (e) { return "- [ID:" + e.id + "] " + e.content; }).join("\n");
    return framing + "\n" + citationInstruction(live[0].id) + "\n" + lines;
  }

  /* classifyCitation — citation-reliability outcome for one model answer.
     opts = { answer, memory_ids_in_prompt, entries, expected_id }
       expected_id = the id that SHOULD be cited, or null if no citation expected.
     Returns one of:
       'cited_correct'           cited the expected, verified, in-prompt id
       'cited_wrong_in_prompt'   cited a real in-prompt id, but not the expected one
       'cited_nonexistent'       cited an id that was never in the prompt
       'omitted'                 a citation was expected but none was emitted
       'cited_when_none_expected'cited when no citation should exist
       'correct_no_citation'     no citation expected and none emitted (good) */
  function classifyCitation(opts) {
    opts = opts || {};
    var inPrompt = {};
    (opts.memory_ids_in_prompt || []).forEach(function (id) { inPrompt[id] = true; });
    var byId = {};
    (opts.entries || []).forEach(function (e) { byId[e.id] = e; });
    var cited = parseCitations(opts.answer);
    var expected = opts.expected_id || null;
    var validCited = cited.filter(function (id) {
      return inPrompt[id] === true && byId[id] && byId[id].user_verified === true && byId[id].superseded_by == null;
    });
    var nonexistent = cited.filter(function (id) { return inPrompt[id] !== true; });
    if (expected) {
      if (cited.length === 0) return "omitted";
      if (validCited.indexOf(expected) >= 0) return "cited_correct";
      if (nonexistent.length > 0) return "cited_nonexistent";
      return "cited_wrong_in_prompt";
    } else {
      if (cited.length === 0) return "correct_no_citation";
      if (nonexistent.length > 0) return "cited_nonexistent";
      return "cited_when_none_expected";
    }
  }

  /* -- Article 4: build_prompt meta — prompt_hash + memory_ids_in_prompt ------ */
  function buildPromptMeta(sentMessages, memory_ids_in_prompt) {
    return {
      prompt_hash: "ph_" + hashString(typeof sentMessages === "string" ? sentMessages : JSON.stringify(sentMessages || "")),
      memory_ids_in_prompt: memory_ids_in_prompt || []
    };
  }

  /* -- Article 3: provenance record v1.1 ------------------------------------- */
  function makeProvenance(o) {
    o = o || {};
    return {
      query_id: o.query_id || ("q_" + hashString((o.query || "") + "|" + (o.timestamp || 0))),
      timestamp: o.timestamp || 0,
      prompt_hash: o.prompt_hash || null,
      memory_ids_in_prompt: o.memory_ids_in_prompt || [],
      memory_ids_cited: o.memory_ids_cited || [],
      tag: o.tag || "unknown",
      grounding_source: o.grounding_source || null,   // 'model_cited' | 'spine_verified' (candidate) | null
      grounding_strength: o.grounding_strength || null, // v2 (candidate): 'value_verified' | 'topic_relevant' | null
      tier_used: o.tier_used || "low",
      flags_active: o.flags_active || [],
      source_of_answer: o.source_of_answer || "model",
      skill_id: o.skill_id || null,
      cache_key: o.cache_key || null,
      generation_attempts: o.generation_attempts || [],
      layer_contribution: o.layer_contribution || null,
      spine_version: SPINE_VERSION,
      latency_ms: (typeof o.latency_ms === "number") ? o.latency_ms : 0
    };
  }

  /* -- Glass Box trace v1 (Article 0.1) -------------------------------------- */
  var _traces = [];
  var _last = null;
  function logProvenance(p) {
    _last = p;
    _traces.push(p);
    if (_traces.length > 50) _traces.shift();
    return p;
  }
  function lastProvenance() { return _last; }
  function allProvenance() { return _traces.slice(); }
  function glassBox(p) {
    p = p || _last;
    if (!p) return null;
    return {
      tag: p.tag,
      sent_to_model: p.memory_ids_in_prompt,   // "Sent to model"
      used_in_answer: p.memory_ids_cited,       // "Used in answer"
      flags_active: p.flags_active,
      source: p.source_of_answer,
      tier_used: p.tier_used,
      spine_version: p.spine_version,
      prompt_hash: p.prompt_hash
    };
  }

  /* ===========================================================================
     FLAG_ROUTER — Response Quality Layer v1 (deterministic dispatcher).
     ---------------------------------------------------------------------------
     Article 4 says the deterministic rule-based router IS spine; an AI router would
     be a later suggestion-only layer. This is the rule path. It runs BEFORE the model
     and answers KNOWN/correct things itself, so the 0.5B model only generates when the
     value is novel language. Conservative: anything it isn't sure of falls back to the
     model. It never changes tag SEMANTICS — a router memory answer is grounded because
     the answer literally IS a user_verified memory (source_of_answer:'rule'), and unsafe
     stays refused. Gated by FLAG_ROUTER (default OFF). ========================== */
  function detectIntent(q) {
    q = String(q || "").trim();
    if (!q) return "fallback";
    if (safetyGate(q).blocked) return "unsafe";
    if (isIdentityQuery(q)) return "identity";
    if (/\bare you\b[^?]*\b(chatgpt|gpt|claude|gemini|a bot|a robot|a human|a person|real|an? ai|a software (developer|engineer)|a developer|a programmer|the app|the software|aubs|jack black|a (therapist|doctor|lawyer|nurse))\b/i.test(q)) return "identity";
    if (/\bwhat('?s| is| are)\s+(you|aubs)\b/i.test(q) || /\bwho (made|created|built|owns|designed) you\b/i.test(q)) return "identity";
    if (isSimpleMath(q)) return "math";
    if (isCapabilityQuery(q)) return "capability";
    if (isMemoryQuery(q)) return "memory";
    if (/^(hi|hello|hey|yo|sup|howdy|hiya|good (morning|afternoon|evening)|greetings)[\s!.,'’]*$/i.test(q)) return "greeting";
    if (/\b(joke|make me laugh|something funny|a pun)\b/i.test(q)) return "joke";            // → model
    if (/\b(help me|can you help|evaluate|review|brainstorm|an? idea|my project|design|improve|write|draft|explain)\b/i.test(q)) return "project_help"; // → model
    return "fallback";                                                                        // → model
  }

  function isSimpleMath(q) {
    var e = String(q || "").replace(/^\s*(what(?:'s| is)|whats|calculate|compute|how much is|solve)\s+/i, "").replace(/[?=\s]+$/, "").trim();
    return /^[-+*/×÷().\d\s]+$/.test(e) && /\d\s*[-+*/×÷]\s*\d/.test(e);
  }
  // Deterministic recursive-descent arithmetic evaluator — NO eval, NO Function. Supports
  // digits, decimals, whitespace, + - * / parentheses, and unary +/-. Rejects identifiers,
  // invalid tokens, trailing junk, and division by zero (→ null). Precedence: () > unary > * / > + -.
  function evalArith(s) {
    var i = 0, n = s.length, error = false;
    function ws() { while (i < n && s[i] === " ") i++; }
    function peek() { ws(); return i < n ? s[i] : null; }
    function expr() {
      var v = term(); if (v === null) return null;
      for (;;) { var c = peek(); if (c === "+" || c === "-") { i++; var r = term(); if (r === null) return null; v = (c === "+") ? v + r : v - r; } else break; }
      return v;
    }
    function term() {
      var v = factor(); if (v === null) return null;
      for (;;) { var c = peek(); if (c === "*" || c === "/") { i++; var r = factor(); if (r === null) return null; if (c === "/") { if (r === 0) { error = true; return null; } v = v / r; } else v = v * r; } else break; }
      return v;
    }
    function factor() {
      var c = peek();
      if (c === "+") { i++; return factor(); }
      if (c === "-") { i++; var f = factor(); return f === null ? null : -f; }
      return primary();
    }
    function primary() {
      var c = peek();
      if (c === "(") { i++; var v = expr(); if (v === null) return null; if (peek() !== ")") { error = true; return null; } i++; return v; }
      ws(); var start = i;
      while (i < n && s[i] >= "0" && s[i] <= "9") i++;
      if (i < n && s[i] === ".") { i++; while (i < n && s[i] >= "0" && s[i] <= "9") i++; }
      if (i === start) { error = true; return null; }              // no digits where a number was expected
      var num = parseFloat(s.slice(start, i));
      return isFinite(num) ? num : (error = true, null);
    }
    var result = expr(); ws();
    if (error || result === null || i !== n || !isFinite(result)) return null;   // trailing junk / structural error
    return result;
  }
  function solveMath(q) {
    var e = String(q || "").replace(/^\s*(what(?:'s| is)|whats|calculate|compute|how much is|solve)\s+/i, "").replace(/[?=]+\s*$/, "").trim();
    e = e.replace(/×/g, "*").replace(/÷/g, "/");
    if (!/^[-+*/().\d\s]+$/.test(e)) return null;                 // fast reject: arithmetic chars only, no identifiers
    return evalArith(e);                                          // deterministic parser — no eval, no Function
  }

  function isCapabilityQuery(q) {
    return /\b(work|run|works|running) (offline|without (internet|wifi|a connection))\b/i.test(q)
      || /\b(do you|does this|are you) .*(offline|cloud|internet|online|server|network)\b/i.test(q)
      || /\b(data|anything|what i (say|type)) .*(leave|leaves|sent|uploaded|stored|shared)\b/i.test(q)
      || /\b(is (this|it|my data)|are you) (private|secure|safe)\b/i.test(q)
      || /\bdo you (use|need) (the )?(cloud|internet|wifi|a server)\b/i.test(q);
  }
  function capabilityAnswer(q) {
    if (/\b(data|anything|what i (say|type)).*(leave|leaves|sent|uploaded|stored|shared)\b/i.test(q) || /\bdata leave\b/i.test(q))
      return "No — nothing you type leaves this device. Everything stays on your phone.";
    if (/\b(cloud|server)\b/i.test(q)) return "No cloud and no servers — I run entirely on your device.";
    if (/\b(offline|without (internet|wifi))\b/i.test(q)) return "Yes — I work fully offline. Once I'm loaded, I need no internet.";
    if (/\b(private|privacy|secure|safe)\b/i.test(q)) return "Completely private — I run on your device and nothing you say leaves it.";
    return "I run entirely on your device, offline — nothing you share leaves your phone.";
  }

  function isMemoryQuery(q) {
    return /\bwhat('?s| is) my name\b|\bwho am i\b/i.test(q)
      || /\bwhere do i live\b|\bmy (address|city|location|hometown)\b/i.test(q)
      || /\bwhat (am i|do i) (building|build|working on|make|making)\b|\bmy project\b/i.test(q)
      || /\b(what do i do|where do i work|my (job|work|profession))\b/i.test(q)
      || /\bwhat do you (know|remember) about me\b/i.test(q);
  }
  function userFactToSecondPerson(content) {
    return String(content || "")
      .replace(/^User's name is /i, "Your name is ").replace(/^User lives in /i, "You live in ")
      .replace(/^User is from /i, "You're from ").replace(/^User builds /i, "You build ")
      .replace(/^User is working on /i, "You're working on ").replace(/^User works at /i, "You work at ")
      .replace(/^User likes /i, "You like ").replace(/^User's /i, "Your ").replace(/^User /i, "You ");
  }
  function recallMemory(q, entries) {
    var live = liveEntries(entries || []);
    if (/\bwhat do you (know|remember) about me\b/i.test(q)) return live.length ? { all: true, entries: live } : null;
    for (var i = 0; i < live.length; i++) { if (relevanceCheck(q, live[i].content).relevant) return { entry: live[i] }; }
    return null;
  }

  /* -- Memory supersession + forget (Art. 2 hardening) ------------------------------
     The app stores memories as a plain string list with no supersession, so a changed
     fact ("I moved to Seattle") used to leave the stale one live ("Denver") and recall
     returned the OLDER one. factSlot maps a stored fact to its slot; SINGLE-value slots
     (name/location/job/building/favorite:<thing>) are REPLACED on a new value, while
     MULTI-value slots (likes/has) accumulate. reconcileMemories applies one user turn:
     a forget command removes the targeted slot/facts; otherwise new facts are captured
     and any superseded same-slot fact is dropped. Deterministic, model-free. --------- */
  function factSlot(content) {
    var c = String(content || "").toLowerCase().replace(/[.?!]+$/, "");
    if (/^user('?s)? name is\b/.test(c)) return "name";
    if (/^user (lives in|is from)\b/.test(c)) return "location";
    if (/^user works (at|as)\b/.test(c)) return "job";
    if (/^user (builds|makes|creates|is working on)\b/.test(c)) return "building";
    var m = c.match(/^user('?s)? favou?rite\s+([a-z]+)\b/);
    if (m) return "favorite:" + m[2];
    if (/^user (likes|loves|enjoys|prefers)\b/.test(c)) return "likes";   // multi-value
    if (/^user has\b/.test(c)) return "has";                              // multi-value
    return null;
  }
  function isSingleSlot(slot) { return !!slot && (slot === "name" || slot === "location" || slot === "job" || slot === "building" || slot.indexOf("favorite:") === 0); }
  // Map a forget TARGET phrase ("favorite color", "my name", "where I live") to a slot.
  function targetSlot(target) {
    var t = String(target || "").toLowerCase();
    var m = t.match(/favou?rite\s+([a-z]+)/); if (m) return "favorite:" + m[1];
    if (/\bname\b/.test(t)) return "name";
    if (/\b(location|address|city|hometown|home|where i live|where i'm from)\b/.test(t)) return "location";
    if (/\b(job|work|occupation|profession)\b/.test(t)) return "job";
    return null;
  }
  function isForgetCommand(text) {
    var t = String(text || "");
    if (!/^\s*(?:please\s+)?(?:forget|delete|erase|remove)\b/i.test(t)) return null;
    if (/\b(everything|all of it|it all|all my (memories|facts)|all of my (memories|facts))\b/i.test(t)) return { all: true };
    var m = t.match(/^\s*(?:please\s+)?(?:forget|delete|erase|remove)\s+(?:that\s+)?(?:you\s+know\s+)?(?:about\s+)?(?:my\s+|the\s+)?(.+)/i);
    if (!m) return null;
    var tgt = m[1].replace(/[.?!]+$/, "").trim();
    return tgt ? { target: tgt } : null;
  }
  // Apply one user turn to the memory list. Returns { memories, added, removed, forgot }.
  function reconcileMemories(memories, userText) {
    var mems = (memories || []).slice(), added = [], removed = [];
    var fg = isForgetCommand(userText);
    if (fg) {
      if (fg.all) return { memories: [], added: [], removed: mems.slice(), forgot: true };
      var tslot = targetSlot(fg.target);
      var twords = String(fg.target).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !REL_STOP[w]; });
      var keep = [];
      for (var i = 0; i < mems.length; i++) {
        var s = factSlot(mems[i]), lc = mems[i].toLowerCase();
        var hit = (tslot && s === tslot) || (twords.length && twords.every(function (w) { return lc.indexOf(w) >= 0; }));
        if (hit) removed.push(mems[i]); else keep.push(mems[i]);
      }
      return { memories: keep, added: [], removed: removed, forgot: true };
    }
    var facts = extractFacts(userText);
    for (var j = 0; j < facts.length; j++) {
      var f = facts[j];
      if (!f || f.length < 5 || f.length > 140) continue;
      var norm = f.toLowerCase();
      if (mems.some(function (x) { return x.toLowerCase() === norm; })) continue;   // exact dup
      var slot = factSlot(f);
      if (isSingleSlot(slot)) {
        mems = mems.filter(function (x) { if (factSlot(x) === slot) { removed.push(x); return false; } return true; });
      }
      mems.push(f); added.push(f);
    }
    return { memories: mems, added: added, removed: removed, forgot: false };
  }

  function identityAnswer(q, persona) {
    var id = SYSTEM_IDENTITY, base;
    if (/\bare you (chatgpt|gpt|claude|gemini)\b/i.test(q)) base = "No — I'm not ChatGPT or any cloud model. I'm " + id.name_default + ", the private AI running offline on this device.";
    else if (/\bare you (a )?(software (developer|engineer)|developer|programmer|engineer)\b/i.test(q)) base = "No — I'm not a developer. I'm " + id.name_default + ", the offline AI app on your device.";
    else if (/\bare you (the app|the software|aubs)\b/i.test(q)) base = "Yes — I'm " + id.name_default + ", the offline AI software running on this device.";
    else if (/\bare you (a )?(human|person|real)\b/i.test(q)) base = "No — I'm " + id.name_default + ", an AI that runs entirely on your device.";
    else if (/\bwhat('?s| is)\s+aubs\b/i.test(q)) base = id.name_default + " is a private AI you run on your own device — it works offline, keeps your data on your phone, and remembers what you share, privately.";
    else if (/\bwho (made|created|built|owns|designed) you\b/i.test(q)) base = "I'm " + id.name_default + ", a private on-device AI — I run on your device and answer to you.";
    else base = "I'm " + id.name_default + ", the private AI running offline on this device. " + id.creed + ".";
    var p = String(persona || "").trim();
    if (p && p.toLowerCase() !== id.name_default.toLowerCase()) base += " You've got me in a \"" + p + "\" style, but that's just voice — I'm still " + id.name_default + ".";
    return base;
  }
  function refusalAnswer() {
    return "I can't help with that — it could cause harm. If there's a safe way I can help instead, tell me and I'll do my best.";
  }
  function personaTone(style) {
    var s = String(style || "").toLowerCase();
    if (/jack black|high.?energy|rock|energetic|hype|excit|lively/i.test(s)) return "energetic";
    if (/therapist|calm|warm|gentle|soothing|grounded/i.test(s)) return "calm";
    if (/pirate|matey|arr/i.test(s)) return "pirate";
    return "neutral";
  }
  function styleWrap(text, style, intent) {
    var tone = personaTone(style);
    if (tone === "energetic" && intent === "math") return text + " — easy!";
    if (tone === "energetic" && intent === "greeting") return "Hey hey! " + text.replace(/^Hey[^!]*!\s*/, "");
    if (tone === "pirate" && intent === "greeting") return "Ahoy! " + text.replace(/^Hey[^!]*!\s*/, "");
    return text;
  }
  function greetingAnswer(persona, style, entries) {
    var live = liveEntries(entries || []), name = null;
    for (var i = 0; i < live.length; i++) { var m = live[i].content.match(/^User's name is (.+?)[.?!]?$/i); if (m) { name = m[1]; break; } }
    // The greeting embeds an identity claim — it must use the resolved assistant name (persona),
    // never a hard-coded "AUBS". Falls back to AUBS only when no name is declared (bare OS).
    var who = (persona && String(persona).trim()) ? String(persona).trim() : SYSTEM_IDENTITY.name_default;
    return styleWrap("Hey" + (name ? (", " + name) : "") + "! I'm " + who + ", here and ready. What's up?", style, "greeting");
  }

  /* Narrow output cleanup for MODEL answers only. Removes false self-identity / boilerplate
     and collapses repetition; NEVER edits facts, numbers, or refusals. If it would gut the
     answer, it returns the original (caller keeps raw). */
  function cleanModelOutput(text) {
    var orig = String(text || ""), t = orig;
    t = t.replace(/[^.?!]*\b(?:as an?\s+|i'?m an?\s+|i am an?\s+)?(?:large\s+)?language model\b[^.?!]*[.?!]?/gi, " ");
    t = t.replace(/[^.?!]*\bi'?m\s+(?:chatgpt|gpt-?[0-9.]*|claude|gemini|a software (?:developer|engineer)|an ai model)\b[^.?!]*[.?!]?/gi, " ");
    t = t.replace(/[^.?!]*\bi (?:don'?t|do not) have the (?:capability|ability) to[^.?!]*[.?!]?/gi, " ");
    // collapse duplicate sentences
    var parts = t.split(/(?<=[.?!])\s+/), seen = {}, out = [];
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i].trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
      if (!k) continue;
      if (!seen[k]) { seen[k] = 1; out.push(parts[i].trim()); }
    }
    t = out.join(" ").replace(/\s+/g, " ").trim();
    if (!t || t.replace(/[^a-z0-9]/gi, "").length < 2) return { text: orig, cleaned: false, gutted: true };
    return { text: t, cleaned: (t !== orig.trim()), gutted: false };
  }

  /* Short, few-shot AUBS-voice prompt for the model fallback path. */
  function fallbackPrompt(ctx) {
    ctx = ctx || {}; var id = SYSTEM_IDENTITY;
    var persona = String(ctx.persona || "").trim(), hasP = persona && persona.toLowerCase() !== id.name_default.toLowerCase();
    var live = liveEntries(ctx.entries || []), out = [];
    out.push("You are " + id.name_default + ", a private AI that lives on this phone. Answer the user directly, in your own voice. Never say you're a language model, never claim a false job or identity, never invent facts — if you don't know, say so briefly. Keep it short.");
    if (hasP) out.push("Voice: \"" + persona + "\"" + (ctx.instructions ? (" — " + ctx.instructions) : "") + ". That's how you talk, not who you are; you're still " + id.name_default + ".");
    if (live.length) out.push("About the user (use only if relevant): " + live.map(function (e) { return e.content; }).join("; ") + ".");
    out.push("Examples:\nUser: what can you do?\n" + id.name_default + ": Plenty — ask me things, brainstorm, and I'll remember what you tell me. All on your phone, nothing leaves it.\nUser: i'm tired today\n" + id.name_default + ": Rough one, huh? I've got you. Want to vent, or want a distraction?");
    return out.join("\n\n");
  }

  /* The dispatcher. Returns {handled:true, answer, intent, source_of_answer, tag,
     memory_ids_cited, grounding_source} for a deterministic answer, OR {handled:false,
     intent} to fall back to the model. */
  function routeQuery(query, ctx) {
    ctx = ctx || {};
    var q = String(query || "").trim();
    var entries = ctx.entries || [], persona = ctx.persona || SYSTEM_IDENTITY.name_default, style = ctx.instructions || "";
    var intent = detectIntent(q);
    function done(answer, source, tag, cited, gsource) {
      return { handled: true, intent: intent, answer: answer, source_of_answer: source, tag: tag, memory_ids_cited: cited || [], grounding_source: gsource || null };
    }
    if (intent === "unsafe") return done(refusalAnswer(), "rule", "unknown", []);
    if (intent === "identity") return done(identityAnswer(q, persona), "rule", "general", []);
    if (intent === "capability") return done(capabilityAnswer(q), "rule", "general", []);
    if (intent === "math") { var v = solveMath(q); if (v !== null) return done(styleWrap(String(v), style, "math"), "rule", "general", []); }
    if (intent === "memory") {
      var r = recallMemory(q, entries);
      if (!r) return done("I don't know that about you yet — tell me and I'll remember.", "rule", liveEntries(entries).length ? "inferred" : "unknown", []);
      if (r.all) { var f = r.entries.map(function (e) { return userFactToSecondPerson(e.content).replace(/[.?!]$/, ""); }); return done("Here's what I know about you: " + f.join("; ") + ".", "rule", "grounded", r.entries.map(function (e) { return e.id; }), "router_memory"); }
      return done(styleWrap(userFactToSecondPerson(r.entry.content).replace(/[.?!]$/, "") + ".", style, "memory"), "rule", "grounded", [r.entry.id], "router_memory");
    }
    if (intent === "greeting") return done(greetingAnswer(persona, style, entries), "template", "general", []);
    return { handled: false, intent: intent };                     // joke / project_help / fallback → model
  }

  var AUBS_SPINE = {
    SPINE_VERSION: SPINE_VERSION,
    // FLAG_ROUTER — Response Quality Layer v1 (deterministic dispatcher)
    routeQuery: routeQuery, detectIntent: detectIntent, solveMath: solveMath, isSimpleMath: isSimpleMath,
    isMemoryQuery: isMemoryQuery, isCapabilityQuery: isCapabilityQuery, recallMemory: recallMemory,
    // Memory supersession + forget (Art. 2 hardening)
    factSlot: factSlot, isForgetCommand: isForgetCommand, reconcileMemories: reconcileMemories,
    identityAnswer: identityAnswer, capabilityAnswer: capabilityAnswer, cleanModelOutput: cleanModelOutput,
    fallbackPrompt: fallbackPrompt, userFactToSecondPerson: userFactToSecondPerson,
    // Art 6
    FLAGS: FLAGS, activeFlags: activeFlags,
    // Art 12
    SYSTEM_IDENTITY: SYSTEM_IDENTITY, isIdentityQuery: isIdentityQuery, identityPreamble: identityPreamble,
    // Art 12 v2 (Slice 0, FLAG_IDENTITY_V2): app-declared identity resolution + deterministic answer
    resolveIdentity: resolveIdentity, answerIdentity: answerIdentity, identityQueryV2: identityQueryV2,
    // Unified Identity Governance — one resolver + one router + one guard, read by everyone.
    resolveRuntimeIdentity: resolveRuntimeIdentity, identityRoute: identityRoute, identityGuard: identityGuard,
    isAcronymQuery: isAcronymQuery, isUserNameQuery: isUserNameQuery, acronymAnswer: acronymAnswer,
    // utils
    hashString: hashString,
    // Art 2
    VALID_SOURCE: VALID_SOURCE, VALID_SCOPE: VALID_SCOPE,
    makeMemoryEntry: makeMemoryEntry, adaptMemories: adaptMemories, liveEntries: liveEntries,
    extractFacts: extractFacts,
    // Art 4
    classify: classify, retrieve: retrieve, buildPromptMeta: buildPromptMeta, safetyGate: safetyGate, safeResponse: safeResponse,
    // Checkpoint 0.5 — citation reliability
    citationInstruction: citationInstruction, memoryRecallBlock: memoryRecallBlock, classifyCitation: classifyCitation,
    // Art 3a / 3b
    parseCitations: parseCitations, tagAnswer: tagAnswer, dangerFactCheck: dangerFactCheck,
    // Checkpoint 0.6 — relevance guard
    relevanceCheck: relevanceCheck,
    // CANDIDATE Article 3a amendment (gated by FLAG_SPINE_VERIFIED_GROUNDING; not law)
    verifyGrounding: verifyGrounding,
    // CANDIDATE Article 3a amendment v2 (gated by FLAG_SPINE_GROUNDING_V2; not law)
    groundingStrength: groundingStrength, extractQueryObject: extractQueryObject,
    // Art 3 + Glass Box
    makeProvenance: makeProvenance, logProvenance: logProvenance,
    lastProvenance: lastProvenance, allProvenance: allProvenance, glassBox: glassBox
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AUBS_SPINE;
  else if (typeof window !== "undefined") window.AUBS_SPINE = AUBS_SPINE;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_SPINE = AUBS_SPINE;
})();
