/* AUBS Runtime Service — Unit Conversion (Class 1, self-verifiable, model 0×).
   Pure computation the runtime owns: exact, deterministic, no corpus, no citation, no hallucination.
   Proves the canonical conversions are exact (Architect's "5 miles → 8.04672 km"), temperature is
   affine, dimension mismatches and non-units fall through (null), and the registry keeps it at the
   top proof class. Usage: node tests/run-knowledge-conversions.cjs */
"use strict";
const C = require("../core/knowledge/conversions.js");
const K = require("../core/knowledge/registry.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const ans = (q) => { const r = C.respond(q); return r ? r.answer : null; };

// ── exact length (the canonical proof) ────────────────────────────────────────────────────────
t("5 miles in km → 8.04672 (exact)", ans("5 miles in km") === "5 miles = 8.04672 kilometers.");
t("how-many phrasing: 'how many km in 5 miles'", ans("how many km in 5 miles") === "5 miles = 8.04672 kilometers.");
t("convert phrasing + abbrev: 'convert 10 ft to in'", ans("convert 10 ft to in") === "10 feet = 120 inches.");
t("2 km to m → 2000", ans("2 km to m") === "2 kilometers = 2000 meters.");

// ── mass / volume ────────────────────────────────────────────────────────────────────────────
t("1 kg to lbs → 2.204623", ans("1 kg to lbs") === "1 kilograms = 2.204623 pounds.");
t("1 gallon to liters → 3.785412", ans("1 gallon to liters") === "1 gallons = 3.785412 liters.");

// ── temperature (affine, not a factor) ───────────────────────────────────────────────────────
t("100 F to C → 37.77778", ans("100 F to C") === "100 °F = 37.77778 °C.");
t("0 C to F → 32", ans("0 c to f") === "0 °C = 32 °F.");
t("100 C to K → 373.15", ans("convert 100 celsius to kelvin") === "100 °C = 373.15 K.");

// ── time / speed / data ──────────────────────────────────────────────────────────────────────
t("2 hours to minutes → 120", ans("2 hours to minutes") === "2 hours = 120 minutes.");
t("60 mph to km/h → 96.56064", ans("60 mph to km/h") === "60 mph = 96.56064 km/h.");
t("1 gb to mb → 1000", ans("1 gb to mb") === "1 gigabytes = 1000 megabytes.");

// ── boundaries: not a conversion, or incompatible dimensions → null (falls through) ───────────
t("dimension mismatch (kg to miles) → null", C.respond("5 kg to miles") === null);
t("non-units ('5 apples in a bag') → null", C.respond("5 apples in a bag") === null);
t("not a conversion ('write me a poem') → null", C.respond("write me a poem") === null);
t("no target unit ('convert 5 m') → null", C.respond("convert 5 m") === null);

// ── proof + registry ─────────────────────────────────────────────────────────────────────────
{
  const r = C.respond("5 miles in km");
  t("answer is self-verifiable, model 0×", r.proof.class === "self_verifiable" && r.proof.model_called === false);
  K.register(C.makePack());
  const rr = K.ask("5 miles in km");
  t("registry routes a conversion, model 0×, self-verifiable", rr && rr.pack === "conversions" && rr.proof.model_called === false && rr.proof.class === "self_verifiable");
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Conversion service: exact deterministic unit conversion, model 0×, self-verifiable; affine temperature; mismatches/non-units fall through.");
process.exit(0);
