/* AUBS Provider Adapter Framework + Drift Shield — Milestone 5 tests.
   Proves the provider boundary: a deterministic registry of VALIDATED providers,
   machine-readable capabilities, deterministic eligibility, a fail-closed Drift Shield,
   predictable fakes, and compatibility with the M3/M4 kernel adapter shape.
   Usage: node tests/run-providers.cjs   (exit 0 = all pass) */
"use strict";
const P = require("../core/providers");
const CAC = require("../core/cac");
const K = require("../core/kernel");
const L = require("../spine/ledger.js");
const F = P.fakes;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// a local-only / no-egress plan, and an egress-permitted plan, built from real CAC
function localPlan() {
  const intent = CAC.builders.buildIntent("hello", { intent_id: "i", created_at: "2026-06-29T00:00:00Z" });
  const plan = CAC.builders.buildPlan(intent, [{ step_type: "memory_read", target: "user" }, { step_type: "model_call", target: "local", egress: "none" }], { plan_id: "p", created_at: "2026-06-29T00:00:00Z" });
  return { intent, plan };
}
function egressPlan() {
  const intent = CAC.builders.buildIntent("summarize this", { intent_id: "i2", created_at: "2026-06-29T00:00:00Z", constraints: { max_egress: "full", local_only: false, data_classification: "public" } });
  const plan = CAC.builders.buildPlan(intent, [{ step_type: "model_call", target: "cloud", egress: "full" }], { plan_id: "p2", created_at: "2026-06-29T00:00:00Z" });
  return { intent, plan };
}

