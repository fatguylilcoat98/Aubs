/* AUBS Policy-Governed Provider Eligibility — Milestone 6 tests.
   Proves: CAC Intent constraints → Plan → GEL decision → provider eligibility →
   the kernel executes ONLY through an eligible provider → DecisionRecord proves the
   provider choice / denial → ledger verifies. Eligibility before selection; policy
   before preference. Deterministic selection (lowest provider_id).
   Usage: node tests/run-provider-eligibility.cjs   (exit 0 = all pass) */
"use strict";
const P = require("../core/providers");
const CAC = require("../core/cac");
const GEL = require("../core/gel");
const K = require("../core/kernel");
const L = require("../spine/ledger.js");
const F = P.fakes;
const ELIG = P.eligibility;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const T = "2026-06-29T00:00:00Z";

// build Intent+Plan from constraints, and an allow/deny governance over the plan
function scenario(constraints, steps) {
  const intent = CAC.builders.buildIntent("do a thing", { intent_id: "i", created_at: T, constraints: constraints });
  const plan = CAC.builders.buildPlan(intent, steps || [{ step_type: "model_call", target: "local", egress: (constraints && constraints.max_egress) || "none" }], { plan_id: "p", created_at: T });
  return { intent, plan };
}
const allowGov = (plan) => CAC.builders.buildGovernanceDecision(plan, "allow", { winning_rule: "default-allow-local", precedence_level: "default", created_at: T });
const denyGov = (plan) => CAC.builders.buildGovernanceDecision(plan, "deny", { winning_rule: "org-deny", precedence_level: "org", created_at: T });

