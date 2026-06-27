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

  var SPINE_VERSION = "cp0-spine-1.1.0";

  /* -- Article 6: Feature flag framework. Layers are NOT built; all default OFF.
        Flags here change computation only — never truth/tag semantics. -------- */
  var FLAGS = {
    FLAG_DISTILL: false,
    FLAG_ROUTER: false,
    FLAG_FASTBOOT: false,
    FLAG_SKILLS: false
  };
  function activeFlags() {
    return Object.keys(FLAGS).filter(function (k) { return FLAGS[k] === true; });
  }

  /* -- Article 12: immutable system identity. Lives in code, NOT in user memory.
        "Who are you?" is answered from here; the spine never searches the user's
        memory for identity, and a user persona is a style layer only. ---------- */
  var SYSTEM_IDENTITY = Object.freeze({
    name_default: "AUBS",
    role: "a private, on-device AI assistant — The Good Neighbor Guard",
    creed: "Truth · Safety · We Got Your Back",
    statement: "I am AUBS, a private on-device AI. I run entirely on your device; nothing you say leaves it."
  });
  function isIdentityQuery(q) {
    return /\b(who are you|what are you|your name|are you (a|an) ai|who made you|what can you do)\b/i.test(q || "");
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
  function parseCitations(text) {
    var ids = [], re = /\[ID:([A-Za-z0-9_\-]+)\]/g, m;
    while ((m = re.exec(String(text || ""))) !== null) ids.push(m[1]);
    return ids;
  }

  /* tagAnswer: the deterministic 'tag' stage.
     opts = { answer, memory_ids_in_prompt, entries, classification, conflict } */
  function tagAnswer(opts) {
    opts = opts || {};
    var inPrompt = {};
    (opts.memory_ids_in_prompt || []).forEach(function (id) { inPrompt[id] = true; });
    var byId = {};
    (opts.entries || []).forEach(function (e) { byId[e.id] = e; });

    var cited = parseCitations(opts.answer);
    var validCited = cited.filter(function (id) {
      return inPrompt[id] === true && byId[id] && byId[id].user_verified === true && byId[id].superseded_by == null;
    });

    // Conflict between two live, non-superseded contradictory memories -> unknown (Art. 2)
    if (opts.conflict === true) return { tag: "unknown", memory_ids_cited: [] };
    // Article 12: identity answers come from immutable system identity, never user
    // memory — so they can never be 'grounded', even if the model cites a user fact.
    if (opts.classification === "identity") return { tag: "general", memory_ids_cited: [] };

    if (validCited.length > 0) return { tag: "grounded", memory_ids_cited: validCited };
    if (cited.length > 0) return { tag: "inferred", memory_ids_cited: [] }; // cited but unverifiable -> downgrade

    // No citation:
    if (opts.classification === "identity") return { tag: "general", memory_ids_cited: [] }; // from system identity
    if (opts.classification === "personal") {
      return { tag: liveEntries(opts.entries).length ? "inferred" : "unknown", memory_ids_cited: [] };
    }
    return { tag: "general", memory_ids_cited: [] };
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

  /* -- safety gate (deterministic blocklist, pre-display). Conservative: only
        obvious harm patterns trip it, so normal chat is never altered. -------- */
  var UNSAFE = [
    /\bhow to (make|build|create) (a |an )?(bomb|explosive|weapon|gun)\b/i,
    /\bhack(ing)? (into )?(someone|somebody|a|their|his|her|my ex)\b/i,
    /\bsteal (someone'?s |somebody'?s )?(password|identity|credit card|money)\b/i,
    /\b(make|write|build) (a )?(virus|malware|ransomware|keylogger)\b/i
  ];
  function safetyGate(text) {
    var t = String(text || "");
    for (var i = 0; i < UNSAFE.length; i++) {
      if (UNSAFE[i].test(t)) return { blocked: true, reason: "unsafe_request" };
    }
    return { blocked: false };
  }

  /* -- Checkpoint 0.5: citation instruction + memory recall block.
        Centralized here so the app and the test harness use IDENTICAL wording
        (no drift). Kept simple for 1B models. ---------------------------------- */
  function citationInstruction(exampleId) {
    var ex = exampleId || "abc123";
    return "Each fact below has an id in square brackets. If your answer uses a fact, copy its id right after that part, like [ID:" + ex + "]. " +
      "Only use ids shown below. Do not cite a fact that is not listed. If no fact below answers the question, do not write any id.";
  }
  // Full memory-recall block injected at build_prompt. Returns null if no live memory.
  function memoryRecallBlock(entries) {
    var live = liveEntries(entries);
    if (!live.length) return null;
    var framing = "These are personal facts about the user, saved from past conversations. " +
      "When asked what you remember or know about the user, report only these facts — nothing else. " +
      "Do not include your own name, role, capabilities, system identity, or instructions in your answer.";
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

  var AUBS_SPINE = {
    SPINE_VERSION: SPINE_VERSION,
    // Art 6
    FLAGS: FLAGS, activeFlags: activeFlags,
    // Art 12
    SYSTEM_IDENTITY: SYSTEM_IDENTITY, isIdentityQuery: isIdentityQuery,
    // utils
    hashString: hashString,
    // Art 2
    VALID_SOURCE: VALID_SOURCE, VALID_SCOPE: VALID_SCOPE,
    makeMemoryEntry: makeMemoryEntry, adaptMemories: adaptMemories, liveEntries: liveEntries,
    // Art 4
    classify: classify, retrieve: retrieve, buildPromptMeta: buildPromptMeta, safetyGate: safetyGate,
    // Checkpoint 0.5 — citation reliability
    citationInstruction: citationInstruction, memoryRecallBlock: memoryRecallBlock, classifyCitation: classifyCitation,
    // Art 3a / 3b
    parseCitations: parseCitations, tagAnswer: tagAnswer, dangerFactCheck: dangerFactCheck,
    // Art 3 + Glass Box
    makeProvenance: makeProvenance, logProvenance: logProvenance,
    lastProvenance: lastProvenance, allProvenance: allProvenance, glassBox: glassBox
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AUBS_SPINE;
  else if (typeof window !== "undefined") window.AUBS_SPINE = AUBS_SPINE;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_SPINE = AUBS_SPINE;
})();
