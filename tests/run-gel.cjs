/* GEL v0.1 — Milestone 2 tests. Precedence, fail-closed, structural invariants, the
   simulator, and CAC-valid Governance Decisions. Deterministic; no model, no randomness.
   Usage: node tests/run-gel.cjs   (exit 0 = all pass) */
"use strict";
const CAC = require("../core/cac");
const GEL = require("../core/gel");
const B = CAC.builders, V = CAC.validate;

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const T = "2026-06-29T00:00:00Z";
function intent(constraints, i) { return B.buildIntent("do a thing", { intent_id: "intent_" + (i || 0), created_at: T, constraints: constraints }); }
function plan(intentObj, steps, i) { return B.buildPlan(intentObj, steps, { plan_id: "plan_" + (i || 0), created_at: T }); }
function evalp(p, bundle, intentObj) { return GEL.evaluate(p, bundle, { intent: intentObj, decision_id: "dec_x", created_at: T }); }

const allowOnly = { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: "user-allow", precedence_level: "user", effect: "allow", enabled: true, reason: "user ok", match: {} }] };
function withDeny(level) { return { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [
  { policy_id: "user-allow", precedence_level: "user", effect: "allow", enabled: true, reason: "user ok", match: {} },
  { policy_id: level + "-deny", precedence_level: level, effect: "deny", enabled: true, reason: level + " says no", match: { step_type: "model_call" } }
] }; }

