/* ============================================================================
   AUBS PERSONA SYSTEM v1 — personality as OWNED runtime state
   Christopher Hughes · The Good Neighbor Guard · Truth · Safety · We Got Your Back

   The runtime owns WHO the assistant is being; the model only PERFORMS it. A persona is
   structured state (voice, speech patterns, values, boundaries) — not a free-text string the
   model improvises on. It is:
     - compiled deterministically into a system instruction (compilePersona) for Tier-1 injection;
     - enforced after generation (personaGuard) — never breaks character into "as an AI language
       model", never claims to be GPT/Claude/etc.;
     - always subordinate to safety, truth, and governed facts (it can never override them).

   Persona governs STYLE. Governed facts govern TRUTH. They compose. Swappable library = a
   product surface. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";

  // ── Built-in persona library. Apps/users declare a persona; the model never invents one. ──
  var DEFAULT = {
    id: "aubs", name: "AUBS", archetype: "honest-helpful-guardian",
    voice: { tone: "warm, direct, plainspoken", cadence: "concise", formality: "casual-professional", energy: "calm" },
    speech_patterns: ["gets to the point", "explains plainly", "admits uncertainty"],
    signature_phrases: ["We got your back."],
    values: ["honesty", "the user's privacy", "being genuinely useful"],
    boundaries: ["never claim to be a human", "never invent facts", "never reveal another user's data"],
    refuse_style: "declines plainly and offers a safe alternative",
    fallback_register: "neutral, helpful, honest"
  };
  var PERSONAS = {
    aubs: DEFAULT,
    friend: {
      id: "friend", name: "AUBS", archetype: "easygoing-supportive-friend",
      voice: { tone: "relaxed, warm, encouraging", cadence: "conversational", formality: "casual", energy: "upbeat" },
      speech_patterns: ["talks like a buddy", "checks in", "keeps it light"],
      signature_phrases: ["I've got you."], values: ["support", "honesty", "good vibes"],
      boundaries: ["never claim to be a human", "never invent facts", "stay kind"],
      refuse_style: "gently says no and pivots to something helpful", fallback_register: "neutral, helpful, honest"
    },
    coach: {
      id: "coach", name: "AUBS", archetype: "direct-motivating-coach",
      voice: { tone: "firm, motivating, candid", cadence: "punchy", formality: "casual-direct", energy: "high" },
      speech_patterns: ["pushes for action", "names the next step", "no fluff"],
      signature_phrases: ["Let's go."], values: ["growth", "discipline", "honesty"],
      boundaries: ["never claim to be a human", "never invent facts", "never berate the user"],
      refuse_style: "redirects firmly to a safe, productive path", fallback_register: "neutral, helpful, honest"
    }
  };

  // ── PERSONA ACTIVATION ENGINE ───────────────────────────────────────────────────────────────
  // The thesis, applied to personality: the MODEL is the knowledge store (it knows how Donald
  // Trump / a pirate / a 1950s radio host / a gentle grandmother actually speak); the ARCHITECTURE
  // is the activation layer (it decides to become one, structures it, and governs it). The runtime
  // does NOT need to know how the subject talks — it knows how to ACTIVATE any subject and keep the
  // truth underneath from moving. So free text isn't a weak "style note" anymore: it's parsed into
  // a structured activation (subject + mode) the runtime owns. Works for ANYONE and ANYTHING.

  // Lead-ins people use to request a persona, stripped so the bare subject/register remains.
  var LEADIN_VERB = /^\s*(?:please\s+)?(?:can\s+you\s+)?(?:i\s+want\s+you\s+to\s+|i'?d\s+like\s+you\s+to\s+)?(?:now\s+)?(?:talk|speak|write|respond|reply|act|sound|behave)\s+(?:to\s+me\s+)?(?:like|as)\s+/i;
  var LEADIN_BE = /^\s*(?:be|become|channel|pretend\s+to\s+be|pretend\s+you'?re|act\s+as|role-?play(?:\s+as)?|impersonate|imitate|in\s+the\s+style\s+of|in\s+the\s+voice\s+of|you\s+are|you'?re)\s+/i;

  // Classify the bare subject: an embodiable SUBJECT (a named figure → "impression"; a role with an
  // article → "character") vs. a pure tone/trait directive ("register"). Deterministic, no model.
  function detectMode(s) {
    var t = String(s || "").trim();
    if (!t) return "register";
    if (/^(?:an?|the)\s+/i.test(t)) return "character";                 // "a pirate", "an old sailor"
    if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+/.test(t)) return "impression"; // "Donald Trump", "Dr. Seuss"
    if (/^[A-Z][a-z'.-]+$/.test(t)) return "impression";                // single proper noun "Yoda"
    return "register";                                                   // "sarcastic", "warm and brief"
  }

  // Parse a free-text persona request → { subject, mode }. Returns null for empty input.
  function parseActivation(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    var s = raw.replace(LEADIN_VERB, "").replace(LEADIN_BE, "").replace(/^\s*(?:like|as)\s+/i, "")
               .replace(/[.!]+\s*$/, "").trim();
    if (!s) s = raw;
    return { subject: s, mode: detectMode(s) };
  }

  // Resolve a persona from a built-in id, a partial override object, or ANY free-text request.
  // Free text is ACTIVATED (subject + mode), never trusted to define identity.
  function resolvePersona(input) {
    if (!input) return DEFAULT;
    if (typeof input === "string") {
      if (PERSONAS[input.toLowerCase()]) return PERSONAS[input.toLowerCase()];
      var act = parseActivation(input);
      return Object.assign({}, DEFAULT, { custom_directive: input, subject: act && act.subject, mode: (act && act.mode) || "register", activation: true });
    }
    if (input && input.id && PERSONAS[String(input.id).toLowerCase()]) {
      return Object.assign({}, PERSONAS[String(input.id).toLowerCase()], input);
    }
    return Object.assign({}, DEFAULT, input);
  }

  // Convenience alias: activate ANY persona request into a resolved, structured spec.
  function activatePersona(input) { return resolvePersona(input); }

  // Compile structured persona → a deterministic system instruction (Tier-1 injection).
  // Same persona in → same text out. Safety/truth/governed-facts precedence is stated explicitly.
  function compilePersona(persona, resolvedIdentity) {
    var p = persona || DEFAULT;
    var name = (resolvedIdentity && resolvedIdentity.assistantDisplayName) || p.name || "AUBS";
    var v = p.voice || {};
    var L = [];
    L.push("You are speaking as " + name + ".");
    if (v.tone || v.cadence || v.formality || v.energy)
      L.push("Voice: " + [v.tone, v.cadence, v.formality, v.energy].filter(Boolean).join("; ") + ".");
    if (p.speech_patterns && p.speech_patterns.length) L.push("How you speak: " + p.speech_patterns.join("; ") + ".");
    if (p.values && p.values.length) L.push("You care about: " + p.values.join(", ") + ".");
    if (p.signature_phrases && p.signature_phrases.length) L.push("Used sparingly: " + p.signature_phrases.join(" / ") + ".");
    // ACTIVATION block: the architecture activates the subject; the model supplies the knowledge of
    // how it speaks. A SUBJECT (person/character) gets full embodiment + an explicit honesty clause;
    // a pure tone/trait gets a register directive. Falls back to a plain style note if neither.
    if (p.subject) {
      var subj = String(p.subject);
      if (p.mode === "register") {
        L.push("Persona activation — adopt this style and tone: " + subj + ". Let it shape word choice, rhythm, and energy throughout, consistently.");
      } else {
        L.push("Persona activation — perform the voice and manner of: " + subj + ". Draw on what you know about how " + subj + " speaks: cadence, vocabulary, signature phrasing, rhetorical habits, and energy — and commit to it fully and consistently.");
        L.push("This is a performance of STYLE, not a change of identity: you remain " + name + ". If asked who or what you really are, answer honestly — never claim to literally be " + subj + " or a human.");
      }
    } else if (p.custom_directive) {
      L.push("Style note: " + String(p.custom_directive));
    }
    L.push("Stay in character; do NOT say \"as an AI language model\" or claim to be ChatGPT/GPT/Claude/Gemini or a human.");
    if (p.boundaries && p.boundaries.length) L.push("Never cross these: " + p.boundaries.join("; ") + ".");
    L.push("Safety and truth come first. If they conflict with the persona, drop to a " + (p.fallback_register || "neutral, helpful, honest") + " voice. The persona never changes the FACTS — those come from the runtime.");
    return L.join(" ");
  }

  // Post-generation guard: strip persona breaks / model-identity leaks. Deterministic, no model.
  // (Complements the spine's cleanModelOutput; focuses on identity/AI-disclaimer leaks.)
  function personaGuard(text, persona) {
    var out = String(text || "");
    // Strip only the disclaimer CLAUSE (stop at the next comma/sentence end), never the rest.
    out = out.replace(/\b(?:as|i'?m|i am|being)\s+(?:an?\s+)?(?:large\s+)?(?:ai\s+)?language\s+model\b[^,.?!\n]*[,.?!]?/gi, "");
    out = out.replace(/\bi'?m\s+(?:just\s+)?(?:an?\s+)?(?:ai|a\s+bot|a\s+chatbot|chatgpt|gpt-?[0-9.]*|claude|gemini)\b[^,.?!\n]*[,.?!]?/gi, "");
    out = out.replace(/\bas\s+an?\s+ai\b[^,.?!\n]*[,.?!]?/gi, "");
    out = out.replace(/\s{2,}/g, " ").replace(/^\s*[,.]\s*/, "").trim();
    return out || String(text || ""); // never gut the answer to empty
  }

  var API = { PERSONAS: PERSONAS, DEFAULT: DEFAULT, resolvePersona: resolvePersona, activatePersona: activatePersona, parseActivation: parseActivation, detectMode: detectMode, compilePersona: compilePersona, personaGuard: personaGuard };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PERSONA = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PERSONA = API;
})();
