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
  const named = P.compilePersona(P.resolvePersona("talk like Trump"), { assistantDisplayName: "Trump" });
  t("compiled uses the resolved assistant name + carries the free-text style note", /speaking as Trump/.test(named) && /Style note: talk like Trump/.test(named));
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