(async () => {
  // 1) valid local-only plan allowed by default policy
  const localIntent = intent({ max_egress: "none", data_classification: "personal", local_only: true, requires_user_approval: false });
  const localPlan = plan(localIntent, [{ step_type: "memory_read", target: "user" }, { step_type: "deterministic_answer" }]);
  let d = evalp(localPlan, GEL.defaultBundle, localIntent);
  ok("valid local-only plan ALLOWED by default policy", d.decision === "allow" && d.winning_rule === "default-allow-local");

  // 2) cloud plan with max_egress:none is DENIED (structural egress > cap)
  const capIntent = intent({ max_egress: "none", data_classification: "personal", local_only: false, requires_user_approval: false }, 2);
  const cloudPlan = plan(capIntent, [{ step_type: "model_call", target: "openai", egress: "full" }], 2);
  d = evalp(cloudPlan, GEL.defaultBundle, capIntent);
  ok("cloud plan with max_egress:none DENIED (egress_exceeds_cap)", d.decision === "deny" && d.winning_rule === "system:egress_exceeds_cap");

  // 3) sensitive → cloud DENIED unless explicitly allowed by a HIGHER policy
  const sensIntent = intent({ max_egress: "full", data_classification: "sensitive", local_only: false, requires_user_approval: false }, 3);
  const sensPlan = plan(sensIntent, [{ step_type: "model_call", target: "openai", egress: "full" }], 3);
  d = evalp(sensPlan, GEL.defaultBundle, sensIntent);
  ok("sensitive→cloud DENIED by default (org-deny-sensitive-egress)", d.decision === "deny" && d.winning_rule === "org-deny-sensitive-egress");
  const sensAllowBundle = { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: GEL.defaultBundle.policies.concat([
    { policy_id: "reg-allow-sensitive", precedence_level: "regulatory", effect: "allow", enabled: true, reason: "compliance-approved", match: { data_classification: "sensitive", egress_in: ["full"] } }]) };
  d = evalp(sensPlan, sensAllowBundle, sensIntent);
  ok("sensitive→cloud ALLOWED when a higher (regulatory) policy explicitly allows", d.decision === "allow" && d.precedence_level === "regulatory");

  // 4) regulatory deny overrides user allow
  const genIntent = intent({ max_egress: "full", data_classification: "personal", local_only: false, requires_user_approval: false }, 4);
  const mcPlan = plan(genIntent, [{ step_type: "model_call", target: "local", egress: "full" }], 4);
  d = evalp(mcPlan, withDeny("regulatory"), genIntent);
  ok("regulatory DENY overrides user allow", d.decision === "deny" && d.precedence_level === "regulatory");

  // 5) org deny overrides user allow
  d = evalp(mcPlan, withDeny("org"), genIntent);
  ok("org DENY overrides user allow", d.decision === "deny" && d.precedence_level === "org");

  // 6) user allow cannot override org deny (same scenario, asserting user didn't win)
  ok("user allow CANNOT override org deny (org wins)", d.decision === "deny" && d.winning_rule === "org-deny");

  // 7) default allow overridden by higher deny
  const mixed = { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [
    { policy_id: "default-allow", precedence_level: "default", effect: "allow", enabled: true, reason: "ok", match: {} },
    { policy_id: "org-deny", precedence_level: "org", effect: "deny", enabled: true, reason: "no", match: { step_type: "model_call" } }] };
  d = evalp(mcPlan, mixed, genIntent);
  ok("default allow OVERRIDDEN by higher (org) deny", d.decision === "deny" && d.precedence_level === "org");

  // 8) invalid Plan fails closed
  d = GEL.evaluate({ cac_version: "0.1", plan_id: "p" }, GEL.defaultBundle, { intent: localIntent, decision_id: "dec_x", created_at: T });
  ok("invalid Plan FAILS CLOSED (deny)", d.decision === "deny" && d.winning_rule === "system:invalid_plan");

  // 9) malformed policy bundle fails closed
  d = GEL.evaluate(localPlan, { bundle_id: "x" }, { intent: localIntent, decision_id: "dec_x", created_at: T });
  ok("malformed policy bundle FAILS CLOSED (deny)", d.decision === "deny" && d.winning_rule === "system:malformed_policy_bundle");
  d = GEL.evaluate(localPlan, null, { intent: localIntent, decision_id: "dec_x", created_at: T });
  ok("missing policy bundle FAILS CLOSED (deny)", d.decision === "deny");

  // 10) unknown step type fails closed (CAC plan validation)
  const badStepPlan = JSON.parse(JSON.stringify(localPlan)); badStepPlan.steps[0].step_type = "summon_demon";
  d = GEL.evaluate(badStepPlan, GEL.defaultBundle, { intent: localIntent, decision_id: "dec_x", created_at: T });
  ok("unknown step type FAILS CLOSED (deny)", d.decision === "deny" && d.winning_rule === "system:invalid_plan");

  // 11) no matching rule fails closed when explicit allow is required
  const strict = { bundle_id: "b", bundle_version: "1", require_explicit_allow: true, policies: [] };
  d = evalp(localPlan, strict, localIntent);
  ok("no matching rule FAILS CLOSED when explicit allow required", d.decision === "deny" && d.winning_rule === "system:no_matching_rule");

  // 12) evaluator deterministic
  const d1 = evalp(mcPlan, withDeny("org"), genIntent);
  const d2 = evalp(mcPlan, withDeny("org"), genIntent);
  ok("evaluator DETERMINISTIC (same plan+bundle → identical decision)", JSON.stringify(d1) === JSON.stringify(d2));

  // require_reauth path (default bundle: full egress on personal data)
  const reauthIntent = intent({ max_egress: "full", data_classification: "personal", local_only: false, requires_user_approval: false }, 9);
  const reauthPlan = plan(reauthIntent, [{ step_type: "model_call", target: "openai", egress: "full" }], 9);
  d = evalp(reauthPlan, GEL.defaultBundle, reauthIntent);
  ok("require_reauth produced for full egress of personal data", d.decision === "require_reauth");

  // 13) simulator returns correct counts
  const sim = GEL.simulate([
    { plan: localPlan, intent: localIntent },     // allow
    { plan: cloudPlan, intent: capIntent },        // deny (egress cap)
    { plan: sensPlan, intent: sensIntent },        // deny (sensitive)
    { plan: reauthPlan, intent: reauthIntent }     // require_reauth
  ], GEL.defaultBundle);
  ok("simulator returns correct counts", sim.count === 4 && sim.counts.allow === 1 && sim.counts.deny === 2 && sim.counts.require_reauth === 1 && sim.results[1].winning_rule === "system:egress_exceeds_cap");

  // 14) produced Governance Decision validates against CAC
  ok("produced Decision validates against CAC (allow)", V.validateGovernance(evalp(localPlan, GEL.defaultBundle, localIntent)).valid);
  ok("produced Decision validates against CAC (deny)", V.validateGovernance(evalp(cloudPlan, GEL.defaultBundle, capIntent)).valid);

  // default bundle itself is a valid bundle
  ok("default policy bundle is valid", GEL.validateBundle(GEL.defaultBundle).valid);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("GEL v0.1: precedence enforced, fail-closed, simulator works, decisions are valid CAC.");
  process.exit(0);
})().catch(e => { console.error("GEL test crashed:", e); process.exit(1); });
