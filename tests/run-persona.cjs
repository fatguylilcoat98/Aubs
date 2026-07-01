/* AUBS Persona System v1 — personality as owned runtime state.
   Persona is resolved deterministically, compiled into a system instruction (same in → same out),
   and a persona guard strips model-identity / "as an AI language model" leaks after generation.
   Safety/truth/governed-facts always outrank the persona (stated in the compiled instruction).
   Usage: node tests/run-persona.cjs */
"use strict";
const P = require("../core/persona/persona.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// ── resolve ───────────────────────────────────────────────────────────────────────────────
t("resolve built-in by id (coach)", P.resolvePersona("coach").id === "coach");
t("resolve unknown id → default (aubs)", P.resolvePersona("nope").id === "aubs");
t("resolve free-text instruction → default + custom_directive (not trusted to define identity)", (() => { const r = P.resolvePersona("talk like a pirate"); return r.id === "aubs" && r.custom_directive === "talk like a pirate"; })());
t("resolve partial override merges onto a built-in", P.resolvePersona({ id: "friend", values: ["x"] }).archetype === "easygoing-supportive-friend");

// ── compile is deterministic + carries the precedence law ───────────────────────────────────
{
  const a = P.compilePersona(P.PERSONAS.coach);
  const b = P.compilePersona(P.PERSONAS.coach);
  t("compilePersona is deterministic (same in → same out)", a === b);
  t("compiled instruction sets the voice + boundaries", /Voice:/.test(a) && /Never cross/.test(a));
  t("compiled instruction forbids 'as an AI language model' / model identity", /as an AI language model/i.test(a) && /ChatGPT\/GPT\/Claude\/Gemini/.test(a));
  t("compiled instruction states safety/truth/facts OUTRANK persona", /Safety and truth come first/.test(a) && /never changes the FACTS/.test(a));
  // A persona is TONE only: it reads the assistant's NAME from the resolved field and ACTIVATES
  // the requested subject as a voice. When named ("Ada"), it speaks as Ada; it never renames.
  const named = P.compilePersona(P.resolvePersona("talk like Donald Trump"), { assistantName: "Ada", named: true, assistantDisplayName: "Ada" });
  t("persona reads the assistant NAME from the field (Ada) + ACTIVATES the requested subject as VOICE",
    /speaking as Ada/.test(named) && /perform the voice and manner of: Donald Trump/.test(named) && !/speaking as Donald Trump/.test(named));
  t("activation carries the honesty clause (perform style, never falsify identity)",
    /performance of STYLE, not a change of identity/.test(named) && /never claim to literally be Donald Trump/.test(named));
  // UNNAMED: the persona still shapes tone but invents NO name (AUBS is the OS, not a name).
  const unnamed = P.compilePersona(P.resolvePersona("talk like Donald Trump"), { assistantName: null, named: false, assistantDisplayName: "AUBS" });
  t("persona on an UNNAMED assistant sets tone but no name (never 'speaking as AUBS')",
    /you don't have a name yet/.test(unnamed) && !/speaking as AUBS/.test(unnamed) && /perform the voice and manner of: Donald Trump/.test(unnamed));
}

// ── PERSONA ACTIVATION ENGINE — anyone, anything (model = knowledge, runtime = activation) ─────
{
  // mode detection: named figure → impression; article role → character; trait → register
  t("detectMode: 'Donald Trump' → impression", P.detectMode("Donald Trump") === "impression");
  t("detectMode: 'a pirate' → character", P.detectMode("a pirate") === "character");
  t("detectMode: 'sarcastic and dry' → register", P.detectMode("sarcastic and dry") === "register");
  t("parseActivation strips lead-ins ('speak like a 1950s radio host' → 'a 1950s radio host')",
    P.parseActivation("speak like a 1950s radio host").subject === "a 1950s radio host");

  // a fictional/role character embodies + gets the honesty clause too
  const pirate = P.compilePersona(P.resolvePersona("act as a grizzled pirate captain"), { assistantDisplayName: "AUBS" });
  t("character: embodies the role and leans on model knowledge",
    /perform the voice and manner of: a grizzled pirate captain/.test(pirate) && /Draw on what you know about how/.test(pirate));

  // a pure tone/trait is a register directive (no false-identity risk, no impersonation clause)
  const reg = P.compilePersona(P.resolvePersona("be very sarcastic"), { assistantDisplayName: "AUBS" });
  t("register: tone directive, no impersonation/honesty clause",
    /adopt this style and tone: very sarcastic/.test(reg) && !/never claim to literally be/.test(reg));

  // activation is deterministic and ALWAYS keeps the precedence law (facts/safety outrank persona)
  const a1 = P.compilePersona(P.resolvePersona("channel Yoda"));
  const a2 = P.compilePersona(P.resolvePersona("channel Yoda"));
  t("activation is deterministic (same request → same instruction)", a1 === a2);
  t("activation still states safety/truth/facts OUTRANK the persona",
    /Safety and truth come first/.test(a1) && /never changes the FACTS/.test(a1));
  t("activatePersona() alias resolves the same as resolvePersona()",
    JSON.stringify(P.activatePersona("channel Yoda")) === JSON.stringify(P.resolvePersona("channel Yoda")));
}

// ── PERSONA COMPREHENSION (persona ⟂ knowledge): the runtime understands the words ────────────
{
  // a tiny fake dictionary stands in for the definitions pack
  const DICT = { cheerful: "Full of good spirits; merry.", anxious: "Full of mental distress or uneasiness.", vampire: "A blood-sucking ghost or reanimated body.", trump: "A wind instrument; a trumpet." };
  const define = (w) => DICT[String(w || "").toLowerCase()] || null;

  // register/trait → comprehend the trait word
  const cheer = P.comprehendPersona(P.resolvePersona("be cheerful"), define);
  t("comprehend register: 'cheerful' meaning attached from the dictionary",
    cheer.comprehension && cheer.comprehension[0].word === "cheerful" && /good spirits/.test(cheer.comprehension[0].gloss));
  t("compiled persona FOLDS the comprehension in", /What these words mean/.test(P.compilePersona(cheer)) && /cheerful — Full of good spirits/.test(P.compilePersona(cheer)));

  // character → comprehend the role noun ("vampire")
  const vamp = P.comprehendPersona(P.resolvePersona("you're a vampire"), define);
  t("comprehend character: 'vampire' meaning attached", vamp.comprehension && vamp.comprehension.some(m => m.word === "vampire" && /blood/.test(m.gloss)));

  // impression (real person) → the dictionary is NOT used (model supplies the person)
  const trump = P.comprehendPersona(P.resolvePersona("talk like Donald Trump"), define);
  t("impression: NO dictionary comprehension (avoids defining 'trump' the noun)", !trump.comprehension);
  t("personaDescriptors empty for a real-person impression", P.personaDescriptors(P.resolvePersona("talk like Donald Trump")).length === 0);

  // unknown trait → nothing invented (only what the dictionary knows is attached)
  const unknown = P.comprehendPersona(P.resolvePersona("be zorptastic"), define);
  t("unknown trait → no comprehension invented", !unknown.comprehension);

  // built-in persona → comprehends its voice tone words
  const coach = P.comprehendPersona(P.PERSONAS.coach, (w) => ({ firm: "Securely fixed; resolute." }[w] || null));
  t("built-in persona comprehends a voice-tone word", coach.comprehension && coach.comprehension[0].word === "firm");

  // AUDIT REGRESSION: a custom persona must NOT leak the DEFAULT tone words (warm/direct/plainspoken)
  t("custom persona descriptors do NOT include inherited DEFAULT tone words",
    P.personaDescriptors(P.resolvePersona("be cheerful")).join(",") === "cheerful");
  t("character descriptors are just the subject, not DEFAULT tone",
    P.personaDescriptors(P.resolvePersona("you're a vampire")).indexOf("warm") < 0);
  // AUDIT REGRESSION: a performed lowercase name ("talk like homer") is an impression → NOT dictionary-comprehended
  t("'talk like homer' → impression (not a register), so the name isn't comprehended as a common word",
    P.resolvePersona("talk like homer").mode === "impression" && P.personaDescriptors(P.resolvePersona("talk like homer")).length === 0);
}

// ── persona guard strips model-identity / AI-disclaimer leaks ────────────────────────────────
{
  t("guard strips 'As an AI language model, I ...'", !/language model/i.test(P.personaGuard("As an AI language model, I can't have feelings. But here's help.", P.DEFAULT)));
  t("guard strips \"I'm just an AI\"", !/i'?m just an ai/i.test(P.personaGuard("I'm just an AI, but sure.", P.DEFAULT)));
  t("guard strips 'I'm ChatGPT'", !/chatgpt/i.test(P.personaGuard("Hi, I'm ChatGPT, how can I help?", P.DEFAULT)));
  t("guard leaves ordinary in-character text untouched", P.personaGuard("Let's go — here's your plan.", P.PERSONAS.coach) === "Let's go — here's your plan.");
  t("guard never returns empty (keeps original if it would gut the answer)", P.personaGuard("As an AI language model.", P.DEFAULT).length > 0);
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Persona v1: structured runtime-owned personas; deterministic compile; guard strips model-identity leaks; safety/truth/facts outrank persona.");
process.exit(0);
