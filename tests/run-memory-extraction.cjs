/* AUBS Checkpoint 0 device-audit — memory-extraction runner (Bug 1).
   Verifies SPINE.extractFacts captures clear self-facts (name, location, work,
   likes) and does NOT mis-capture casual "i'm <adjective/verb>" as a name.
   Usage: node tests/run-memory-extraction.cjs   (exit 0 = all assertions pass) */
"use strict";
const SPINE = require("../spine/spine.js");

// each case: { name, input, includes:[...substrings every fact-set must contain],
//              excludesName:true to assert NO "User's name is" fact is produced }
const cases = [
  // --- the two verbatim Bug-1 repros ---
  { name: "My name is Chris",            input: "My name is Chris.",              includes: ["User's name is Chris"] },
  { name: "Well hello im chris (no apostrophe, mid-sentence, lowercase)",
                                         input: "Well hello im chris",            includes: ["User's name is Chris"] },
  // --- name variants ---
  { name: "Well hello I'm Chris",        input: "Well hello I'm Chris",           includes: ["User's name is Chris"] },
  { name: "i am chris",                  input: "i am chris",                     includes: ["User's name is Chris"] },
  { name: "call me Chris",               input: "you can call me chris",           includes: ["User's name is Chris"] },
  { name: "two-token name Jack Black",   input: "i'm jack black",                 includes: ["User's name is Jack Black"] },
  // --- other fact types still work ---
  { name: "location",                    input: "I live in Sacramento",           includes: ["User lives in Sacramento"] },
  { name: "from",                        input: "I'm from Texas",                 includes: ["User is from Texas"], excludesName: true },
  { name: "builds",                      input: "I build AI software",            includes: ["User builds AI software"], excludesName: true },
  { name: "working on",                  input: "I'm working on a chat app",      includes: ["User is working on a chat app"], excludesName: true },
  { name: "likes",                       input: "I like hiking",                  includes: ["User likes hiking"], excludesName: true },
  { name: "compound: name + location",   input: "I'm Chris and I live in Reno",   includes: ["User's name is Chris", "User lives in Reno"] },
  // --- must NOT mistake mood/state for a name (the stop-list) ---
  { name: "i'm happy → no name",         input: "i'm happy today",                excludesName: true },
  { name: "i'm tired → no name",         input: "i'm tired",                      excludesName: true },
  { name: "i'm here → no name",          input: "i'm here",                       excludesName: true },
  { name: "i'm working → no name",       input: "i'm working",                    excludesName: true },
  { name: "i'm not sure → no name",      input: "i'm not sure",                   excludesName: true },
  { name: "him (no false i'm match)",    input: "i saw him yesterday",            excludesName: true },
];

let pass = 0, fail = 0;
const failures = [];

for (const c of cases) {
  const facts = SPINE.extractFacts(c.input);
  let ok = true;
  const reasons = [];
  for (const sub of (c.includes || [])) {
    if (!facts.some(f => f === sub)) { ok = false; reasons.push("missing: " + sub); }
  }
  if (c.excludesName && facts.some(f => /^User's name is/.test(f))) {
    ok = false; reasons.push("unexpected name fact");
  }
  if (ok) { pass++; console.log("PASS  " + c.name); }
  else { fail++; failures.push({ case: c.name, input: c.input, got: facts, reasons }); console.log("FAIL  " + c.name + "  got=" + JSON.stringify(facts)); }
}

console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
if (fail > 0) { console.log("\nFAILURES:\n" + JSON.stringify(failures, null, 2)); process.exit(1); }
console.log("All memory-extraction assertions passed.");
process.exit(0);
