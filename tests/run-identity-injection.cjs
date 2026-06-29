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
    t("Splendor: 'Who are you?' → \"I'm Splendor.\"", s.ui.text === "I'm Splendor." && s.output_text === "I'm Splendor.");
    t("Splendor: model called 0×", g.calls() === 0);
    t("Splendor: exactly ONE DecisionRecord (execution_type=identity, provider=app_declared)", s.counters.records === 1 && s.record.execution_type === "identity" && s.record.provider === "app_declared");
    t("Splendor: ledger verifies", v.ok === true && v.count === 1);
    t("Splendor: record provenance = app_declared, model_called:false, carries app_id + contract id", s.record.explanation.identity_source === "app_declared" && s.record.explanation.model_called === false && s.record.explanation.app_id === "splendor" && !!s.record.explanation.execution_contract_id);
    t("Splendor: 'Why?' says answered from app declaration, model not called", /app declaration/i.test(s.explanation) && /not called/i.test(s.explanation) && s.ui.identity && s.ui.identity.model_called === false);
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
    t("Persona guard: persona 'Zorg' does NOT override app identity → still \"I'm Splendor.\"", s.ui.text === "I'm Splendor." && !/Zorg/.test(s.ui.text) && g.calls() === 0);
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
    // and with NO app identity + flag ON, fallback is AUBS (bare OS)
    const g2 = spyGen();
    const s2 = await run("Who are you?", g2, { identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey }); // no appIdentity
    t("No app declared + flag ON: model still answers (no app identity to inject) — fallback path", g2.calls() === 1 && !s2.identity);
  }

  // ════════ Slice 0.1 — prompt injection + minimal claim guard + acronym + user-name ════════
  const SPINE = require("../spine/spine.js");
  // Acceptance 1 & 2 (reaffirmed end-to-end): who are you / what's your name → "I'm Splendor.", 0×
  {
    const g1 = spyGen(); const s1 = await run("who are you?", g1, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    const g2 = spyGen(); const s2 = await run("what's your name?", g2, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("0.1 acc#1 'who are you?' → \"I'm Splendor.\", model 0×", s1.ui.text === "I'm Splendor." && g1.calls() === 0);
    t("0.1 acc#2 'what's your name?' → \"I'm Splendor.\", model 0×", s2.ui.text === "I'm Splendor." && g2.calls() === 0);
  }
  // Acceptance 3: what's my name? → NOT assistant identity; no stored name → honest deterministic
  {
    const g = spyGen(); const s = await run("what's my name?", g, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("0.1 acc#3 'what's my name?' (none stored) → \"I don't know yet — what should I call you?\", model 0×", s.ui.text === "I don't know yet — what should I call you?" && g.calls() === 0 && s.record.explanation.identity_kind === "user_name");
    t("0.1 acc#3 NOT the assistant identity (never 'I'm Splendor'/'I'm AUBS')", !/I'm (Splendor|AUBS)\b/.test(s.ui.text));
    const g2 = spyGen(); const s2 = await run("what's my name?", g2, { appIdentity: SPLENDOR, identityV2: true, userName: "Chris", ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("0.1 acc#3 with a stored name → \"Your name is Chris.\", model 0×", s2.ui.text === "Your name is Chris." && g2.calls() === 0);
  }
  // Acceptance 4: normal turn — prompt injects Splendor (not AUBS); guard neutralizes a false claim
  {
    const leanSpl = SPINE.identityPreamble("", { lean: true, appName: "Splendor" });
    const leanOff = SPINE.identityPreamble("AUBS", { lean: true });   // flag-OFF path
    t("0.1 acc#4 prompt injection: model is told it is Splendor, not AUBS", /\bSplendor\b/.test(leanSpl) && !/\bAUBS\b/.test(leanSpl));
    t("0.1 acc#4 prompt flag-OFF byte-identical (still AUBS)", /You are AUBS/.test(leanOff));
    t("0.1 acc#4 guard: model claiming 'I'm AUBS, short for …' → 'I'm Splendor.'", SPINE.guardIdentityClaim("I'm AUBS, short for Always Under the Sun.", "Splendor") === "I'm Splendor.");
    t("0.1 acc#4 guard: invented expansion for the app name is dropped", SPINE.guardIdentityClaim("I am Splendor, short for Super Pleasant.", "Splendor") === "I'm Splendor.");
    t("0.1 acc#4 guard: ordinary text + correct claim untouched (no false positives)", SPINE.guardIdentityClaim("Hello! How can I help?", "Splendor") === "Hello! How can I help?" && SPINE.guardIdentityClaim("Hi, I'm Splendor!", "Splendor") === "Hi, I'm Splendor!" && SPINE.guardIdentityClaim("Nice to meet you, Chris.", "Splendor") === "Nice to meet you, Chris.");
  }
  // Acceptance 5: AUBS stands for what? → canonical, no invention, model 0×
  {
    const g = spyGen("AUBS stands for Advanced User Behavior System."); // model tries to invent
    const s = await run("AUBS stands for what?", g, { appIdentity: SPLENDOR, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("0.1 acc#5 'AUBS stands for what?' → \"Autonomous Unit Brain System.\", model 0×, no invention", s.ui.text === "AUBS stands for Autonomous Unit Brain System." && g.calls() === 0);
  }
  // Flag-OFF byte-identical for the NEW routes: model still answers (no deterministic hijack)
  {
    const g1 = spyGen("your name is whatever"); const s1 = await run("what's my name?", g1, { appIdentity: SPLENDOR, identityV2: false, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    const g2 = spyGen("AUBS stands for something"); const s2 = await run("AUBS stands for what?", g2, { appIdentity: SPLENDOR, identityV2: false, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("0.1 flag-OFF: user-name + acronym go to the MODEL (no deterministic route)", g1.calls() === 1 && g2.calls() === 1 && !s1.identity && !s2.identity);
  }

  // ── Execution Contract is distinct from the Provider Contract (schema sanity) ───────────
  t("Execution Contract validates against its CAC schema; missing fields fail closed", CAC.validate.validateExecutionContract({ contract_id: "x" }).valid === false);

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Slice 0: identity is app-declared + kernel-injected inside an Execution Contract; model 0× on identity turns; provider runs only inside a contract; flag-OFF unchanged.");
  process.exit(0);
})().catch(e => { console.error("identity-injection test crashed:", e); process.exit(1); });
