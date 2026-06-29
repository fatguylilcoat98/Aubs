/* AUBS Persona wiring — proves the aubs-app.html integration contract for FLAG_PERSONA.
   It re-implements the app's tiny persona helpers (activePersona / compiledPersona /
   personaGuardOut) against a simulated browser window holding the real persona module, and
   asserts: OFF → no injection and output untouched (byte-identical); ON → a compiled persona
   instruction is injected and the guard strips model-identity leaks; selection resolves from
   an explicit id, a free-text directive, or the user's style note. Usage: node tests/run-persona-wire.cjs */
"use strict";
const P = require("../core/persona/persona.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// Simulated browser: the persona module is attached to window exactly as the <script> tag does.
const win = { AUBS_PERSONA: P };

// Faithful copies of the app helpers (aubs-app.html), parameterized by flag/selection/settings.
function makeApp(FLAG_PERSONA, PERSONA_SEL, S, resolvedIdentity) {
  function personaOn() { return !!(FLAG_PERSONA && win.AUBS_PERSONA && win.AUBS_PERSONA.compilePersona); }
  function activePersona() {
    if (!personaOn()) return null;
    try { const sel = PERSONA_SEL || (S && S.instructions && S.instructions.trim()) || null;
      return win.AUBS_PERSONA.resolvePersona(sel || undefined); } catch (e) { return null; }
  }
  function compiledPersona() {
    if (!personaOn()) return "";
    try { const p = activePersona(); return p ? (win.AUBS_PERSONA.compilePersona(p, (resolvedIdentity && resolvedIdentity()) || undefined) || "") : ""; } catch (e) { return ""; }
  }
  function personaGuardOut(text) {
    if (!personaOn()) return text;
    try { return win.AUBS_PERSONA.personaGuard(text, activePersona()) || text; } catch (e) { return text; }
  }
  return { personaOn, activePersona, compiledPersona, personaGuardOut };
}

const LEAK = "As an AI language model, I can't, but here's the plan.";

// ── OFF (default) — byte-identical: no injection, output untouched ────────────────────────────
{
  const app = makeApp(false, null, { instructions: "talk like a pirate" }, () => ({ assistantDisplayName: "AUBS" }));
  t("OFF: personaOn() is false", app.personaOn() === false);
  t("OFF: compiledPersona() is empty (nothing injected)", app.compiledPersona() === "");
  t("OFF: personaGuardOut is a pass-through (byte-identical output)", app.personaGuardOut(LEAK) === LEAK);
}

// ── ON, default persona ───────────────────────────────────────────────────────────────────────
{
  const app = makeApp(true, null, {}, () => ({ assistantDisplayName: "AUBS" }));
  const cp = app.compiledPersona();
  t("ON default: a compiled persona instruction IS injected", cp.length > 0 && /speaking as AUBS/.test(cp));
  t("ON default: injection carries the precedence law (safety/truth outrank persona)",
    /Safety and truth come first/.test(cp) && /never changes the FACTS/.test(cp));
  t("ON default: guard strips the model-identity leak from output", !/language model/i.test(app.personaGuardOut(LEAK)));
  t("ON default: guard never guts an answer to empty", app.personaGuardOut("As an AI language model.").length > 0);
}

// ── ON, explicit built-in selection (?persona=coach) ──────────────────────────────────────────
{
  const app = makeApp(true, "coach", {}, () => ({ assistantDisplayName: "AUBS" }));
  t("ON coach: selection resolves the coach persona", app.activePersona().id === "coach");
  t("ON coach: compiled voice reflects the coach archetype", /punchy/.test(app.compiledPersona()));
}

// ── ON, free-text selection (?persona=talk like Trump) + resolved display name ────────────────
{
  const app = makeApp(true, "talk like Trump", {}, () => ({ assistantDisplayName: "Trump" }));
  const cp = app.compiledPersona();
  t("ON free-text: uses the resolved assistant display name", /speaking as Trump/.test(cp));
  t("ON free-text: free text is carried as a style note (not trusted to define identity)",
    /Style note: talk like Trump/.test(cp) && app.activePersona().id === "aubs");
}

// ── ON, no explicit selection → falls back to the user's style note (S.instructions) ──────────
{
  const app = makeApp(true, null, { instructions: "keep it brief and kind" }, () => ({ assistantDisplayName: "AUBS" }));
  t("ON: empty selection falls back to S.instructions as the directive",
    /Style note: keep it brief and kind/.test(app.compiledPersona()));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Persona wiring: OFF byte-identical (no injection, output untouched); ON injects a deterministic, precedence-aware persona instruction and guards model-identity leaks; selection from id / free-text / style note.");
process.exit(0);
