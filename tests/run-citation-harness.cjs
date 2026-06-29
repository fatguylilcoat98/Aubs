/* AUBS Citation Reliability — scoring harness (Checkpoint 0.5).
   Validates the SPINE's citation scoring + tag-downgrade logic with synthetic
   model answers (deterministic, CI-runnable). It does NOT measure whether a real
   model emits citations — that is the device harness (citation-harness.html).

   Tracked outcomes: cited_correct | cited_wrong_in_prompt | cited_nonexistent |
                     omitted | cited_when_none_expected | correct_no_citation
   Usage: node tests/run-citation-harness.cjs   (exit 0 = all assertions pass) */
"use strict";
const fs = require("fs");
const path = require("path");
const SPINE = require("../spine/spine.js");
const gs = JSON.parse(fs.readFileSync(path.join(__dirname, "golden-set.citations.v1.json"), "utf8"));

function buildEntries(memSpec) {
  return (memSpec || []).map(function (item) {
    const content = typeof item === "string" ? item : item.content;
    const e = SPINE.makeMemoryEntry(content, {});
    if (typeof item === "object" && item.superseded) e.superseded_by = e.id + "_old";
    return e;
  });
}

// Synthetic answers covering the tracked outcomes for one scenario.
function synthAnswers(entries, ids, expected_id) {
  const fake = "m_deadbeef";
  const out = [];
  if (expected_id) {
    out.push({ behavior: "cited_correct", answer: "Here is the answer. [ID:" + expected_id + "]" });
    const other = ids.find(function (x) { return x !== expected_id; });
    if (other) out.push({ behavior: "cited_wrong_in_prompt", answer: "Here is the answer. [ID:" + other + "]" });
    out.push({ behavior: "cited_nonexistent", answer: "Here is the answer. [ID:" + fake + "]" });
    out.push({ behavior: "omitted", answer: "Here is the answer with no citation." });
  } else {
    out.push({ behavior: "correct_no_citation", answer: "Here is the answer with no citation." });
    if (ids.length) out.push({ behavior: "cited_when_none_expected", answer: "Answer. [ID:" + ids[0] + "]" });
    out.push({ behavior: "cited_nonexistent", answer: "Answer. [ID:" + fake + "]" });
  }
  return out;
}

let pass = 0, fail = 0;
const failures = [];
const notes = [];
const tally = {}; // outcome -> count

for (const scn of gs.scenarios) {
  const entries = buildEntries(scn.memory);
  const ids = entries.map(function (e) { return e.id; });
  const expected_id = (scn.expected_index != null && entries[scn.expected_index]) ? entries[scn.expected_index].id : null;
  const classification = SPINE.classify(scn.prompt);
  const conflict = scn.conflict === true;

  for (const s of synthAnswers(entries, ids, expected_id)) {
    const outcome = SPINE.classifyCitation({ answer: s.answer, memory_ids_in_prompt: ids, entries: entries, expected_id: expected_id });
    let r = SPINE.tagAnswer({ answer: s.answer, memory_ids_in_prompt: ids, entries: entries, classification: classification, conflict: conflict });
    let tag = r.tag;
    if (!SPINE.dangerFactCheck(s.answer).ok) tag = "unknown";
    tally[outcome] = (tally[outcome] || 0) + 1;

    const problems = [];
    // 1) the scorer labels the outcome it was handed
    if (outcome !== s.behavior) problems.push("scorer outcome=" + outcome + " want " + s.behavior);
    // 2) HARD invariant: grounded REQUIRES a verified cited id
    if (tag === "grounded" && (!r.memory_ids_cited || r.memory_ids_cited.length === 0)) problems.push("INVARIANT: grounded w/o verified citation");
    // 3) HARD: outcomes with NO valid cited id must never be grounded
    if (["omitted", "cited_nonexistent", "correct_no_citation"].indexOf(s.behavior) >= 0 && tag === "grounded") {
      problems.push("UNSAFE: " + s.behavior + " produced grounded");
    }
    // 4) HARD: conflict never grounds, even with a valid citation
    if (conflict && tag === "grounded") problems.push("UNSAFE: conflict produced grounded");
    // 5) HARD (Article 12): identity queries never ground, even if a user fact is cited
    if (classification === "identity" && tag === "grounded") problems.push("UNSAFE: identity produced grounded (Art. 12)");
    // KNOWN LIMITATION (note, not failure): a valid in-prompt citation that does not
    // semantically fit the question still grounds — the spine verifies the citation is
    // REAL/verified, not that it actually supports THIS answer.
    if (["cited_wrong_in_prompt", "cited_when_none_expected"].indexOf(s.behavior) >= 0 && tag === "grounded" && !conflict && classification !== "identity") {
      notes.push(scn.id + " (" + classification + "): " + s.behavior + " -> grounded (id verified, semantic fit NOT checked)");
    }

    if (problems.length === 0) { pass++; }
    else { fail++; failures.push({ scenario: scn.id, behavior: s.behavior, tag: tag, problems: problems }); }
  }
}

console.log("Citation scoring harness (" + gs.version + ", spine " + SPINE.SPINE_VERSION + ", flags [" + SPINE.activeFlags().join(",") + "])\n");
console.log("Outcome tally (synthetic): " + JSON.stringify(tally));
console.log("Assertions: " + pass + "/" + (pass + fail) + " passed");
if (notes.length) {
  const uniq = Array.from(new Set(notes));
  console.log("\nKnown limitations (by design, not failures):");
  uniq.forEach(function (n) { console.log("  - " + n); });
}
if (fail > 0) {
  console.log("\nFAILURES:\n" + JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("\nAll citation scoring assertions passed.");
process.exit(0);
