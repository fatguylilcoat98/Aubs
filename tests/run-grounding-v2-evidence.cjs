/* AUBS Verified Grounding v2 — device-evidence / replay validation pass (candidate Art. 3a).
   Replays EVERY available grounding/citation fixture through tagAnswer under v1 (flag OFF)
   and v2 (flag ON), diffs the tag, and classifies each change:
     - precision_improvement   (false grounding prevented; v1 grounded a wrong/negated cite)
     - acceptable_downgrade    (correct citation, but the answer does NOT state the value)
     - harmful_false_downgrade (correct, value-STATING answer wrongly downgraded — must be 0)
     - unexpected_regression   (invariant break / wrong upgrade — must be 0)
   Deterministic, model-free. Exits non-zero ONLY on a harmful downgrade or unexpected
   regression, so v2's safety properties are CI-enforced even while it stays candidate-only.
   Usage: node tests/run-grounding-v2-evidence.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const S = require("../spine/spine.js");

function withV2(on, fn) { const p = S.FLAGS.FLAG_SPINE_GROUNDING_V2; S.FLAGS.FLAG_SPINE_GROUNDING_V2 = on; try { return fn(); } finally { S.FLAGS.FLAG_SPINE_GROUNDING_V2 = p; } }
function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8")); }
function entriesOf(mem) { return (mem || []).map(c => S.makeMemoryEntry(c, {})); }
function statesValue(answer, entries, query) { return entries.some(e => S.groundingStrength(answer, e, query) === "value_verified"); }

// Build the unified replay case list from every fixture family.
const CASES = [];
function add(c) { CASES.push(c); }

// (A) Relevance golden set — realistic answers + ground-truth expect_grounded.
load("golden-set.relevance.v1.json").cases.forEach(rc => {
  const ents = entriesOf(rc.memory);
  const answer = rc.answer.replace(/#(\d+)/g, (_, n) => ents[+n] ? ents[+n].id : "m_none");
  add({ id: "REL:" + rc.id, family: "relevance", query: rc.query, entries: ents, ids: ents.map(e => e.id), answer, tolerant: rc.tolerant === true, should_ground: rc.expect_grounded === true, classification: "personal" });
});

// (B) verifyGrounding fixtures, given the relevant citation so tagAnswer can judge them.
// These expose v1 grounding a NEGATED / value-absent / wrong-slot answer that v2 must catch.
(function () {
  const mem = ["User's name is Chris", "User lives in Sacramento", "User builds AI software"];
  const slot = { name: 0, location: 1, job: 2 };
  const gv = [
    { d: "name affirmative", q: "what's my name?", a: "Your name is Chris.", cite: slot.name, g: true },
    { d: "NEGATION trap", q: "what's my name?", a: "Your name is not Chris.", cite: slot.name, g: false },
    { d: "location affirmative", q: "where do I live?", a: "You live in Sacramento.", cite: slot.location, g: true },
    { d: "job affirmative", q: "what do I do?", a: "You build AI software.", cite: slot.job, g: true },
    { d: "value omitted", q: "what's my name?", a: "I do not know your name.", cite: slot.name, g: false },
    { d: "wrong-slot cite", q: "where do I live?", a: "Your name is Chris.", cite: slot.name, g: false }
  ];
  gv.forEach((c, i) => {
    const ents = entriesOf(mem);
    add({ id: "GV:" + (i + 1) + ":" + c.d, family: "verify", query: c.q, entries: ents, ids: ents.map(e => e.id), answer: c.a + " [ID:" + ents[c.cite].id + "]", tolerant: false, should_ground: c.g, classification: "personal" });
  });
})();

// (C) Citation golden set — generic synthetic answers (value-absent) + a value-STATING variant.
load("golden-set.citations.v1.json").scenarios.forEach(scn => {
  const ents = entriesOf(scn.memory); const ids = ents.map(e => e.id);
  const cls = S.classify(scn.prompt);
  const exp = (scn.expected_index != null && ents[scn.expected_index]) ? ents[scn.expected_index] : null;
  if (exp) {
    add({ id: "CIT:" + scn.id + ":correct_generic", family: "citation", query: scn.prompt, entries: ents, ids, answer: "Here is the answer. [ID:" + exp.id + "]", tolerant: false, should_ground: true, classification: cls });
    add({ id: "CIT:" + scn.id + ":correct_value", family: "citation", query: scn.prompt, entries: ents, ids, answer: scn.memory[scn.expected_index].replace(/^User('?s)?\s+/i, "Your ") + ". [ID:" + exp.id + "]", tolerant: false, should_ground: true, classification: cls });
    const other = ids.find(x => x !== exp.id);
    if (other) add({ id: "CIT:" + scn.id + ":wrong", family: "citation", query: scn.prompt, entries: ents, ids, answer: "Here is the answer. [ID:" + other + "]", tolerant: false, should_ground: false, classification: cls });
  } else if (ids.length) {
    add({ id: "CIT:" + scn.id + ":none_expected", family: "citation", query: scn.prompt, entries: ents, ids, answer: "Answer. [ID:" + ids[0] + "]", tolerant: false, should_ground: false, classification: cls });
  }
});

// (D) Adversarial same-slot + value-absent + no-query (the residual holes v2 targets).
(function () {
  const ents = entriesOf(["User's favorite color is blue", "User's favorite food is pizza"]);
  const ids = ents.map(e => e.id);
  add({ id: "ADV:same_slot_wrong", family: "adversarial", query: "what's my favorite color", entries: ents, ids, answer: "Your favorite food. [ID:" + ids[1] + "]", tolerant: false, should_ground: false, classification: "personal" });
  add({ id: "ADV:same_slot_right_value", family: "adversarial", query: "what's my favorite color", entries: ents, ids, answer: "Your favorite color is blue. [ID:" + ids[0] + "]", tolerant: false, should_ground: true, classification: "personal" });
  add({ id: "ADV:no_query", family: "adversarial", query: "", entries: ents, ids, answer: "Your favorite color is blue. [ID:" + ids[0] + "]", tolerant: false, should_ground: false, classification: "personal" });
})();

// ── Replay every case under v1 and v2, classify the diff ────────────────────────────
function judge(c, v2) { return withV2(v2, () => S.tagAnswer({ answer: c.answer, query: c.query, memory_ids_in_prompt: c.ids, entries: c.entries, classification: c.classification, tolerantFormat: c.tolerant })); }
const rows = [];
const tally = { unchanged: 0, precision_improvement: 0, acceptable_downgrade: 0, harmful_false_downgrade: 0, unexpected_regression: 0, upgraded: 0 };
let falseGroundingsPrevented = 0, validGroundingsLost = 0;

CASES.forEach(c => {
  const v1 = judge(c, false), v2 = judge(c, true);
  const g1 = v1.tag === "grounded", g2 = v2.tag === "grounded";
  const sv = statesValue(c.answer, c.entries, c.query);
  let cls;
  if (v1.tag === v2.tag) cls = "unchanged";
  else if (!g1 && g2) { cls = "unexpected_regression"; }                          // v2 must never upgrade
  else if (g1 && !g2) {
    if (!c.should_ground) { cls = "precision_improvement"; falseGroundingsPrevented++; }
    else if (sv) { cls = "harmful_false_downgrade"; validGroundingsLost++; }       // correct + states value, wrongly lost
    else { cls = "acceptable_downgrade"; validGroundingsLost++; }                   // correct but value-absent
  } else cls = "unexpected_regression";                                            // grounded<->non-grounded handled; any other tag flip on a grounded line
  // invariant guard: a no-valid-citation / identity / conflict line must never be grounded under v2
  if (g2 && (c.classification === "identity")) cls = "unexpected_regression";
  tally[cls] = (tally[cls] || 0) + 1;
  rows.push({ id: c.id, family: c.family, v1: v1.tag, v2: v2.tag, strength: v2.grounding_strength || "-", sv, should: c.should_ground, cls });
});

// ── Report ──────────────────────────────────────────────────────────────────────────
console.log("AUBS Verified Grounding v2 — Device-Evidence / Replay Validation Pass");
console.log("spine " + S.SPINE_VERSION + " · candidate FLAG_SPINE_GROUNDING_V2 (default OFF)\n");
console.log("Per-case replay (v1 = ratified 3a, v2 = candidate):");
rows.forEach(r => { if (r.cls !== "unchanged") console.log("  " + (r.cls === "precision_improvement" ? "✔ " : r.cls === "acceptable_downgrade" ? "~ " : "✖ ") + r.id + "  v1=" + r.v1 + " → v2=" + r.v2 + " [" + r.strength + "] (" + r.cls + ")"); });

const changed = rows.length - tally.unchanged;
console.log("\n=== Ratification Report ===");
console.log("Cases tested .......................... " + rows.length);
console.log("Unchanged ............................. " + tally.unchanged);
console.log("Changed ............................... " + changed);
console.log("  Upgraded (v1≠grounded → v2 grounded). " + (tally.upgraded || 0));
console.log("  Downgraded (v1 grounded → v2 not) ... " + (tally.precision_improvement + tally.acceptable_downgrade + tally.harmful_false_downgrade));
console.log("False groundings PREVENTED ............ " + falseGroundingsPrevented + "  (precision improvements)");
console.log("Valid groundings LOST ................. " + validGroundingsLost);
console.log("  - acceptable (answer value-absent) .. " + tally.acceptable_downgrade);
console.log("  - HARMFUL (value-stating, wrong) .... " + tally.harmful_false_downgrade);
console.log("Unexpected regressions ................ " + tally.unexpected_regression);

const safe = tally.harmful_false_downgrade === 0 && tally.unexpected_regression === 0 && (tally.upgraded || 0) === 0;
console.log("\nVerdict: " + (safe
  ? "SAFE — v2 prevented " + falseGroundingsPrevented + " false grounding(s); every value-stating correct grounding preserved; no regressions."
  : "UNSAFE — review harmful downgrades / regressions above."));
process.exit(safe ? 0 : 1);
