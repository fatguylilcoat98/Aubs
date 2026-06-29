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

  // Resolve a persona from an id, a partial override, or free-text custom instructions.
  // Free text is wrapped (carried as an extra directive), NOT trusted to define identity.
  function resolvePersona(input) {
    if (!input) return DEFAULT;
    if (typeof input === "string") {
      if (PERSONAS[input.toLowerCase()]) return PERSONAS[input.toLowerCase()];
      // a free-text instruction → start from default, attach as a custom directive
      return Object.assign({}, DEFAULT, { custom_directive: input });
    }
    if (input && input.id && PERSONAS[String(input.id).toLowerCase()]) {
      return Object.assign({}, PERSONAS[String(input.id).toLowerCase()], input);
    }
    return Object.assign({}, DEFAULT, input);
  }

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
    if (p.custom_directive) L.push("Style note: " + String(p.custom_directive));
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

  var API = { PERSONAS: PERSONAS, DEFAULT: DEFAULT, resolvePersona: resolvePersona, compilePersona: compilePersona, personaGuard: personaGuard };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PERSONA = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PERSONA = API;
})();