(async () => {
  // ── Registry: validation, dedup, deterministic order ───────────────────────────────
  let reg = P.createRegistry();
  ok("valid local provider registers", reg.register(F.fakeLocalOkProvider).ok === true && reg.has("fake-local-ok"));
  ok("duplicate provider_id is rejected", reg.register(F.fakeLocalOkProvider).ok === false);
  ok("invalid provider (not an object) rejected", reg.register(null).ok === false);
  ok("provider missing execute() rejected", reg.register({ provider_id: "x", provider_type: "local", capabilities: F.localCaps(), healthCheck: () => Promise.resolve({ ok: true }) }).ok === false);
  ok("provider missing healthCheck() rejected", reg.register({ provider_id: "y", provider_type: "local", capabilities: F.localCaps(), execute: () => Promise.resolve({ ok: true }) }).ok === false);
  ok("provider with malformed capability rejected", reg.register({ provider_id: "z", provider_type: "local", capabilities: F.localCaps({ max_egress: "teleport" }), healthCheck: () => Promise.resolve({ ok: true }), execute: () => Promise.resolve({ ok: true }) }).ok === false);
  ok("type↔capability drift rejected (local claims requires_network)", reg.register({ provider_id: "w", provider_type: "local", capabilities: F.localCaps({ requires_network: true }), healthCheck: () => Promise.resolve({ ok: true }), execute: () => Promise.resolve({ ok: true }) }).ok === false);

  // register the rest of the fakes for eligibility/health
  reg.register(F.fakeCloudOkProvider); reg.register(F.fakeUnhealthyProvider); reg.register(F.fakeLocalFailProvider);
  ok("registry order is deterministic (sorted by id, registration-order independent)", JSON.stringify(reg.ids()) === JSON.stringify(["fake-cloud-ok", "fake-local-fail", "fake-local-ok", "fake-unhealthy"]));
  ok("only validated providers are exposed (invalid ones never landed)", reg.size === 4 && !reg.has("x") && !reg.has("z"));

  // ── Capabilities are machine-readable / inspectable ────────────────────────────────
  const desc = reg.describe();
  ok("provider capabilities are inspectable (data only, no functions)", Array.isArray(desc) && desc.every(d => d.capabilities && typeof d.capabilities.max_egress === "string" && typeof d.execute === "undefined"));

  // ── Eligibility (deterministic, capability-based) ──────────────────────────────────
  const lp = localPlan();
  const staticLocal = reg.staticEligibleFor(lp.plan, lp.intent).map(p => p.provider_id);
  ok("local-only / no-egress plan EXCLUDES cloud providers", staticLocal.indexOf("fake-cloud-ok") === -1 && staticLocal.indexOf("fake-unhealthy") === -1);
  ok("local-only plan INCLUDES local providers", staticLocal.indexOf("fake-local-ok") !== -1 && staticLocal.indexOf("fake-local-fail") !== -1);

  const ep = egressPlan();
  const staticEgress = reg.staticEligibleFor(ep.plan, ep.intent).map(p => p.provider_id);
  ok("egress-permitted plan ALLOWS the cloud provider", staticEgress.indexOf("fake-cloud-ok") !== -1);
  ok("a local provider is NOT eligible for an egress-demanding plan", staticEgress.indexOf("fake-local-ok") === -1);

  // sensitive data excludes a provider that doesn't allow it (cloud allows only 'public')
  const si = CAC.builders.buildIntent("secret", { intent_id: "i3", created_at: "2026-06-29T00:00:00Z", constraints: { max_egress: "full", local_only: false, data_classification: "sensitive" } });
  const sp = CAC.builders.buildPlan(si, [{ step_type: "model_call", target: "cloud", egress: "full" }], { plan_id: "p3", created_at: "2026-06-29T00:00:00Z" });
  ok("sensitive data excludes a provider lacking that data class", reg.staticEligibleFor(sp, si).map(p => p.provider_id).indexOf("fake-cloud-ok") === -1);

  // health: unhealthy provider excluded from the live-eligibility set
  const liveLocal = (await reg.eligibleFor(lp.plan, lp.intent)).map(p => p.provider_id);
  ok("unhealthy provider is excluded from live eligibility", liveLocal.indexOf("fake-unhealthy") === -1);
  const liveEgress = (await reg.eligibleFor(ep.plan, ep.intent)).map(p => p.provider_id);
  ok("healthy cloud provider survives live eligibility for an egress plan", liveEgress.indexOf("fake-cloud-ok") !== -1);

  // disabled provider excluded
  let reg2 = P.createRegistry();
  reg2.register(Object.assign({}, F.fakeLocalOkProvider, { provider_id: "disabled-local", enabled: false }));
  ok("disabled provider is not eligible", reg2.staticEligibleFor(lp.plan, lp.intent).length === 0);

  // ── Drift Shield (fail closed) ─────────────────────────────────────────────────────
  const okResp = await P.drift.runGuarded(F.fakeLocalOkProvider, lp.plan, { intent: lp.intent });
  ok("fake local ok provider returns valid output through the shield", okResp.ok === true && typeof okResp.output_text === "string" && okResp.model_id && okResp.provider_id);
  const failResp = await P.drift.runGuarded(F.fakeLocalFailProvider, lp.plan, { intent: lp.intent });
  ok("fake local fail provider returns an explicit, well-formed failure", failResp.ok === false && failResp.failure_type === "model_error" && failResp.recoverable === true);
  const malformed = await P.drift.runGuarded(F.fakeCloudMalformedProvider, ep.plan, { intent: ep.intent });
  ok("malformed provider response FAILS CLOSED (provider_drift)", malformed.ok === false && malformed.failure_type === "provider_drift" && malformed.drift === true);
  const threw = await P.drift.runGuarded(F.fakeThrowingProvider, ep.plan, { intent: ep.intent });
  ok("a provider that THROWS is caught and converted to provider_drift", threw.ok === false && threw.failure_type === "provider_drift");
  // a provider missing a method, run through the shield, is drift (never executes)
  const noExec = await P.drift.runGuarded({ provider_id: "broken", provider_type: "local", capabilities: F.localCaps(), healthCheck: () => Promise.resolve({ ok: true }) }, lp.plan, {});
  ok("provider missing execute() fails closed at run time too", noExec.ok === false && noExec.failure_type === "provider_drift");
  ok("validateResponse rejects missing metadata; accepts a good shape", P.drift.validateResponse({ ok: true, text: "x" }).ok === false && P.drift.validateResponse({ ok: true, output_text: "x", model_id: "m", provider_id: "p" }).ok === true);

  // ── Kernel compatibility (M3/M4 ↔ M5) ──────────────────────────────────────────────
  // A registered provider plugs into kernel.executeIntent as a local adapter.
  const key = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  const adapter = P.providerToKernelAdapter(F.fakeLocalOkProvider);
  const kres = await K.executeIntent("hi from kernel", { local: adapter }, { ledgerStore: store, signingKey: key.privateKey });
  ok("a provider plugs into the kernel as a local adapter → CAC Result", kres.result && kres.result.status === "ok" && /fake local/.test(kres.result.output_text));
  ok("kernel run via provider wrote a verifiable ledger record", (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);
  // the M4 local-adapter shape ({id,run}) wraps into a valid provider and registers
  const m4Adapter = { id: "local-webllm", run: () => Promise.resolve({ ok: true, output_text: "ok", model_id: "Qwen2.5-0.5B-Instruct", provider_id: "local-webllm" }) };
  const asProvider = P.adapterToProvider(m4Adapter, { provider_id: "local-webllm", provider_type: "local" });
  let reg3 = P.createRegistry();
  ok("the M4 local adapter fits the provider contract and registers", reg3.register(asProvider).ok === true && P.drift.validateProvider(asProvider).ok === true);

  // ── No real network anywhere (static guard over the provider sources) ───────────────
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "core", "providers");
  const banned = /\bfetch\s*\(|XMLHttpRequest|require\(['"](https?|node:https?|axios|node-fetch)['"]\)|WebSocket/;
  // The framework + fakes must contain NO network primitives. The OpenAI reference adapter
  // (M8) is the ONE sanctioned network-capable file (default transport uses fetch; it is
  // injectable so tests never hit the network) — excluded from this guard by design.
  const NETWORK_ALLOWED = ["openai-adapter.js"];
  const offenders = fs.readdirSync(dir).filter(f => /\.js$/.test(f) && NETWORK_ALLOWED.indexOf(f) === -1).filter(f => banned.test(fs.readFileSync(path.join(dir, f), "utf8")));
  ok("NO network primitives in the framework/fakes (OpenAI adapter is the sole sanctioned exception)", offenders.length === 0);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Providers v0.1: validated registry, machine-readable capabilities, fail-closed Drift Shield, kernel-compatible. No cloud calls.");
  process.exit(0);
})().catch(e => { console.error("providers test crashed:", e); process.exit(1); });
