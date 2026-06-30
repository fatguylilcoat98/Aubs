/* AUBS — full governed-runtime test suite runner.
   Runs every tests/run-*.cjs as its own process and fails if ANY suite fails. The Architecture
   Independence Test runs FIRST and is treated as constitutional: if it fails, the whole run is
   marked as architecture damage. Self-contained — no network, no keys, no package.json needed.
   Usage: node tests/run-all.cjs   (exit 0 = everything green) */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const SELF = path.basename(__filename);
const CONSTITUTIONAL = "run-architecture-independence.cjs";

let files = fs.readdirSync(dir)
  .filter(f => /^run-.*\.cjs$/.test(f) && f !== SELF)
  .sort();
// Constitutional test first.
files = [CONSTITUTIONAL].filter(f => files.includes(f)).concat(files.filter(f => f !== CONSTITUTIONAL));

const results = [];
for (const f of files) {
  const isConstitutional = f === CONSTITUTIONAL;
  try {
    execFileSync(process.execPath, [path.join(dir, f)], { stdio: "ignore" });
    results.push({ f, ok: true, isConstitutional });
    console.log((isConstitutional ? "🔒 PASS " : "   PASS ") + f);
  } catch (e) {
    results.push({ f, ok: false, isConstitutional });
    console.log((isConstitutional ? "🔒 FAIL " : "   FAIL ") + f);
  }
}

const failed = results.filter(r => !r.ok);
const archDmg = failed.some(r => r.isConstitutional);
console.log("\n" + (results.length - failed.length) + "/" + results.length + " suites passed.");
if (archDmg) console.log("\n‼  ARCHITECTURE DAMAGE: the Architecture Independence Test failed — something leaked into the model.");
if (failed.length) { console.log("FAILED:\n" + failed.map(r => "  " + r.f).join("\n")); process.exit(1); }
console.log("All governed-runtime suites green.");
process.exit(0);
