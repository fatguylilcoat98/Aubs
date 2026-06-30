/* AUBS Runtime Service — Calculation (Class 1, self-verifiable, model 0×).
   Arithmetic is exact, so the runtime computes it — never the model. Safe evaluator (no eval),
   precedence + parentheses + unary minus + "% of", extraction from noisy questions. The headline
   repro is the device bug: a big sum that went to the 0.5B and failed. Usage: node tests/run-knowledge-calc.cjs */
"use strict";
const C = require("../core/knowledge/calc.js");
const K = require("../core/knowledge/registry.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const pack = C.makePack();
const ans = (q) => { const r = pack.respond(q); return r ? r.answer : null; };

// ── the device repro ─────────────────────────────────────────────────────────────────────────
t("DEVICE REPRO: big sum from a noisy '=y' question, exact, model 0×",
  ans("Whats 108273628+3747629=y y=X×?") === "108273628+3747629 = 112021257.");

// ── core arithmetic + precedence + parens ────────────────────────────────────────────────────
t("2 + 2 = 4", ans("what's 2 + 2") === "2 + 2 = 4.");
t("precedence: 2 + 3 * 4 = 14", ans("2 + 3 * 4") === "2 + 3 * 4 = 14.");
t("parentheses: (2 + 3) * 4 = 20", ans("calculate (2 + 3) * 4") === "(2 + 3) * 4 = 20.");
t("division: 10 / 4 = 2.5", ans("10 / 4") === "10 / 4 = 2.5.");
t("exponent: 2 ^ 10 = 1024", ans("2 ^ 10") === "2 ^ 10 = 1024.");
t("unary minus: -5 + 3 = -2", ans("-5 + 3") === "-5 + 3 = -2.");
t("commas stripped: 1,000 + 1 = 1001", ans("1,000 + 1") === "1000 + 1 = 1001.");

// ── percentages ──────────────────────────────────────────────────────────────────────────────
t("15% of 240 = 36", ans("what's 15% of 240") === "15% of 240 = 36.");
t("'percent of' phrasing", ans("20 percent of 50") === "20% of 50 = 10.");

// ── boundaries: not math / unsafe / lone number → null (falls through, never invented) ────────
t("lone number ('5') → null (not an operation)", pack.respond("what is 5") === null);
t("non-math ('write me a poem') → null", pack.respond("write me a poem") === null);
t("letters in expression rejected (no code-injection surface)", pack.respond("2 + foo()") === null);
t("division by zero → null (honest, not Infinity)", pack.respond("5 / 0") === null);
t("'is xylophone a word' (lexicon, not calc) → null", pack.respond("is xylophone a word") === null);

// ── AUDIT REGRESSION: prose with hyphenated numbers/dates/scores must NOT be parsed as math ────
t("'what happened in 1939-1945' → null (a date range, not subtraction)", pack.respond("what happened in 1939-1945") === null);
t("'the years 2020-2024' → null", pack.respond("the years 2020-2024") === null);
t("'I scored 7/10 on the test' → null (not division)", pack.respond("I scored 7/10 on the test") === null);
t("'call me at 555-1234' → null (a phone number)", pack.respond("call me at 555-1234") === null);
t("but a clean expression still works after a lead-in: 'what is 12/4' → 3", ans("what is 12/4") === "12/4 = 3.");

// ── safety: evaluate never executes arbitrary code ───────────────────────────────────────────
t("evaluate rejects non-arithmetic input", C.evaluate("process.exit(1)") === null);

// ── proof + registry ─────────────────────────────────────────────────────────────────────────
{
  const r = pack.respond("2+2");
  t("answer self-verifiable, model 0×", r.proof.class === "self_verifiable" && r.proof.model_called === false);
  K.register(pack);
  const rr = K.ask("100 + 1");
  t("registry routes a calc, model 0×, self-verifiable", rr && rr.pack === "calc" && rr.proof.model_called === false && rr.proof.class === "self_verifiable");
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Calculation service: exact arithmetic (safe evaluator, no eval), precedence/parens/unary/%, noisy-question extraction — self-verifiable, model 0×; non-math falls through.");
process.exit(0);
