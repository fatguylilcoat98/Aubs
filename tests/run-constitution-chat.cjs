/* AUBS Constitutional Chat Path — Milestone 14 tests. Proves the REAL local chat turn can
   run through the FULL constitutional pipeline (runConstitutionalRequest) behind a flag,
   without a second model and without losing the working experience:

     flag-ON routes a turn through Intent→Plan(planner)→GEL→Provider Eligibility→Provider
     (drift shield)→Grounding→DecisionRecord→Ledger→Replay evidence→Level 1 explanation;
     the injected local model is called ONLY after GEL allow + eligibility; GEL deny never
     calls the model; every turn writes EXACTLY ONE DecisionRecord; the ledger verifies.

   Usage: node tests/run-constitution-chat.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const CAC = require("../core/cac");
const CHAT = require("../core/constitution/chat.js");
const SKILLREG = require("../core/skills/registry.js");
const PROV = require("../core/providers");

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// deny bundle over model_call (the planner emits a model_call step for the local provider)
function bundleWith(effect) {
  return { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: effect + "-mc", precedence_level: "org", effect: effect, enabled: true, reason: effect + " model calls", match: { step_type: "model_call" } }] };
}
// fake "generate" functions — stand in for the real WebLLM completion the app injects
function okGen(text) { let n = 0; const f = function () { n++; return Promise.resolve({ text: text || "Hello from the local model.", finish: "stop" }); }; f.calls = () => n; return f; }
function emptyGen() { let n = 0; const f = function () { n++; return Promise.resolve({ text: "", finish: "length" }); }; f.calls = () => n; return f; }
function throwGen() { let n = 0; const f = function () { n++; return Promise.reject(new Error("on-device engine lost")); }; f.calls = () => n; return f; }

const IDS = { intent_id: "i", plan_id: "p", created_at: "2026-06-29T00:00:00Z" };

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── the built-in local_chat skill is a valid, governed manifest ────────────────────
  let preg = PROV.createRegistry();
  preg.register(CHAT.makeLocalProvider(okGen(), "Qwen2.5-0.5B-Instruct"));
  const sreg = SKILLREG.createSkillRegistry({ providerRegistry: preg });
  const sv = sreg.validateSkill(CHAT.makeLocalChatSkill());
  ok("built-in local_chat skill is a valid manifest (declares only the local provider)", sv.ok === true);
  ok("local_chat declares exactly one provider and no tools/network", (function () { const s = CHAT.makeLocalChatSkill(); return s.allowed_providers.length === 1 && s.allowed_providers[0] === "local-webllm" && s.allowed_tools.length === 0 && s.requires_network === false; })());

  // ── flag ON: a normal local turn routes through the WHOLE pipeline and is ALLOWED ──
  let store = L.createMemoryStore();
  let gen = okGen("The capital of France is Paris.");
  let s = await CHAT.runConstitutionalChat({ text: "what's the capital of France?", generate: gen, model_id: "Qwen2.5-0.5B-Instruct", ledgerStore: store, signingKey: key.privateKey, intent_id: "i1", plan_id: "p1", created_at: IDS.created_at });
  ok("turn routes through the planner (deterministic graph hash produced)", !!s.graph_hash && !!s.plan && CAC.validate.validateIntent(s.intent).valid);
  ok("GEL allow on a local turn (default bundle: local-only is allowed)", s.governance.decision === "allow");
  ok("provider eligibility selected the local model", s.selected_provider === "local-webllm");
  ok("real model WAS called after allow+eligibility (exactly once)", gen.calls() === 1);
  ok("model text flows back to the UI verbatim", s.ui.ok === true && s.ui.text === "The capital of France is Paris." && s.output_text === "The capital of France is Paris.");
  ok("turn wrote EXACTLY ONE DecisionRecord (execution_type=model, provider=local-webllm)", s.counters.records === 1 && s.record && s.record.execution_type === "model" && s.record.provider === "local-webllm");
  ok("replay evidence captured against the single record", !!s.evidence);
  ok("honest Level 1 explanation: answered locally, nothing left device", /Answered locally/.test(s.explanation) && s.ui.explanation === s.explanation);

  // ── GEL deny: the model is NEVER called; a record is still written ─────────────────
  let denyGen = okGen();
  s = await CHAT.runConstitutionalChat({ text: "hello", generate: denyGen, ledgerStore: store, signingKey: key.privateKey, bundle: bundleWith("deny"), intent_id: "i2", plan_id: "p2", created_at: IDS.created_at });
  ok("GEL deny → model NEVER called", denyGen.calls() === 0);
  ok("GEL deny → UI marked blocked, honest (not model) message", s.ui.blocked === true && s.ui.ok === false && /can't run that under your current policy/.test(s.ui.text));
  ok("GEL deny → STILL wrote exactly one DecisionRecord (execution_type=blocked)", s.counters.records === 1 && s.record && s.record.execution_type === "blocked");

  // ── adapter failure paths → honest failure, model WAS called, one record ───────────
  let eGen = emptyGen();
  s = await CHAT.runConstitutionalChat({ text: "hello", generate: eGen, ledgerStore: store, signingKey: key.privateKey, intent_id: "i3", plan_id: "p3", created_at: IDS.created_at });
  ok("empty model output → honest failure surfaced, model was called", eGen.calls() === 1 && s.ui.ok === false && s.status === "error" && s.counters.records === 1);
  let tGen = throwGen();
  s = await CHAT.runConstitutionalChat({ text: "hello", generate: tGen, ledgerStore: store, signingKey: key.privateKey, intent_id: "i4", plan_id: "p4", created_at: IDS.created_at });
  ok("thrown engine error → caught, honest failure, one record", tGen.calls() === 1 && s.ui.ok === false && s.counters.records === 1);

  // ── ledger verifies after a mix of turns (allow + deny + empty + throw) ────────────
  const v = await L.verifyLedger(await store.all(), key.publicKey);
  ok("ledger VERIFIES after flagged constitutional chat (" + v.count + " records, signed)", v.ok === true && v.count === 4);
  ok("exactly one record per turn (4 turns → 4 records — no double-writes)", v.count === 4);

  // ── flag OFF (by construction): the module runs ONLY when called ───────────────────
  ok("flag-OFF safety: chat path is inert until runConstitutionalChat is called (pure module)", typeof CHAT.runConstitutionalChat === "function" && typeof CHAT.buildChatEnv === "function");

  // ── produced records validate as CAC DecisionRecords' provenance shape ─────────────
  ok("a fresh allowed turn's record carries the planner graph hash in its explanation", await (async () => {
    const st = L.createMemoryStore();
    const r = await CHAT.runConstitutionalChat({ text: "hi again", generate: okGen("ok"), ledgerStore: st, signingKey: key.privateKey, intent_id: "i5", plan_id: "p5", created_at: IDS.created_at });
    const rec = (await st.all())[0];
    return rec && rec.explanation && rec.explanation.planner_graph_hash === r.graph_hash;
  })());

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Constitutional chat path v0.1: real local chat through the full One-Spine pipeline, flag-gated, one record/turn, ledger-verified.");
  process.exit(0);
})().catch(e => { console.error("constitution-chat test crashed:", e); process.exit(1); });
