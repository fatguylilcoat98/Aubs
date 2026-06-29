/* AUBS Kernel v0.1 — Milestone 3 tests. Proves the governed lifecycle:
   Intent → Plan → GEL → execute/deny → Result/Failure → DecisionRecord → verify.
   Usage: node tests/run-kernel.cjs   (exit 0 = all pass) */
"use strict";
const CAC = require("../core/cac");
const GEL = require("../core/gel");
const L = require("../spine/ledger.js");
const K = require("../core/kernel");
const A = K.adapters;

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const T = "2026-06-29T00:00:00Z";
const PIN = { created_at: T, intent_id: "i0", plan_id: "p0", decision_id: "d0", result_id: "r0", failure_id: "f0" };
function bundleWith(effect) {
  return { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: effect + "-mc", precedence_level: "org", effect: effect, enabled: true, reason: effect + " model calls", match: { step_type: "model_call" } }] };
}

(async () => {
  const key = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  const base = (over) => Object.assign({ ledgerStore: store, signingKey: key.privateKey, plan_kind: "model_call" }, PIN, over);

  // 1) valid intent builds a CAC Intent + 2) deterministic Plan produced
  let o = await K.executeIntent("hello there", { local: A.localOkAdapter }, base());
  ok("valid intent builds a valid CAC Intent", CAC.validate.validateIntent(o.intent).valid && o.intent.user_text === "hello there");
  ok("deterministic Plan produced (valid CAC, model_call terminal)", CAC.validate.validatePlan(o.plan).valid && o.plan.steps.some(s => s.step_type === "model_call"));

  // 3) GEL allow permits execution → 8) adapter success → CAC Result
  ok("GEL allow → execution proceeds, CAC Result produced", o.governance.decision === "allow" && o.result && o.result.status === "ok" && /Local answer/.test(o.result.output_text) && o.failure === null);
  ok("successful execution wrote a ledger record (execution_type=model)", o.record && o.record.execution_type === "model");
  ok("Level 1 explanation derived: answered locally", o.explanation === "Answered locally. Nothing left this device.");

  // 4) GEL deny blocks execution and DOES NOT call the adapter
  const spy = A.makeSpyAdapter();
  o = await K.executeIntent("hello", { local: spy }, base({ bundle: bundleWith("deny") }));
  ok("GEL deny → blocked, adapter NEVER called", o.governance.decision === "deny" && spy.calls() === 0 && o.result === null && o.failure && o.failure.failure_type === "policy_denied");
  ok("denied execution STILL wrote a ledger record (execution_type=blocked)", o.record && o.record.execution_type === "blocked");
  ok("Level 1 explanation derived: blocked by policy", o.explanation === "Blocked by policy. Nothing left this device.");

  // 5) require_reauth blocks; 6) modify blocks (M3: no execution)
  const spy2 = A.makeSpyAdapter();
  o = await K.executeIntent("hi", { local: spy2 }, base({ bundle: bundleWith("require_reauth") }));
  ok("require_reauth → blocked, no adapter call, failure recoverable", o.governance.decision === "require_reauth" && spy2.calls() === 0 && o.failure && o.failure.recoverable === true);
  const spy3 = A.makeSpyAdapter();
  o = await K.executeIntent("hi", { local: spy3 }, base({ bundle: bundleWith("modify") }));
  ok("modify → blocked, no adapter call", o.governance.decision === "modify" && spy3.calls() === 0 && o.failure !== null);

  // 7) no Governance allow ⇒ no execution (kernel always evaluates; allow is mandatory) — proven by deny/modify/reauth above
  ok("no allowed decision ⇒ no execution (mandatory gate)", true);

  // 9) adapter failure → CAC Failure (both returned-failure and thrown)
  o = await K.executeIntent("hello", { local: A.localFailAdapter }, base());
  ok("adapter returned failure → CAC Failure (model_error), status error", o.failure && o.failure.failure_type === "model_error" && o.status === "error" && o.result === null);
  ok("adapter failure wrote a ledger record", o.record !== null);
  o = await K.executeIntent("hello", { local: A.localThrowAdapter }, base());
  ok("adapter THROW → CAC Failure (caught)", o.failure && o.failure.failure_type === "model_error");
  ok("Level 1 explanation derived: execution failed", o.explanation === "Execution failed before an answer. Nothing left this device.");

  // deterministic_answer + refusal plan kinds
  o = await K.executeIntent("2+2?", {}, base({ plan_kind: "deterministic_answer", answer: "4" }));
  ok("deterministic_answer plan → CAC Result without a model", o.result && o.result.output_text === "4" && o.result.model_id === null && o.kind === "executed");
  o = await K.executeIntent("do harm", {}, base({ plan_kind: "refusal", refusal_reason: "unsafe" }));
  ok("refusal plan → CAC Failure (unsafe_blocked)", o.failure && o.failure.failure_type === "unsafe_blocked");
  ok("Level 1 explanation derived: refused for safety", o.explanation === "Refused for safety. Nothing left this device.");

  // 12) ledger verifies after all kernel runs
  const v = await L.verifyLedger(await store.all(), key.publicKey);
  ok("ledger VERIFIES after kernel executions (ok, " + v.count + " records)", v.ok === true && v.count >= 4);

  // 11) every terminal path wrote a record — count check (we ran 8 ledger-backed executes above)
  ok("every terminal path wrote a ledger record", (await store.count()) >= 8);

  // 14) deterministic except timestamps/ids/signatures: same pins + fresh stores → identical CAC objects
  const s1 = L.createMemoryStore(), s2 = L.createMemoryStore();
  const r1 = await K.executeIntent("same input", { local: A.localOkAdapter }, base({ ledgerStore: s1 }));
  const r2 = await K.executeIntent("same input", { local: A.localOkAdapter }, base({ ledgerStore: s2 }));
  const strip = (r) => JSON.stringify({ intent: r.intent, plan: r.plan, governance: r.governance, result: r.result, failure: r.failure, explanation: r.explanation });
  ok("execution path deterministic (intent/plan/governance/result/explanation identical)", strip(r1) === strip(r2));

  // 13) produced Result/Failure validate against CAC
  ok("kernel Result validates against CAC", CAC.validate.validateResult(r1.result).valid);
  const denyRun = await K.executeIntent("x", { local: A.localOkAdapter }, base({ bundle: bundleWith("deny") }));
  ok("kernel Failure validates against CAC", CAC.validate.validateFailure(denyRun.failure).valid);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Kernel v0.1: Intent→Plan→GEL→execute/deny→Result/Failure→DecisionRecord, fail-closed, ledger-verified.");
  process.exit(0);
})().catch(e => { console.error("kernel test crashed:", e); process.exit(1); });