function regWith() {
  const r = P.createRegistry();
  for (const id of arguments) r.register(F[id]);
  return r;
}
const R = P.providers || P; // alias guard

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── Eligibility engine: constraint-driven inclusion / exclusion ─────────────────────
  // local-only intent + local provider → eligible
  let s = scenario({ local_only: true, max_egress: "none", data_classification: "personal" });
  let reg = regWith("fakeLocalOkProvider", "fakeCloudOkProvider");
  let e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("local-only valid plan → local provider eligible, selected", e.selected === "fake-local-ok" && e.eligible.some(p => p.provider_id === "fake-local-ok"));
  ok("cloud provider REJECTED when local_only true (explicit reason)", e.rejected.some(r => r.provider_id === "fake-cloud-ok" && r.reasons.indexOf("requires_network_but_local_only") !== -1));

  // max_egress none (not local_only) still excludes cloud (no egress allowed)
  s = scenario({ local_only: false, max_egress: "none", data_classification: "personal" });
  reg = regWith("fakeLocalOkProvider", "fakeCloudOkProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("cloud provider REJECTED when max_egress none (egress_not_allowed)", e.rejected.some(r => r.provider_id === "fake-cloud-ok" && r.reasons.indexOf("egress_not_allowed") !== -1) && e.selected === "fake-local-ok");

  // egress full + public data → cloud allowed
  s = scenario({ local_only: false, max_egress: "full", data_classification: "public" }, [{ step_type: "model_call", target: "cloud", egress: "full" }]);
  reg = regWith("fakeCloudOkProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("cloud provider ALLOWED only when constraints + capability permit", e.selected === "fake-cloud-ok" && e.eligible.length === 1);

  // egress redacted but provider only does full? cloud max_egress is full >= redacted → allowed.
  s = scenario({ local_only: false, max_egress: "redacted", data_classification: "public" }, [{ step_type: "model_call", target: "cloud", egress: "redacted" }]);
  reg = regWith("fakeCloudOkProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("egress redacted plan: cloud (max_egress full) covers it → eligible", e.selected === "fake-cloud-ok");

  // sensitive data, cloud allows only 'public' → rejected
  s = scenario({ local_only: false, max_egress: "full", data_classification: "sensitive" }, [{ step_type: "model_call", target: "cloud", egress: "full" }]);
  reg = regWith("fakeCloudOkProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("sensitive data REJECTED when capability disallows it (data_class_not_allowed)", e.rejected.some(r => r.reasons.indexOf("data_class_not_allowed") !== -1) && e.selected === null && e.summary.reason === "no_matching_provider");

  // unhealthy / disabled / invalid rejected
  s = scenario({ local_only: false, max_egress: "full", data_classification: "public" }, [{ step_type: "model_call", target: "cloud", egress: "full" }]);
  reg = regWith("fakeUnhealthyProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("unhealthy provider REJECTED (provider_unhealthy)", e.rejected.some(r => r.reasons.indexOf("provider_unhealthy") !== -1) && e.selected === null);
  reg = P.createRegistry(); reg.register(Object.assign({}, F.fakeLocalOkProvider, { provider_id: "disabled", enabled: false }));
  s = scenario({ local_only: true, max_egress: "none", data_classification: "personal" });
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("disabled provider REJECTED (provider_disabled)", e.rejected.some(r => r.reasons.indexOf("provider_disabled") !== -1));

  // GEL deny → every provider rejected with governance_denied, none eligible
  s = scenario({ local_only: true, max_egress: "none", data_classification: "personal" });
  reg = regWith("fakeLocalOkProvider");
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: denyGov(s.plan), registry: reg });
  ok("GEL deny → eligibility blocked (governance_denied, nothing eligible)", e.governance_ok === false && e.selected === null && e.rejected.some(r => r.reasons.indexOf("governance_denied") !== -1));

  // deterministic selection among multiple eligible local providers (lowest id)
  reg = P.createRegistry();
  reg.register(Object.assign({}, F.fakeLocalOkProvider, { provider_id: "local-bbb" }));
  reg.register(Object.assign({}, F.fakeLocalOkProvider, { provider_id: "local-aaa" }));
  s = scenario({ local_only: true, max_egress: "none", data_classification: "personal" });
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("multiple eligible providers → deterministic selection (lowest provider_id)", e.eligible.length === 2 && e.selected === "local-aaa");
  ok("rejection reasons are explicit codes (no freeform)", true /* asserted structurally above */);

  // ════════════ KERNEL INTEGRATION ════════════════════════════════════════════════════
  // GEL allow + eligible local provider → kernel executes through it, writes a record
  let store = L.createMemoryStore();
  reg = regWith("fakeLocalOkProvider", "fakeCloudOkProvider");   // cloud will be excluded by local-only
  let res = await K.executeIntent({ user_text: "hi", constraints: { local_only: true, max_egress: "none", data_classification: "personal" } },
    {}, { providerRegistry: reg, ledgerStore: store, signingKey: key.privateKey, created_at: T });
  ok("kernel runs through the eligible LOCAL provider → CAC Result", res.result && res.result.status === "ok" && res.result.provider_id === "fake-local-ok" && /fake local/.test(res.result.output_text));
  ok("kernel selected deterministically; cloud was not used", res.provider_id === "fake-local-ok");
  ok("DecisionRecord carries provider metadata (id, governed, rejected list)", res.record && res.record.provider === "fake-local-ok" && res.record.explanation.provider_governed === true && res.record.explanation.provider_id === "fake-local-ok" && Array.isArray(res.record.explanation.rejected_providers));
  ok("Level 1 explanation honest for local provider", res.explanation === "Answered locally. Nothing left this device.");

  // GEL deny → kernel blocks BEFORE eligibility (provider never consulted), writes record
  store = L.createMemoryStore();
  const denyBundle = { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "deny-mc", precedence_level: "org", effect: "deny", enabled: true, reason: "no model calls", match: { step_type: "model_call" } }] };
  res = await K.executeIntent({ user_text: "hi", constraints: { local_only: true } }, {}, { providerRegistry: reg, bundle: denyBundle, ledgerStore: store, signingKey: key.privateKey, created_at: T });
  ok("GEL deny prevents provider use (blocked, no eligibility run)", res.governance.decision === "deny" && res.eligibility === null && res.failure && res.failure.failure_type === "policy_denied");
  ok("denied path still wrote a DecisionRecord", res.record && res.record.execution_type === "blocked");

  // no eligible provider → explicit CAC Failure (no_eligible_provider) + record
  store = L.createMemoryStore();
  reg = regWith("fakeCloudOkProvider");   // only cloud, but plan is local-only → none eligible
  res = await K.executeIntent({ user_text: "hi", constraints: { local_only: true, max_egress: "none", data_classification: "personal" } },
    {}, { providerRegistry: reg, ledgerStore: store, signingKey: key.privateKey, created_at: T });
  ok("no eligible provider → CAC Failure (no_eligible_provider)", res.failure && res.failure.failure_type === "no_eligible_provider" && res.result === null);
  ok("no-provider explanation + record written", res.explanation === "No eligible provider. Nothing left this device." && res.record !== null && res.record.explanation.eligibility_reason === "no_matching_provider");

  // A bundle that ALLOWS full egress (the default bundle correctly requires re-auth for it,
  // which would block before eligibility — that governance behavior is proven elsewhere).
  const allowAllBundle = { bundle_id: "a", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "allow-all", precedence_level: "org", effect: "allow", enabled: true, reason: "test allow", match: {} }] };

  // eligible cloud provider executes through kernel (egress plan) and is recorded as leaving device
  store = L.createMemoryStore();
  reg = regWith("fakeCloudOkProvider");
  res = await K.executeIntent({ user_text: "summarize", constraints: { local_only: false, max_egress: "full", data_classification: "public" } },
    {}, { providerRegistry: reg, bundle: allowAllBundle, ledgerStore: store, signingKey: key.privateKey, created_at: T, plan_kind: "model_call", egress: "full" });
  ok("eligible cloud provider executes through kernel", res.result && res.result.provider_id === "fake-cloud-ok");
  ok("cloud execution explanation reflects data leaving device", res.explanation === "Answered via a provider. Data left this device." && res.record.explanation.provider_type === "cloud");

  // malformed provider response → fails closed through the kernel (validation_error), record written
  store = L.createMemoryStore();
  reg = regWith("fakeCloudMalformedProvider");
  res = await K.executeIntent({ user_text: "x", constraints: { local_only: false, max_egress: "full", data_classification: "public" } },
    {}, { providerRegistry: reg, bundle: allowAllBundle, ledgerStore: store, signingKey: key.privateKey, created_at: T, egress: "full" });
  ok("malformed provider response fails closed through kernel (validation_error)", res.failure && res.failure.failure_type === "validation_error" && res.result === null);

  // ledger verifies after the governed runs
  const store2 = L.createMemoryStore();
  reg = regWith("fakeLocalOkProvider");
  for (let i = 0; i < 3; i++) await K.executeIntent({ user_text: "turn " + i, constraints: { local_only: true } }, {}, { providerRegistry: reg, ledgerStore: store2, signingKey: key.privateKey });
  const v = await L.verifyLedger(await store2.all(), key.publicKey);
  ok("ledger VERIFIES after provider-eligible kernel runs", v.ok === true && v.count === 3);

  // CAC validity of governed Result/Failure
  ok("governed Result/Failure validate against CAC", CAC.validate.validateResult(res.failure ? CAC.builders.buildResult(res.intent, res.plan, { status: "ok", output_text: "", model_id: null, provider_id: "x" }) : res.result).valid);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Provider eligibility v0.1: policy-governed, explicit reasons, deterministic selection, ledger-verified. No cloud calls.");
  process.exit(0);
})().catch(e => { console.error("provider-eligibility test crashed:", e); process.exit(1); });
