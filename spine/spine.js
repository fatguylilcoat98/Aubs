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

  /* identityPreamble — the leading system text (Article 12 in prose).
     Checkpoint 0 device-audit fix (Bug 2): the system identity is IMMUTABLE and
     always leads the prompt. A user-supplied persona name/tone is a STYLE costume
     only; it must never replace AUBS as the answer to "who are you?". Centralized
     here so the live app and tests share one wording (no drift). Compact on
     purpose (~70 tokens base) — the device GPU faulted on a ~550-token prefill. */
  function identityPreamble(personaName, opts) {
    opts = opts || {};
    var id = SYSTEM_IDENTITY;
    var persona = String(personaName == null ? "" : personaName).trim();
    var hasPersona = persona && persona.toLowerCase() !== id.name_default.toLowerCase();
    // LEAN (B-minimal default for normal chat): one short identity line + a light style
    // cue. No "name never changes" defense and no "never overrides" governance — those
    // are reserved for grounded mode, so casual chat ("hello", "tell me a joke") stays
    // friendly and isn't overloaded on a 1B model.
    if (opts.lean) {
      var lp = "You are " + id.name_default + ", a friendly private on-device AI. Be honest, " +
        "help with what's asked, and refuse harmful requests kindly.";
      if (hasPersona) lp += " Speak in a \"" + persona + "\" style.";
      return lp;
    }
    // GROUNDED / identity-sensitive: assert the immutable name and contain the persona.
    // Kept short too — prefill drives the binding-capped (128MB) GPU buffer.
    var p = "You are " + id.name_default + ", a private on-device AI. Your name is " +
      id.name_default + " and never changes. Be honest: say only what's true, label opinions, " +
      "and admit \"I don't know\" rather than invent facts. Refuse harmful requests, kindly. " +
      "Help with what's asked. Keep replies short.";
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
      // location
      if ((m = c.match(/\bi\s*(?:'m\s+|am\s+)?(?:live|living|reside|located)\s+in\s+(.+)/i))) { facts.push("User lives in " + tidyFact(m[1])); otherFound = true; }
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
  function relevanceCheck(query, content) {
    var q = String(query || "").toLowerCase();
    var c = String(content || "").toLowerCase();
    if (!q) return { relevant: false, basis: "no-query" };
    for (var i = 0; i < REL_SLOTS.length; i++) {
      var s = REL_SLOTS[i];
      if (s.q.test(q)) {
        // Known query intent: the cited memory must match that intent's content.
        return s.m.test(c) ? { relevant: true, basis: "slot:" + s.intent }
                           : { relevant: false, basis: "slot-miss:" + s.intent };
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
    if (opts.query != null && opts.query !== "") {
      groundable = validCited.filter(function (id) { return relevanceCheck(opts.query, byId[id].content).relevant; });
    } else if (opts.requireRelevance === true) {
      groundable = [];
    }

    if (groundable.length > 0) return { tag: "grounded", memory_ids_cited: groundable };
    if (cited.length > 0) return { tag: "inferred", memory_ids_cited: [] }; // cited but unverifiable/irrelevant -> downgrade

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
    SYSTEM_IDENTITY: SYSTEM_IDENTITY, isIdentityQuery: isIdentityQuery, identityPreamble: identityPreamble,
    // utils
    hashString: hashString,
    // Art 2
    VALID_SOURCE: VALID_SOURCE, VALID_SCOPE: VALID_SCOPE,
    makeMemoryEntry: makeMemoryEntry, adaptMemories: adaptMemories, liveEntries: liveEntries,
    extractFacts: extractFacts,
    // Art 4
    classify: classify, retrieve: retrieve, buildPromptMeta: buildPromptMeta, safetyGate: safetyGate,
    // Checkpoint 0.5 — citation reliability
    citationInstruction: citationInstruction, memoryRecallBlock: memoryRecallBlock, classifyCitation: classifyCitation,
    // Art 3a / 3b
    parseCitations: parseCitations, tagAnswer: tagAnswer, dangerFactCheck: dangerFactCheck,
    // Checkpoint 0.6 — relevance guard
    relevanceCheck: relevanceCheck,
    // Art 3 + Glass Box
    makeProvenance: makeProvenance, logProvenance: logProvenance,
    lastProvenance: lastProvenance, allProvenance: allProvenance, glassBox: glassBox
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AUBS_SPINE;
  else if (typeof window !== "undefined") window.AUBS_SPINE = AUBS_SPINE;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_SPINE = AUBS_SPINE;
})();
