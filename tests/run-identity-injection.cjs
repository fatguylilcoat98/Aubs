/* AUBS Slice 0 — Identity Injection + Execution Contract tests.
   Proves the authority migration: system identity comes from the APP's declaration injected by
   the kernel inside an Execution Contract — NEVER from the model's weights. The "Advanced User"
   confabulation is removed by construction: on an identity turn the provider is called 0×.

   Behind FLAG_IDENTITY_V2 (default OFF): flag-OFF is byte-identical (the model answers identity
   as before). Usage: node tests/run-identity-injection.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const CAC = require("../core/cac");
const CHAT = require("../core/constitution/chat.js");
const PIPE = require("../core/constitution/pipeline.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const SPLENDOR = CHAT.APP_IDENTITIES.splendor;
const LYLO = CHAT.APP_IDENTITIES.lylo;
// A spy "model": counts calls and captures the Execution Contract it was handed. It also tries
// to confabulate a false identity — which must never reach the user on an identity turn.
function spyGen(text) { let n = 0, ctxSeen = null; const f = async (ctx) => { n++; ctxSeen = ctx; return { text: text || "I am AUBS which stands for Advanced User.", finish: "stop" }; }; f.calls = () => n; f.contract = () => ctxSeen && ctxSeen.execution_contract; return f; }
const NOW = "2026-06-29T00:00:00Z";
let seq = 0;
function run(textIn, gen, over) {
  seq++;
  return CHAT.runConstitutionalChat(Object.assign({ text: textIn, generate: gen, model_id: "m", intent_id: "i" + seq, plan_id: "p" + seq, created_at: NOW }, over));
}

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── 1) Splendor identity → "I'm Splendor.", model 0×, one record, ledger verifies ──────
  {
    const store = L.createMemoryStore(); const g = spyGen();
    const s = await run("Who are you?", g, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: store, signingKey: key.privateKey });
    const v = await L.verifyLedger(await store.all(), key.publicKey);
    t("Splendor: 'Who are you?' → \"I'm Splendor, running locally through AUBS.\"", s.ui.text === "I'm Splendor, running locally through AUBS." && /\bSplendor\b/.test(s.output_text) && /\bAUBS\b/.test(s.output_text));
    t("Splendor: model called 0×", g.calls() === 0);
    t("Splendor: exactly ONE DecisionRecord (execution_type=identity, provider=identity)", s.counters.records === 1 && s.record.execution_type === "identity" && s.record.provider === "identity");
    t("Splendor: ledger verifies", v.ok === true && v.count === 1);
    t("Splendor: record provenance = app source, model_called:false, carries app_id + contract id", s.record.explanation.identity_source === "app" && s.record.explanation.assistant_name_source === "app" && s.record.explanation.model_called === false && s.record.explanation.app_id === "splendor" && !!s.record.explanation.execution_contract_id);
    t("Splendor: 'Why?' says answered from declared truth, model not called", /declared truth/i.test(s.explanation) && /not called/i.test(s.explanation) && s.ui.identity && s.ui.identity.model_called === false);
  }

  // ── 2) LYLO identity → "I'm LYLO.", same machinery (apps are interchangeable) ───────────
  {
    const store = L.createMemoryStore(); const g = spyGen();
    const s = await run("what's your name?", g, { appIdentity: LYLO, identityV2: true, ledgerStore: store, signingKey: key.privateKey });
    t("LYLO: identity query → \"I'm LYLO.\", model 0×, one record", s.ui.text === "I'm LYLO." && g.calls() === 0 && s.counters.records === 1);
  }

  // ── 3) User-persona guard: a typed persona name is a costume, never the identity ────────
  {
    const g = spyGen();
    const s = await run("Who are you?", g, { appIdentity: SPLENDOR, identityV2: true, userPersonaName: "Zorg", ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Persona guard: persona 'Zorg' does NOT override app identity → still Splendor (app>user)", /^I'm Splendor\b/.test(s.ui.text) && !/Zorg/.test(s.ui.text) && g.calls() === 0);
  }

  // ── 4) Confabulation impossible: the model's "Advanced User" never reaches the user ─────
  {
    const g = spyGen("AUBS stands for Advanced User.");   // the model TRIES to confabulate
    const s = await run("Are you AUBS?", g, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Confabulation impossible: identity route never calls the model", g.calls() === 0);
    t("Confabulation impossible: invented 'Advanced User' never surfaces", !/Advanced User/i.test(s.ui.text) && s.ui.text === "I'm Splendor.");
  }

  // ── 5) Execution Contract required: a provider call without a contract fails closed ─────
  {
    let called = 0;
    const fakeReg = { runGuarded: async () => { called++; return { ok: true, output_text: "x", model_id: "m", provider_id: "p" }; } };
    const noContract = await PIPE.callProviderInContract(fakeReg, "p", { steps: [] }, null, { intent: {} });
    t("No contract → provider call refused (fail closed), provider NOT run", noContract.ok === false && noContract.failure_type === "policy_denied" && called === 0);
    const badContract = await PIPE.callProviderInContract(fakeReg, "p", { steps: [] }, { contract_id: "x" }, {});
    t("Invalid contract → also fails closed, provider NOT run", badContract.ok === false && called === 0);
    const goodC = CAC.builders.buildExecutionContract({ intent_id: "i", user_intent: "hi", app_identity: SPLENDOR, allowed_provider: "p", verdict: { decision: "allow", winning_rule: "r", policy_bundle_hash: "h" }, safety_classification: "normal", egress_boundary: "none" });
    const okCall = await PIPE.callProviderInContract(fakeReg, "p", { steps: [] }, goodC, {});
    t("Valid contract → provider IS invoked", okCall.ok === true && called === 1);
  }

  // ── 6) Normal turn: contract minted, provider receives it, response works, one record ───
  {
    const store = L.createMemoryStore(); const g = spyGen("The capital of France is Paris.");
    const s = await run("what's the capital of France?", g, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: store, signingKey: key.privateKey });
    t("Normal turn: model WAS called once and answered", g.calls() === 1 && s.ui.ok === true && /Paris/.test(s.ui.text));
    t("Normal turn: a valid Execution Contract was minted and passed to the provider", !!s.execution_contract && CAC.validate.validateExecutionContract(s.execution_contract).valid === true && !!g.contract() && g.contract().contract_id === s.execution_contract.contract_id);
    t("Normal turn: contract injects the app identity + must_not_claim_identity", g.contract().app_identity.assistant_name === "Splendor" && g.contract().output_constraints.must_not_claim_identity === true);
    t("Normal turn: exactly ONE DecisionRecord", s.counters.records === 1);
  }

  // ── 7) Flag-OFF: byte-identical to current Article 12 (the MODEL answers identity) ──────
  {
    const g = spyGen("I'm AUBS, your on-device assistant.");
    const s = await run("Who are you?", g, { appIdentity: SPLENDOR, identityV2: false, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Flag-OFF: identity query goes to the MODEL (no deterministic route), no identity record", g.calls() === 1 && !s.identity && s.record.execution_type !== "identity");
    // Unified Identity: with NO app identity + flag ON, the resolver falls back to AUBS and STILL
    // answers deterministically (model never the source) — bare-OS answer, no redundant runtime clause.
    const g2 = spyGen();
    const s2 = await run("Who are you?", g2, { identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey }); // no appIdentity
    t("No app + flag ON: resolver falls back to AUBS, deterministic 'I'm AUBS.', model 0×", g2.calls() === 0 && s2.ui.text === "I'm AUBS." && s2.identity && s2.identity.assistant_name_source === "default");
  }

  // ── Execution Contract is distinct from the Provider Contract (schema sanity) ───────────
  t("Execution Contract validates against its CAC schema; missing fields fail closed", CAC.validate.validateExecutionContract({ contract_id: "x" }).valid === false);

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Slice 0: identity is app-declared + kernel-injected inside an Execution Contract; model 0× on identity turns; provider runs only inside a contract; flag-OFF unchanged.");
  process.exit(0);
})().catch(e => { console.error("identity-injection test crashed:", e); process.exit(1); });
