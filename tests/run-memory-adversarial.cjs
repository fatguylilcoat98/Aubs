/* AUBS Memory-First — ADVERSARIAL harness (Architect Mode Priority 1).
   The job here is to TRY TO BREAK memory-first with the exact human scripts that expose it:
   cross-slot leaks, supersession ("I moved to Seattle"), forget, multi-value, and stale facts.
   It runs the REAL loop end-to-end: user statements go through SPINE.reconcileMemories (capture +
   same-slot supersession + forget), questions go through the governed-fact classifier (recall),
   exactly as the live app wires it. Usage: node tests/run-memory-adversarial.cjs */
"use strict";
const SPINE = require("../spine/spine.js");
const C = require("../core/facts/classifier.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const TOM = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });

// A faithful little "brain": holds the app's plain-string memory list and drives the same two
// runtime entry points the live app uses.
function Brain() {
  let memories = [];
  return {
    mems: () => memories.slice(),
    say(text) { const r = SPINE.reconcileMemories(memories, text); memories = r.memories; return r; },
    ask(q) {
      const entries = SPINE.adaptMemories(memories);
      const r = C.classify(q, { resolved: TOM, enabled: true, entries: entries });
      return r.type === "governed_fact" ? r.answer : "[MODEL]";
    }
  };
}

// ── Scenario 1: cross-slot must NOT leak (favorite color vs favorite food) ────────────────────
{
  const b = Brain();
  b.say("my favorite color is blue");
  b.say("my favorite food is pizza");
  t("S1 favorite food → pizza (NOT blue)", b.ask("what's my favorite food?") === "Your favorite food is pizza.");
  t("S1 favorite color → blue (NOT pizza)", b.ask("what's my favorite color?") === "Your favorite color is blue.");
}

// ── Scenario 2: SUPERSESSION — "I moved to Seattle" must overwrite Denver ─────────────────────
{
  const b = Brain();
  b.say("I live in Denver");
  t("S2 before move → Denver", b.ask("where do I live?") === "You live in Denver.");
  b.say("I moved to Seattle");
  t("S2 after move → Seattle (NOT Denver)", b.ask("where do I live?") === "You live in Seattle.");
  t("S2 only ONE location fact is stored (old one superseded)", b.mems().filter(m => SPINE.factSlot(m) === "location").length === 1);
  const about = b.ask("what do you know about me?");
  t("S2 'about me' shows Seattle, NOT stale Denver", /Seattle/.test(about) && !/Denver/.test(about));
}

// ── Scenario 3: multi-value possessions are captured and listed ───────────────────────────────
{
  const b = Brain();
  b.say("I have two dogs");
  t("S3 'about me' mentions the dogs", /two dogs/i.test(b.ask("what do you know about me?")));
  b.say("I have a sister");
  t("S3 multi-value: both possessions kept (dogs AND sister)", (() => { const a = b.ask("what do you know about me?"); return /two dogs/i.test(a) && /sister/i.test(a); })());
}

// ── Scenario 4: FORGET — removed facts must come back as "I don't know", never the old value ──
{
  const b = Brain();
  b.say("my favorite color is blue");
  t("S4 before forget → blue", b.ask("what's my favorite color?") === "Your favorite color is blue.");
  const fr = b.say("forget my favorite color");
  t("S4 forget command recognized + removed the fact", fr.forgot === true && fr.removed.length === 1);
  t("S4 after forget → honest 'I don't know', NOT blue", /don't know/i.test(b.ask("what's my favorite color?")));
  // forgetting one attribute must not nuke others
  b.say("I live in Portland");
  b.say("forget my favorite color");
  t("S4 unrelated fact survives a forget", b.ask("where do I live?") === "You live in Portland.");
}

// ── Scenario 5: forget everything ─────────────────────────────────────────────────────────────
{
  const b = Brain();
  b.say("I live in Austin"); b.say("my favorite color is green");
  b.say("forget everything");
  t("S5 forget everything → empty store", b.mems().length === 0);
  t("S5 after wipe → honest about location", /don't know/i.test(b.ask("where do I live?")));
}

// ── Scenario 6: don't OVER-capture / over-claim ──────────────────────────────────────────────
{
  const b = Brain();
  t("S6 'I'll never forget my trip' is NOT a forget command", SPINE.isForgetCommand("I'll never forget my trip") === null);
  // AUDIT REGRESSION: abstract "I have a …" is not a durable fact; concrete possessions still are
  t("S6 'I have a question' is NOT stored as a fact", SPINE.extractFacts("I have a question").length === 0);
  t("S6 'I have a sister' IS stored", SPINE.extractFacts("I have a sister").some(f => /sister/i.test(f)));
  b.say("I have a question");   // quantifier 'a' matches; tolerated as a possession but harmless
  t("S6 ambiguous 'what's my next move' (no stored fact) → model, not a false 'I don't know'", b.ask("what's my next move?") === "[MODEL]");
}

// ── Scenario 7: stale guard — a never-stored attribute answers honestly, not invented ─────────
{
  const b = Brain();
  b.say("I live in Miami");
  t("S7 unknown favorite → honest 'I don't know' (model 0×, not a guess)", /don't know/i.test(b.ask("what's my favorite color?")));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Memory-first survived adversarial scripts: cross-slot isolation, supersession, multi-value, forget (single + all), no over-capture, honest on the unknown.");
process.exit(0);
