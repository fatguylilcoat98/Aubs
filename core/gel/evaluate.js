/* ============================================================================
   AUBS GEL — Governance Enforcement Layer (Milestone 2)
   Truth · Safety · We Got Your Back

   Governance is a HARD GATE, not advice. evaluate(plan, bundle, ctx) consumes a CAC
   Plan and returns a VALID CAC Governance Decision (allow | deny | modify |
   require_reauth). Deterministic: same Plan + same bundle → same decision (only the
   decision's own id/timestamp vary, and both are injectable). No model calls, no
   randomness.

   FAIL CLOSED: any invalid/ambiguous situation → deny. Precedence:
       regulatory > org > group > user > default
   The highest-precedence matching level decides; within it, deny wins, and two
   different non-deny effects are a conflict → deny. Structural invariants (a plan that
   exceeds its own egress cap, or breaks local_only) are top-authority denies that no
   policy can override.

   Isolated: NOT wired into the live app. Consumes CAC (Milestone 1); the produced
   decision can be carried on a Plan before execution (Kernel, later milestone).
   ========================================================================== */
(function () {
  "use strict";
  var CAC = (typeof require !== "undefined") ? require("../cac") : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var BUNDLE_SCHEMA = (typeof require !== "undefined") ? require("./policy-bundle.schema.json") : (window.AUBS_GEL_BUNDLE_SCHEMA);

  var PRECEDENCE = { regulatory: 5, org: 4, group: 3, user: 2, default: 1 };
  var EGRESS_RANK = { none: 0, redacted: 1, full: 2 };

  function canonicalJSON(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
    var k = Object.keys(v).sort();
    return "{" + k.map(function (x) { return JSON.stringify(x) + ":" + canonicalJSON(v[x]); }).join(",") + "}";
  }
  // deterministic content id for the ruleset (NOT a crypto/security hash — the ledger owns that)
  function bundleHash(bundle) {
    var s = canonicalJSON(bundle || {});
    var h = 0x811c9dc5 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return "pb_" + ("00000000" + h.toString(16)).slice(-8);
  }

  // Build the per-step evaluation facts: plan step + the intent's constraints.
  function planFacts(plan, intent) {
    var c = (intent && intent.constraints) || {};
    var base = { data_classification: c.data_classification, local_only: c.local_only, requires_user_approval: c.requires_user_approval, max_egress: c.max_egress };
    var facts = (plan.steps || []).map(function (s) {
      var f = {}; for (var k in base) f[k] = base[k];
      f.step_type = s.step_type;
      f.provider_id = s.target != null ? s.target : null;
      f.egress = (s.egress !== undefined) ? s.egress : c.max_egress;
      return f;
    });
    if (facts.length === 0) { var f0 = {}; for (var k2 in base) f0[k2] = base[k2]; f0.step_type = null; f0.provider_id = null; f0.egress = c.max_egress; facts.push(f0); }
    return facts;
  }

  function matchPolicy(policy, fact) {
    var m = policy.match || {};
    var keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i], cond = m[key];
      if (key.slice(-3) === "_in") { var base = key.slice(0, -3); if (cond.indexOf(fact[base]) < 0) return false; }
      else { if (fact[key] !== cond) return false; }
    }
    return true; // empty match {} → matches everything (catch-all)
  }

  function validateBundle(bundle) {
    if (!bundle || typeof bundle !== "object") return { valid: false, errors: ["bundle missing"] };
    return CAC.validate.validate(BUNDLE_SCHEMA, bundle);
  }

  // Build a VALID CAC Governance Decision (fail-closed denies are still valid decisions).
  function decide(plan, bundle, effect, level, rule, reason, opt) {
    opt = opt || {};
    var planRef = { plan_id: (plan && plan.plan_id) ? plan.plan_id : "invalid" };
    return CAC.builders.buildGovernanceDecision(planRef, effect, {
      decision_id: opt.decision_id, created_at: opt.created_at,
      winning_rule: rule, precedence_level: level,
      policy_bundle_hash: (bundle ? bundleHash(bundle) : "none"), reason: reason
    });
  }

  function evaluate(plan, bundle, ctx) {
    ctx = ctx || {};
    var intent = ctx.intent || null;
    var opt = { decision_id: ctx.decision_id, created_at: ctx.created_at };

    // --- fail-closed gates (top-authority, non-overridable) ---
    var bv = validateBundle(bundle);
    if (!bv.valid) return decide(plan, bundle && typeof bundle === "object" ? bundle : null, "deny", "regulatory", "system:malformed_policy_bundle", "Policy bundle invalid: " + bv.errors.join("; "), opt);

    var pv = CAC.validate.validatePlan(plan);
    if (!pv.valid) return decide(plan, bundle, "deny", "regulatory", "system:invalid_plan", "Plan invalid: " + pv.errors.join("; "), opt);

    var facts = planFacts(plan, intent);
    var cap = (intent && intent.constraints) ? intent.constraints.max_egress : null;
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (cap != null && f.egress != null && EGRESS_RANK[f.egress] > EGRESS_RANK[cap])
        return decide(plan, bundle, "deny", "regulatory", "system:egress_exceeds_cap", "A step's egress '" + f.egress + "' exceeds the intent cap '" + cap + "'.", opt);
      if (intent && intent.constraints && intent.constraints.local_only === true && f.egress && f.egress !== "none")
        return decide(plan, bundle, "deny", "regulatory", "system:local_only_violated", "local_only intent but a step egresses '" + f.egress + "'.", opt);
    }

    // --- policy evaluation with precedence ---
    var matches = (bundle.policies || []).filter(function (p) { return p.enabled && facts.some(function (fct) { return matchPolicy(p, fct); }); });
    if (matches.length === 0) {
      if (bundle.require_explicit_allow) return decide(plan, bundle, "deny", "regulatory", "system:no_matching_rule", "Policy requires an explicit allow and none matched.", opt);
      return decide(plan, bundle, "allow", "default", "no_match_default_allow", "No rule matched; default-allow bundle.", opt);
    }
    var topLevel = matches.reduce(function (mx, p) { return Math.max(mx, PRECEDENCE[p.precedence_level]); }, 0);
    var topName = Object.keys(PRECEDENCE).filter(function (k) { return PRECEDENCE[k] === topLevel; })[0];
    var top = matches.filter(function (p) { return PRECEDENCE[p.precedence_level] === topLevel; });
    var denies = top.filter(function (p) { return p.effect === "deny"; });
    if (denies.length) return decide(plan, bundle, "deny", topName, denies[0].policy_id, denies[0].reason, opt);
    var effects = top.map(function (p) { return p.effect; }).filter(function (e, idx, a) { return a.indexOf(e) === idx; });
    if (effects.length === 1) { var w = top[0]; return decide(plan, bundle, w.effect, topName, w.policy_id, w.reason, opt); }
    // two different non-deny effects at the same level → conflict → fail closed
    return decide(plan, bundle, "deny", topName, "system:policy_conflict", "Conflicting non-deny effects at level '" + topName + "': " + effects.join(", "), opt);
  }

  var API = { evaluate: evaluate, validateBundle: validateBundle, bundleHash: bundleHash, planFacts: planFacts, PRECEDENCE: PRECEDENCE, EGRESS_RANK: EGRESS_RANK };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_GEL_EVALUATE = API;
})();
