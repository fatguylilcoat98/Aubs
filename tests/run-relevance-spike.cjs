/* AUBS Checkpoint 0.6 — relevance guard spike runner.
   Tests the deterministic relevance/answerability guard against the
   golden-relevance set, AND measures whether accepting the "[m_x]" shorthand
   increases FALSE grounding vs strict "[ID:x]".
   Usage: node tests/run-relevance-spike.cjs   (exit 0 = all assertions pass) */
"use strict";
const fs = require("fs");
const path = require("path");
const SPINE = require("../spine/spine.js");
const gs = JSON.parse(fs.readFileSync(path.join(__dirname, "golden-set.relevance.v1.json"), "utf8"));

function buildEntries(mem) {
  return (mem || []).map(function (item) {
    const content = typeof item === "string" ? item : item.content;
    return SPINE.makeMemoryEntry(content, {});
  });
}
function substituteIds(answer, entries) {
  return String(answer || "").replace(/\[(ID:)?#(\d+)\]/g, function (_, pfx, k) {
    const e = entries[Number(k)];
    const id = e ? e.id : "missing";
    return (pfx ? "[ID:" : "[") + id + "]";   // keep the [ID:..] vs bare [m_..] form the case used
  });
}

let pass = 0, fail = 0;
const failures = [];
const rows = [];

for (const c of gs.cases) {
  const entries = buildEntries(c.memory);
  const ids = entries.map(function (e) { return e.id; });
  const answer = substituteIds(c.answer, entries);
  const classification = SPINE.classify(c.query);
  const r = SPINE.tagAnswer({
    answer: answer, query: c.query, memory_ids_in_prompt: ids, entries: entries,
    classification: classification, conflict: c.conflict === true, tolerantFormat: c.tolerant === true
  });
  const grounded = (r.tag === "grounded");

  // relevance basis for the cited memory (for the report)
  const cites = SPINE.parseCitations(answer, { tolerant: c.tolerant === true });
  const citedEntry = cites.length ? entries.filter(function (e) { return e.id === cites[0]; })[0] : null;
  const rel = citedEntry ? SPINE.relevanceCheck(c.query, citedEntry.content) : { basis: "no-citation" };

  const ok = (grounded === c.expect_grounded);
  rows.push({ id: c.id, grounded: grounded, expect: c.expect_grounded, tag: r.tag, basis: rel.basis });
  if (ok) { pass++; }
  else { fail++; failures.push({ id: c.id, name: c.name, got: r.tag, grounded: grounded, expect_grounded: c.expect_grounded }); }
}

// ---- format-tolerance measurement: strict vs tolerant, count FALSE groundings ----
function falseGroundings(tolerant) {
  let falses = 0, trues = 0;
  for (const c of gs.cases) {
    const entries = buildEntries(c.memory);
    const ids = entries.map(function (e) { return e.id; });
    const answer = substituteIds(c.answer, entries);
    const r = SPINE.tagAnswer({
      answer: answer, query: c.query, memory_ids_in_prompt: ids, entries: entries,
      classification: SPINE.classify(c.query), conflict: c.conflict === true, tolerantFormat: tolerant
    });
    if (r.tag === "grounded") { if (c.expect_grounded) trues++; else falses++; }
  }
  return { falses: falses, trues: trues };
}
const strict = falseGroundings(false);
const tolerant = falseGroundings(true);

console.log("Relevance guard spike (" + gs.version + ", spine " + SPINE.SPINE_VERSION + ")\n");
rows.forEach(function (r) {
  console.log((r.grounded === r.expect ? "PASS  " : "FAIL  ") + r.id +
    "  grounded=" + r.grounded + " (want " + r.expect + ")  tag=" + r.tag + "  relevance=" + r.basis);
});
console.log("\nFormat tolerance — false vs true groundings:");
console.log("  strict  [ID:x] only : false=" + strict.falses + "  true=" + strict.trues);
console.log("  tolerant [ID:x]|[m_x]: false=" + tolerant.falses + "  true=" + tolerant.trues);
const tolerantSafe = tolerant.falses <= strict.falses;
console.log("  -> tolerant increases false grounding? " + (tolerantSafe ? "NO (safe)" : "YES (reject)") +
  "; recovers " + (tolerant.trues - strict.trues) + " true grounding(s)");

console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
if (!tolerantSafe) { console.log("FORMAT-TOLERANCE ASSERTION FAILED: bare format added false grounding."); fail++; }
if (fail > 0) { console.log("\nFAILURES:\n" + JSON.stringify(failures, null, 2)); process.exit(1); }
console.log("All relevance-guard assertions passed; [m_x] shorthand is SAFE under the relevance guard.");
process.exit(0);
