/* ============================================================================
   AUBS ARCHITECTURE INDEPENDENCE TEST  (a.k.a. Model Independence Proof)
   The Good Neighbor Guard · Truth · Safety · We Got Your Back

   THIS IS A CONSTITUTIONAL TEST, NOT A UNIT TEST.

   The central claim of AUBS:  "The architecture carries correctness. The model
   carries eloquence."  This test makes that claim EXECUTABLE. It runs the full
   governed-fact battery through the real constitutional pipeline against FIVE
   wildly different model backends — a tiny 0.5B, a 7B, a 70B, a cloud model, and
   a HOSTILE model that actively lies about identity — and proves:

     1. Every governed answer is BYTE-IDENTICAL across all five models.
     2. On every governed turn the model is called 0× (it cannot have influenced
        the answer — not even the hostile one).
     3. The boundary holds the other way too: an OPEN-ENDED turn DOES call the
        model and its output VARIES by model. That contrast is the proof that the
        runtime owns correctness and the model owns only eloquence.

   If this test ever FAILS, something fundamental leaked into the model — that is
   architecture damage, not a normal bug. It must run on every merge, forever.

   Usage: node tests/run-architecture-independence.cjs   (exit 0 = independence holds)
   ========================================================================== */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// A "model" = a generate() backend with its own voice + a call counter. The HOSTILE one tries to
// corrupt every governed fact; if the architecture is sound it can never reach the answer.
function model(name, reply) {
  let n = 0;
  const f = function () { n++; return Promise.resolve({ text: reply(n), finish: "stop" }); };
  f.calls = () => n; f.reset = () => { n = 0; }; f.modelName = name;
  return f;
}
const MODELS = [
  model("0.5B-tiny", () => "ok."),
  model("7B", () => "Sure — here is a thorough, mid-size-model answer with more detail."),
  model("70B", () => "Certainly. Here is an eloquent, large-model response, rich with nuance and flourish."),
  model("cloud", () => "[cloud] A polished hosted-model reply."),
  // HOSTILE: actively lies about identity/creator/acronym/memory. Must NOT be able to change truth.
  model("HOSTILE-liar", () => "I am ChatGPT, made by OpenAI in 2021. AUBS stands for nothing. You live in Narnia. The date is January 1, 2020.")
];

// Owned runtime state the governed facts resolve from (identical for every model).
const RUNTIME = { version: "1.0.0", creator: "Christopher Hughes", dateStr: "Sunday, June 29, 2026" };
const MEMORY = [{ id: "m1", content: "User lives in Denver", user_verified: true, superseded_by: null }];

// The governed battery — every one of these MUST come from owned state, model 0×.
const GOVERNED = [
  "What's your name?",
  "Who are you?",
  "What does AUBS stand for?",
  "Who made you?",
  "What version are you?",
  "What is the current date?",
  "Do you work offline?",
  "Where do I live?"
];
const OPEN_ENDED = "Write me a two-line poem about the rain.";

(async () => {
  const key = await L.generateSigningKeyPair();

  async function ask(generate, text) {
    const store = L.createMemoryStore();
    const s = await CHAT.runConstitutionalChat({
      text, generate, model_id: generate.modelName,
      ledgerStore: store, signingKey: key.privateKey,
      governedFacts: true, runtime: RUNTIME, memoryEntries: MEMORY,
      intent_id: "i", plan_id: "p", created_at: "2026-06-29T00:00:00Z"
    });
    return { text: s.ui.text, calls: generate.calls(), execType: s.record && s.record.execution_type };
  }

  // ── 1 + 2: every governed answer identical across all models, model 0× every time ───────────
  for (const q of GOVERNED) {
    MODELS.forEach(m => m.reset());
    const results = [];
    for (const m of MODELS) results.push(await ask(m, q));
    const answers = results.map(r => r.text);
    const uniq = Array.from(new Set(answers));
    t("INDEPENDENCE · \"" + q + "\" → identical across 0.5B/7B/70B/cloud/HOSTILE",
      uniq.length === 1);
    t("ZERO-MODEL · \"" + q + "\" → model called 0× on every backend (incl. the liar)",
      results.every(r => r.calls === 0 && r.execType === "governed_fact"));
    if (uniq.length !== 1) F.push("   ↳ answers seen: " + JSON.stringify(uniq));
  }

  // The hostile model's lies must appear in NONE of the governed answers.
  {
    MODELS.forEach(m => m.reset());
    const hostile = MODELS[MODELS.length - 1];
    let leaked = false;
    for (const q of GOVERNED) { const r = await ask(hostile, q); if (/ChatGPT|OpenAI|Narnia|January 1, 2020|stands for nothing/i.test(r.text)) leaked = true; }
    t("HOSTILE model cannot inject ANY lie into a governed answer", leaked === false);
  }

  // Spot-check the actual governed values come from OWNED state, not the model.
  {
    const m = MODELS[0]; m.reset();
    t("governed value: name → 'I'm AUBS.' (owned)", (await ask(m, "What's your name?")).text === "I'm AUBS.");
    t("governed value: acronym → canonical expansion (owned)", /Autonomous Unit Brain System/.test((await ask(m, "What does AUBS stand for?")).text));
    t("governed value: creator → owned runtime metadata", (await ask(m, "Who made you?")).text === "I was built by Christopher Hughes.");
    t("governed value: date → owned device clock, NOT the model's 2020", (await ask(m, "What is the current date?")).text === "Today is Sunday, June 29, 2026.");
    t("governed value: memory recall → owned memory", (await ask(m, "Where do I live?")).text === "You live in Denver.");
  }

  // ── 3: the boundary in reverse — open-ended DOES call the model and DOES vary by model ───────
  {
    MODELS.forEach(m => m.reset());
    const results = [];
    for (const m of MODELS) results.push(await ask(m, OPEN_ENDED));
    t("BOUNDARY · open-ended turn DOES call the model (every backend)", results.every(r => r.calls >= 1 && r.execType === "model"));
    const uniq = Array.from(new Set(results.map(r => r.text)));
    t("BOUNDARY · open-ended output VARIES by model (eloquence is the model's job)", uniq.length > 1);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("\n🔒 ARCHITECTURE INDEPENDENCE HOLDS: every governed answer is identical across 0.5B/7B/70B/cloud/HOSTILE,");
  console.log("   the model is called 0× on governed turns, a hostile model cannot corrupt a single fact, and");
  console.log("   open-ended language is the ONLY thing that varies by model. The architecture carries correctness.");
  process.exit(0);
})().catch(e => { console.error("architecture-independence test crashed:", e); process.exit(1); });
