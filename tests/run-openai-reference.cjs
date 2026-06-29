/* AUBS First Governed External Provider (OpenAI reference) — Milestone 8 tests.
   Proves a REAL external provider obeys the constitution with NO exceptions: it passes
   Contract → Registry → Drift Shield → GEL → Eligibility → Kernel → Ledger, is OFF unless
   a flag is enabled, records outbound metadata (never secrets), turns every failure into a
   CAC Failure (never a crash), and produces replayable evidence — all with NO real network.
   Usage: node tests/run-openai-reference.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const K = require("../core/kernel");
const P = require("../core/providers");
const REPLAY = require("../core/replay");
const EXPL = require("../core/kernel/explanation.js");
const OAI = P.openai;
const F = P.fakes;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// a bundle that ALLOWS full egress (the default bundle correctly requires re-auth for it)
const allowEgress = { bundle_id: "cloud-ok", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow-all", precedence_level: "org", effect: "allow", enabled: true, reason: "test allow egress", match: {} }] };

// fake transports — stand in for the OpenAI HTTP endpoint. NO real network.
function okTransport(text) { let calls = 0; const t = function () { calls++; return Promise.resolve({ status: 200, json: () => Promise.resolve({ model: "gpt-5", choices: [{ message: { content: text || "Hello from GPT-5." }, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 } }) }); }; t.calls = () => calls; return t; }
const status = (code, jsonBody) => () => Promise.resolve({ status: code, json: () => Promise.resolve(jsonBody || {}), text: () => Promise.resolve("") });
const malformedTransport = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ choices: [{ message: {} }] }) });   // no content
const nonJsonTransport = () => Promise.resolve({ status: 200, json: () => Promise.reject(new Error("Unexpected token < in JSON")) });
const slowTransport = () => new Promise(res => setTimeout(() => res({ status: 200, json: () => Promise.resolve({ choices: [{ message: { content: "late" } }] }) }), 60));

const cloudIntent = (text) => ({ user_text: text || "summarize the news", constraints: { local_only: false, max_egress: "full", data_classification: "public" } });

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── Opt-in: flag OFF → provider invisible (registry untouched) ──────────────────────
  let reg = P.createRegistry();
  let r0 = OAI.registerOpenAI(reg, { flagEnabled: false, apiKey: "sk-test" });
  ok("FLAG_OPENAI off → provider NOT registered (invisible)", r0.skipped === true && reg.size === 0 && !reg.has("openai"));
  ok("flag default is OFF", OAI.FLAG_OPENAI_DEFAULT === false);
  let rNoKey = OAI.registerOpenAI(reg, { flagEnabled: true });   // flag on but no key
  ok("flag on but no API key → still not registered", rNoKey.skipped === true && reg.size === 0);

  // ── Opt-in: flag ON + key → registers and passes the Provider Contract ──────────────
  reg = P.createRegistry();
  const okT = okTransport("Paris is the capital of France.");
  let rReg = OAI.registerOpenAI(reg, { flagEnabled: true, apiKey: "sk-test", model: "gpt-5", transport: okT });
  ok("flag ON + key → OpenAI registered, contract valid", rReg.ok === true && reg.has("openai") && P.drift.validateProvider(reg.get("openai")).ok === true);
  ok("adapter is cloud type with conservative caps (public-only, no streaming/tools)", reg.get("openai").provider_type === "cloud" && reg.get("openai").capabilities.data_classes_allowed.join() === "public" && reg.get("openai").capabilities.supports_streaming === false);

  // ── Full governed pipeline: GEL allow → eligible → kernel → real adapter → ledger ───
  let store = L.createMemoryStore();
  let res = await K.executeIntent(cloudIntent("capital of France?"), {}, { providerRegistry: reg, bundle: allowEgress, ledgerStore: store, signingKey: key.privateKey });
  ok("cloud request runs only AFTER GEL allow + eligibility → CAC Result", res.result && res.result.status === "ok" && res.result.provider_id === "openai" && res.result.output_text === "Paris is the capital of France.");
  ok("the adapter transport WAS called exactly once", okT.calls() === 1);
  ok("DecisionRecord carries provider metadata (id/type/model/egress/request_id/usage)",
    res.record && res.record.explanation.provider_id === "openai" && res.record.explanation.provider_type === "cloud" &&
    res.record.explanation.model_name === "gpt-5" && res.record.explanation.egress_level === "full" &&
    /^oair_/.test(res.record.explanation.request_id) && res.record.explanation.response_metadata.usage.total_tokens === 13);
  ok("NO secrets in the record (no api key / authorization anywhere)", !/sk-test|authorization|Bearer/i.test(JSON.stringify(res.record)));
  ok("Level 1 explanation: answered via a provider, data left device", res.explanation === "Answered via a provider. Data left this device.");

  // ── Honest "Why?" from recorded state (never model output) ──────────────────────────
  const why = EXPL.providerDetail(res.record);
  ok("provider 'Why?' is honest + from recorded state", /Answered using openai gpt-5/i.test(why.text) && /Local execution was not selected/.test(why.text) && /Payload classification: Public/.test(why.text) && /Data left device: Prompt only/.test(why.text) && /Memory sent: None/.test(why.text) && /Policy: Allowed/.test(why.text));

  // ── No request escapes without GEL allow (deny → transport NEVER called) ────────────
  const spyT = okTransport();
  let reg2 = P.createRegistry(); OAI.registerOpenAI(reg2, { flagEnabled: true, apiKey: "sk-test", transport: spyT });
  const denyBundle = { bundle_id: "d", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny", precedence_level: "regulatory", effect: "deny", enabled: true, reason: "no egress", match: { step_type: "model_call" } }] };
  res = await K.executeIntent(cloudIntent(), {}, { providerRegistry: reg2, bundle: denyBundle, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  ok("GEL deny → OpenAI transport NEVER called, blocked record written", spyT.calls() === 0 && res.governance.decision === "deny" && res.failure.failure_type === "policy_denied");

  // default bundle (require_reauth on full egress) also blocks before the network
  const spyT2 = okTransport();
  let reg3 = P.createRegistry(); OAI.registerOpenAI(reg3, { flagEnabled: true, apiKey: "sk-test", transport: spyT2 });
  res = await K.executeIntent(cloudIntent(), {}, { providerRegistry: reg3, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  ok("default policy requires re-auth for full egress → no network call", spyT2.calls() === 0 && res.governance.decision !== "allow");

  // sensitive data → eligibility rejects OpenAI (public-only) BEFORE any call
  const spyT3 = okTransport();
  let reg4 = P.createRegistry(); OAI.registerOpenAI(reg4, { flagEnabled: true, apiKey: "sk-test", transport: spyT3 });
  res = await K.executeIntent({ user_text: "my SSN is...", constraints: { local_only: false, max_egress: "full", data_classification: "sensitive" } }, {}, { providerRegistry: reg4, bundle: allowEgress, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  ok("sensitive data → eligibility rejects OpenAI (no call, no_eligible_provider)", spyT3.calls() === 0 && res.failure.failure_type === "no_eligible_provider");

  // ── Failure modes — ALL become CAC Failures, never crashes ──────────────────────────
  async function runWith(transport, apiKey) {
    const rg = P.createRegistry(); OAI.registerOpenAI(rg, { flagEnabled: true, apiKey: apiKey === undefined ? "sk-test" : apiKey, transport: transport, timeoutMs: 20 });
    if (!rg.has("openai")) return { skipped: true };
    return K.executeIntent(cloudIntent(), {}, { providerRegistry: rg, bundle: allowEgress, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  }
  ok("429 → CAC Failure (recoverable), no crash", (res = await runWith(status(429, { error: "rate_limited" }))).failure && res.failure.failure_type === "model_error" && res.result === null);
  ok("500 → CAC Failure (recoverable), no crash", (res = await runWith(status(500))).failure && res.failure.failure_type === "model_error");
  ok("401 (bad key) → CAC Failure (not recoverable)", (res = await runWith(status(401))).failure && res.failure.recoverable === false);
  ok("malformed JSON shape (no content) → validation_error", (res = await runWith(malformedTransport)).failure && res.failure.failure_type === "validation_error");
  ok("non-JSON body → validation_error (caught)", (res = await runWith(nonJsonTransport)).failure && res.failure.failure_type === "validation_error");
  ok("network timeout → CAC Failure (timeout)", (res = await runWith(slowTransport)).failure && res.failure.failure_type === "model_error" || res.failure.failure_type === "timeout");
  // API key missing is gated at registration (covered above); at the adapter level it is internal_error
  const noKeyAdapter = OAI.makeOpenAIAdapter({ apiKey: null, transport: okTransport() });
  const direct = await noKeyAdapter.execute({}, { intent: { user_text: "x" } });
  ok("missing API key at adapter level → internal_error (no network)", direct.ok === false && direct.failure_type === "internal_error");

  // Drift Shield catches a provider returning a malformed shape (defense in depth)
  const driftAdapter = OAI.makeOpenAIAdapter({ apiKey: "sk-test", transport: () => Promise.resolve({ status: 200, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) }) });
  driftAdapter.execute = () => Promise.resolve({ ok: true, garbage: true });   // simulate drift
  ok("Drift Shield catches a drifting OpenAI response (fails closed)", (await P.drift.runGuarded(driftAdapter, {}, {})).failure_type === "provider_drift");

  // ── Ledger verifies + every cloud execution is replayable evidence ──────────────────
  store = L.createMemoryStore();
  let regR = P.createRegistry(); OAI.registerOpenAI(regR, { flagEnabled: true, apiKey: "sk-test", transport: okTransport("cloud answer") });
  res = await K.executeIntent(cloudIntent("hello"), {}, { providerRegistry: regR, bundle: allowEgress, ledgerStore: store, signingKey: key.privateKey });
  ok("ledger verifies after a cloud execution", (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);

  const evidence = REPLAY.captureDecision(res, { policyBundle: allowEgress, registry: regR });
  let rp = await REPLAY.replay(evidence, { mode: "exact", registry: regR, publicKey: key.publicKey, ledger: await store.all() });
  ok("a cloud DecisionRecord verifies + replays → MATCH (no network)", rp.status === "MATCH");
  // replay detects provider removal WITHOUT contacting OpenAI
  rp = await REPLAY.replay(evidence, { mode: "exact", registry: P.createRegistry(), publicKey: key.publicKey, ledger: await store.all() });
  ok("replay detects provider removal (DRIFT, no network)", rp.status === "DRIFT" && rp.reasons.indexOf("provider_removed") !== -1);
  // replay detects policy change to deny
  rp = await REPLAY.replay(evidence, { mode: "current", currentPolicyBundle: denyBundle, registry: regR, publicKey: key.publicKey, ledger: await store.all() });
  ok("replay detects policy change → DRIFT(policy_changed, governance_changed)", rp.status === "DRIFT" && rp.reasons.indexOf("policy_changed") !== -1 && rp.reasons.indexOf("governance_changed") !== -1);

  // ── governed-local remains the default: a local provider + OpenAI, local-only plan ──
  let mixed = P.createRegistry(); mixed.register(F.fakeLocalOkProvider); OAI.registerOpenAI(mixed, { flagEnabled: true, apiKey: "sk-test", transport: okTransport() });
  res = await K.executeIntent({ user_text: "hi", constraints: { local_only: true, max_egress: "none", data_classification: "personal" } }, {}, { providerRegistry: mixed, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  ok("local-only plan selects the LOCAL provider; OpenAI excluded", res.result && res.result.provider_id === "fake-local-ok" && res.record.explanation.provider_type === "local");

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("OpenAI reference v0.1: a real provider obeys GEL→eligibility→ledger→replay, flag-gated, no secrets, no exceptions.");
  process.exit(0);
})().catch(e => { console.error("openai-reference test crashed:", e); process.exit(1); });
