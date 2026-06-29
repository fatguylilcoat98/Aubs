/* CAC v0.1 — Milestone 1 tests. Validates schemas, builders (deterministic, no model,
   no mutation), fail-closed behavior, and the additive DecisionRecord adapter (CAC →
   the Milestone-0 ledger). Usage: node tests/run-cac.cjs   (exit 0 = all pass) */
"use strict";
const CAC = require("../core/cac");
const L = require("../spine/ledger.js");
const B = CAC.builders, V = CAC.validate;

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

const PIN = { intent_id: "intent_x", created_at: "2026-06-29T00:00:00Z" };

(async () => {
  // 1) valid Intent passes
  const intent = B.buildIntent("what's my name?", PIN);
  ok("valid Intent passes", V.validateIntent(intent).valid && intent.cac_version === "0.1" && intent.constraints.max_egress === "none");

  // 2) Intent missing required field fails
  const badIntent = { ...intent }; delete badIntent.user_text;
  ok("Intent missing required field fails", V.validateIntent(badIntent).valid === false);

  // 3) invalid egress enum fails
  const badEgress = JSON.parse(JSON.stringify(intent)); badEgress.constraints.max_egress = "everything";
  ok("invalid egress enum fails", V.validateIntent(badEgress).valid === false);

  // 4) valid Plan passes
  const steps = [{ step_type: "memory_read", target: "user" }, { step_type: "deterministic_answer" }];
  const plan = B.buildPlan(intent, steps, { plan_id: "plan_x", created_at: PIN.created_at });
  ok("valid Plan passes", V.validatePlan(plan).valid && plan.intent_id === intent.intent_id && plan.requires_governance === false);

  // 5) Plan with invalid step type fails
  const badPlan = JSON.parse(JSON.stringify(plan)); badPlan.steps[0].step_type = "summon_demon";
  ok("Plan with invalid step type fails", V.validatePlan(badPlan).valid === false);

  // 5b) builder fails closed on a bad step type (never emits invalid CAC)
  ok("buildPlan throws on invalid step type (fail closed)", throws(() => B.buildPlan(intent, [{ step_type: "nope" }], { plan_id: "p", created_at: PIN.created_at })));

  // 6) Plan builder is deterministic (same inputs+pins → deep-equal) AND does not mutate inputs
  const stepsFrozen = [{ step_type: "model_call", target: "local" }];
  const p1 = B.buildPlan(intent, stepsFrozen, { plan_id: "plan_d", created_at: PIN.created_at });
  const p2 = B.buildPlan(intent, stepsFrozen, { plan_id: "plan_d", created_at: PIN.created_at });
  ok("Plan builder deterministic (deep-equal)", JSON.stringify(p1) === JSON.stringify(p2));
  ok("Plan builder does not mutate input steps", stepsFrozen.length === 1 && Object.keys(stepsFrozen[0]).length === 2);
  ok("Plan derives requires_governance=true for a model_call", p1.requires_governance === true);

  // 7) Governance precedence + decision enums validated
  const gov = B.buildGovernanceDecision(plan, "allow", { decision_id: "g1", created_at: PIN.created_at, precedence_level: "user", policy_bundle_hash: "h", winning_rule: "r" });
  ok("Governance decision validates", V.validateGovernance(gov).valid && gov.decision === "allow");
  ok("Governance bad precedence enum fails", V.validateGovernance({ ...gov, precedence_level: "emperor" }).valid === false);
  ok("Governance bad decision enum fails", V.validateGovernance({ ...gov, decision: "maybe" }).valid === false);
  ok("buildGovernanceDecision throws on bad decision (fail closed)", throws(() => B.buildGovernanceDecision(plan, "perhaps", { created_at: PIN.created_at })));

  // 8) Result validates
  const result = B.buildResult(intent, plan, { result_id: "res_x", created_at: PIN.created_at, output_text: "Your name is Chris.", model_id: "Qwen2.5-0.5B", provider_id: "local", status: "ok", grounding: { tag: "grounded", grounding_source: "router_memory", memory_refs: ["m_1"] } });
  ok("Result validates", V.validateResult(result).valid && result.grounding.tag === "grounded");
  ok("Result bad status enum fails", V.validateResult({ ...result, status: "vibes" }).valid === false);

  // 9) Failure validates (explicit, never silent)
  const failure = B.buildFailure(intent, plan, { failure_id: "f_x", created_at: PIN.created_at, failure_type: "policy_denied", message: "org policy denies cloud", recoverable: false });
  ok("Failure validates", V.validateFailure(failure).valid && failure.failure_type === "policy_denied");
  ok("Failure allows null intent/plan (pre-plan failure)", V.validateFailure(B.buildFailure(null, null, { failure_id: "f0", created_at: PIN.created_at, failure_type: "validation_error", message: "bad input", recoverable: true })).valid);

  // 10) CAC → DecisionRecord input, then append to the Milestone-0 ledger (additive)
  const drInput = CAC.adapter.cacToDecisionRecordInput(result, { intent, plan, governance: gov });
  ok("adapter produces ledger input shape", drInput.input === "what's my name?" && drInput.output === "Your name is Chris." && drInput.model_id === "Qwen2.5-0.5B" && drInput.execution_type === "rule" && drInput.explanation.tag === "grounded" && drInput.policy_version === "h");
  const keys = await L.generateSigningKeyPair();
  const store = L.createMemoryStore();
  const rec = await L.appendRecord(store, drInput, keys.privateKey);
  const v = await L.verifyLedger(await store.all(), keys.publicKey);
  ok("mapped CAC record appends to the ledger AND verifies (M0 intact)", rec.seq === 0 && v.ok === true && rec.input_hash && rec.signature !== "unsigned");

  // 11) invalid object fails closed (validator never coerces; unknown field rejected)
  ok("unknown extra field rejected (additionalProperties:false)", V.validateIntent({ ...intent, sneaky: true }).valid === false);
  ok("wrong cac_version (const) rejected", V.validateIntent({ ...intent, cac_version: "9.9" }).valid === false);
  ok("validator returns helpful errors", (() => { const r = V.validateIntent(badIntent); return r.errors.length > 0 && /user_text/.test(r.errors.join(" ")); })());

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed (CAC " + CAC.CAC_VERSION + ")");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("CAC v0.1: schemas validate, builders deterministic & fail-closed, ledger adapter additive.");
  process.exit(0);
})().catch(e => { console.error("CAC test crashed:", e); process.exit(1); });
