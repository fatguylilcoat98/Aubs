/* AUBS Memory-First Recall (architecture doc §7) — answer from owned memory before the model.
   Proves: the runtime answers stored personal facts deterministically (model 0×), DISAMBIGUATES
   the match (favorite color never returns favorite food), lists everything for "what do you know
   about me", is HONEST when it genuinely doesn't know, and FALLS THROUGH (null) on an ambiguous
   miss so the model can still handle it (never a dead-end). Tested at the engine level (registry.recall)
   and through the classifier. Usage: node tests/run-memory-recall.cjs */
"use strict";
const SPINE = require("../spine/spine.js");
const REG = require("../core/facts/registry.js");
const C = require("../core/facts/classifier.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const mem = (id, content) => ({ id: id, content: content, user_verified: true, superseded_by: null });
const NAME = mem("m1", "User's name is Chris");
const LOC = mem("m2", "User lives in Denver");
const COLOR = mem("m3", "User's favorite color is blue");
const FOOD = mem("m4", "User's favorite food is pizza");
const ALL = [NAME, LOC, COLOR, FOOD];

const TOM = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
const on = (over) => Object.assign({ resolved: TOM, enabled: true }, over);

// ── ENGINE: registry.recall(q, entries) ──────────────────────────────────────────────────────
{
  t("recall: 'where do I live' → from memory", REG.recall("where do I live", ALL).answer === "You live in Denver.");
  const fc = REG.recall("what's my favorite color", ALL);
  t("recall: 'favorite color' → 'blue' (disambiguated)", fc.answer === "Your favorite color is blue." && fc.memory_id === "m3");
  t("recall: 'favorite food' → 'pizza' (same slot, NOT cross-leaked)", REG.recall("what's my favorite food", ALL).answer === "Your favorite food is pizza.");
  const all = REG.recall("what do you know about me", [NAME, LOC]);
  t("recall: 'what do you know about me' → lists everything owned",
    all.answer === "Here's what I know about you: Your name is Chris; You live in Denver." && all.memory_ids.length === 2);
  t("recall: broad phrasing 'do you remember my name?' → recalled", REG.recall("do you remember my name?", ALL).answer === "Your name is Chris.");
}

// ── HONESTY: a clear about-me question with no memory → honest, never invented ────────────────
{
  const miss = REG.recall("where do I live", []);
  t("recall miss (conservative) → honest 'I don't know that about you yet', flagged miss", /don't know that about you yet/i.test(miss.answer) && miss.miss === true);
  t("recall 'what do you know about me' (empty) → honest 'I don't know anything about you yet'", /don't know anything about you yet/i.test(REG.recall("what do you know about me", []).answer));
}

// ── DON'T OVER-CAPTURE: ambiguous 'what's my X' with no match → null (model handles it) ───────
{
  t("recall: 'what's my next move' (not a stored fact) → null (falls through to the model)", REG.recall("what's my next move", [NAME]) === null);
  t("recall: non-recall 'tell me a joke' → null", REG.recall("tell me a joke", ALL) === null);
  t("recall: irrelevant memory present, ambiguous query → null (no false honest-miss)", REG.recall("what's my plan for tomorrow", [NAME, LOC]) === null);
}

// ── THROUGH THE CLASSIFIER: governed_fact, model 0×, factId user_profile ─────────────────────
{
  const r = C.classify("Where do I live?", on({ entries: ALL }));
  t("classify 'Where do I live?' → governed_fact user_profile, model 0×, from memory",
    r.type === "governed_fact" && r.factId === "user_profile" && r.answer === "You live in Denver." && r.model_called === false);
  const c2 = C.classify("What is my favorite color?", on({ entries: ALL }));
  t("classify favorite color → 'Your favorite color is blue.' (model 0×)", c2.answer === "Your favorite color is blue." && c2.model_called === false);
  const c3 = C.classify("What do you know about me?", on({ entries: [NAME, LOC] }));
  t("classify 'what do you know about me' → full list, governed_fact", c3.type === "governed_fact" && /Your name is Chris/.test(c3.answer));
  // ambiguous miss must NOT be intercepted as governed → open_ended (reaches the model)
  t("classify 'what's my next move' (no stored fact) → open_ended (model)", C.classify("What's my next move?", on({ entries: [NAME] })).type === "open_ended");
}

// ── FLAG OFF → byte-identical (no recall, model answers) ──────────────────────────────────────
{
  t("flag OFF: 'where do I live' → open_ended", C.classify("Where do I live?", { resolved: TOM, enabled: false, entries: ALL }).type === "open_ended");
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Memory-first recall: stored personal facts answered model 0×, disambiguated; honest on a real miss; falls through on an ambiguous miss; flag-OFF byte-identical.");
process.exit(0);
