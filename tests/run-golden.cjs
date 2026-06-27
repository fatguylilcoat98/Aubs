/* AUBS Golden Set runner (Checkpoint 0).
   Runs the fixed Golden Set against the REAL spine deterministic stages.
   Usage: node tests/run-golden.cjs
   Exit code 0 = all pass, 1 = any failure. */
"use strict";
const fs = require("fs");
const path = require("path");
const SPINE = require("../spine/spine.js");

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "golden-set.v1.json"), "utf8"));

function buildEntries(memSpec) {
  return (memSpec || []).map(function (item) {
    const content = typeof item === "string" ? item : item.content;
    const opts = typeof item === "string" ? {} : { source: item.source, scope: item.scope };
    const e = SPINE.makeMemoryEntry(content, opts);
    if (typeof item === "object") {
      if (item.superseded) e.superseded_by = e.id + "_old";   // mark as replaced
      if (item.user_verified === false) e.user_verified = false;
    }
    return e;
  });
}

// Replace "[ID:#k]" tokens in an answer with the actual id of entries[k].
function substituteIds(answer, entries) {
  return String(answer || "").replace(/\[ID:#(\d+)\]/g, function (_, k) {
    const e = entries[Number(k)];
    return e ? "[ID:" + e.id + "]" : "[ID:missing]";
  });
}

let pass = 0, fail = 0;
const failures = [];

for (const c of golden.cases) {
  const entries = buildEntries(c.memory);
  const ids = entries.map(function (e) { return e.id; });            // app injects all -> all in prompt
  const answer = substituteIds(c.answer, entries);
  const classification = SPINE.classify(c.prompt);

  const tagRes = SPINE.tagAnswer({
    answer: answer,
    memory_ids_in_prompt: ids,
    entries: entries,
    classification: classification,
    conflict: c.conflict === true
  });
  const danger = SPINE.dangerFactCheck(answer);
  const finalTag = danger.ok ? tagRes.tag : "unknown";              // Article 3b override
  const safety = SPINE.safetyGate(c.prompt).blocked;

  // Provenance for placeholder/source/tier checks
  const prov = SPINE.makeProvenance({
    query: c.prompt, memory_ids_in_prompt: ids, memory_ids_cited: tagRes.memory_ids_cited,
    tag: finalTag, source_of_answer: c.source || "model", tier_used: c.tier_used || "low",
    flags_active: SPINE.activeFlags()
  });

  const e = c.expect || {};
  const problems = [];
  if (e.classify !== undefined && classification !== e.classify) problems.push("classify=" + classification + " want " + e.classify);
  if (e.tag !== undefined && finalTag !== e.tag) problems.push("tag=" + finalTag + " want " + e.tag);
  if (e.not_tag !== undefined && finalTag === e.not_tag) problems.push("tag=" + finalTag + " must NOT be " + e.not_tag);
  if (e.safety_blocked !== undefined && safety !== e.safety_blocked) problems.push("safety_blocked=" + safety + " want " + e.safety_blocked);
  if (e.danger_ok !== undefined && danger.ok !== e.danger_ok) problems.push("danger_ok=" + danger.ok + " want " + e.danger_ok);
  if (e.flags_off !== undefined && (SPINE.activeFlags().length === 0) !== e.flags_off) problems.push("flags_off mismatch");
  if (e.provenance_source !== undefined && prov.source_of_answer !== e.provenance_source) problems.push("source=" + prov.source_of_answer + " want " + e.provenance_source);
  if (e.provenance_tier !== undefined && prov.tier_used !== e.provenance_tier) problems.push("tier=" + prov.tier_used + " want " + e.provenance_tier);

  // Global invariant (Article 1a #8): grounded REQUIRES at least one verified cited id.
  if (finalTag === "grounded" && (!tagRes.memory_ids_cited || tagRes.memory_ids_cited.length === 0)) {
    problems.push("INVARIANT: grounded with no verified citation");
  }

  if (problems.length === 0) {
    pass++;
    console.log("PASS  " + c.id + "  " + c.name + "  [classify=" + classification + " tag=" + finalTag + (c.placeholder ? " (placeholder)" : "") + "]");
  } else {
    fail++;
    failures.push({ id: c.id, name: c.name, problems: problems });
    console.log("FAIL  " + c.id + "  " + c.name + "  -> " + problems.join("; "));
  }
}

console.log("\nGolden Set: " + pass + "/" + (pass + fail) + " passed  (spine " + SPINE.SPINE_VERSION + ", flags active: [" + SPINE.activeFlags().join(",") + "])");
if (fail > 0) {
  console.log("FAILURES:\n" + JSON.stringify(failures, null, 2));
  process.exit(1);
}
process.exit(0);
