/* ============================================================================
   AUBS Replay — decision replay engine (Milestone 7)
   Truth · Safety · We Got Your Back

   Verification proves the record is AUTHENTIC. Replay proves the reasoning is
   REPRODUCIBLE. Those are different, and AUBS does both.

   Given evidence (a verified DecisionRecord + its CAC Intent/Plan/Governance + the policy
   bundle + a provider snapshot), the replay engine re-derives the governance decision (and,
   if a registry is supplied, provider eligibility/selection) and reports:

       MATCH     — the same decision would occur today/under the chosen policy
       DRIFT     — it would differ, with EXPLICIT structured reasons
       REJECTED  — the record is malformed or tampered; it cannot be replayed

   Replay NEVER executes a model and NEVER mutates history. It only re-evaluates policy.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var GEL    = isNode ? require("../gel")               : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var ELIG   = isNode ? require("../providers/eligibility") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_ELIG : null);
  var DRIFT  = isNode ? require("../providers/drift-shield") : (typeof window !== "undefined" ? window.AUBS_PROVIDER_DRIFT : null);
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var KERNEL = isNode ? require("../kernel")            : (typeof window !== "undefined" ? window.AUBS_KERNEL : null);
  var EV     = isNode ? require("./evidence")           : (typeof window !== "undefined" ? window.AUBS_REPLAY_EVIDENCE : null);

  var DRIFT_REASONS = ["policy_changed", "provider_removed", "provider_capability_changed", "provider_unhealthy",
                       "intent_changed", "plan_changed", "governance_changed", "kernel_version_changed", "replay_incomplete"];

  function cmp(original, current) { return { original: original, current: current, status: same(original, current) ? "SAME" : "CHANGED" }; }
  function same(a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }

  // Re-evaluate governance (and provider selection) for one policy bundle. No model, no mutation.
  function replayOnce(ev, bundle, options) {
    options = options || {};
    var gov = GEL.evaluate(ev.plan, bundle, { intent: ev.intent });
    var providerP = Promise.resolve({ selected: null, eligible: [], rejected: [] });
    if (options.registry && ELIG && gov.decision === "allow") {
      providerP = ELIG.evaluate({ intent: ev.intent, plan: ev.plan, governance: gov, registry: options.registry });
    }
    return providerP.then(function (elig) {
      return {
        policy_bundle_hash: GEL.bundleHash ? GEL.bundleHash(bundle) : (bundle && bundle.__hash) || "unknown",
        decision: gov.decision, winning_rule: gov.winning_rule, reason: gov.reason || null,
        selected_provider: elig.selected || null, eligible_count: (elig.eligible || []).length
      };
    });
  }

  // Compare a re-derived outcome against the RECORDED one and collect explicit drift reasons.
  function diffAgainstRecord(ev, outcome, options) {
    var reasons = [];
    var recordedDecision = ev.governance.decision;
    var recordedProvider = ev.provider ? ev.provider.provider_id : null;

    if (outcome.policy_bundle_hash !== ev.policy_bundle_hash) reasons.push("policy_changed");
    if (outcome.decision !== recordedDecision) reasons.push("governance_changed");

    // provider checks (only meaningful when a provider was recorded / a registry is supplied)
    var providerStatus = "SAME";
    if (recordedProvider) {
      if (options.registry && options.registry.has && !options.registry.has(recordedProvider)) { reasons.push("provider_removed"); providerStatus = "REMOVED"; }
      else if (options.registry && options.registry.get) {
        var p = options.registry.get(recordedProvider);
        if (p && ev.provider.capabilities && !same(p.capabilities, ev.provider.capabilities)) { reasons.push("provider_capability_changed"); providerStatus = "CHANGED"; }
      }
      if (outcome.selected_provider !== recordedProvider && options.registry) { if (reasons.indexOf("provider_removed") === -1) providerStatus = providerStatus === "SAME" ? "CHANGED" : providerStatus; }
    }

    var curKernel = options.kernel_version || (KERNEL && KERNEL.KERNEL_VERSION) || null;
    if (ev.kernel_version && curKernel && ev.kernel_version !== curKernel) reasons.push("kernel_version_changed");

    return { reasons: dedupe(reasons), providerStatus: providerStatus, curKernel: curKernel };
  }

  function dedupe(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // Async health check folded into the provider comparison (current registry only).
  function providerHealthDrift(ev, options) {
    var pid = ev.provider ? ev.provider.provider_id : null;
    if (!pid || !options.registry || !options.registry.get) return Promise.resolve(false);
    var p = options.registry.get(pid);
    if (!p) return Promise.resolve(false);   // removal handled separately
    return DRIFT.checkHealth(p).then(function (h) { return !h.healthy; });
  }

  // Build the deterministic comparison block.
  function comparison(ev, outcome, providerStatus, curKernel, options) {
    return {
      governance: { original: ev.governance.decision, current: outcome.decision, status: ev.governance.decision === outcome.decision ? "SAME" : "CHANGED", reason: outcome.reason },
      policy: { original: ev.policy_bundle_hash, current: outcome.policy_bundle_hash, status: ev.policy_bundle_hash === outcome.policy_bundle_hash ? "SAME" : "CHANGED" },
      provider: { original: ev.provider ? ev.provider.provider_id : null, current: outcome.selected_provider, status: providerStatus },
      kernel_version: { original: ev.kernel_version, current: curKernel, status: (ev.kernel_version === curKernel) ? "SAME" : "CHANGED" },
      memory: { original: (ev.record && ev.record.memory_refs ? ev.record.memory_refs.length : 0), current: (options.currentMemoryCount != null ? options.currentMemoryCount : null), status: (options.currentMemoryCount == null || options.currentMemoryCount === (ev.record && ev.record.memory_refs ? ev.record.memory_refs.length : 0)) ? "SAME" : "CHANGED" }
    };
  }

  // ── The public entry point ──────────────────────────────────────────────────────────
  // replay(evidence, options):
  //   options.mode            "exact" (default) | "current" | "comparison"
  //   options.currentPolicyBundle   bundle for current/comparison replay
  //   options.registry        provider registry (enables provider drift checks)
  //   options.publicKey       Ed25519 public key to verify the record signature
  //   options.ledger          full records array → chain-verified before replay (recommended)
  //   options.kernel_version  override the "current" kernel version (defaults to live)
  //   options.requireVerified default true — refuse to replay a tampered/unverified record
  function replay(evidence, options) {
    options = options || {};
    var mode = options.mode || "exact";
    var requireVerified = options.requireVerified !== false;

    // 1) structural gate — malformed evidence is REJECTED (never "different")
    var s = EV.structuralCheck(evidence);
    if (!s.ok) return Promise.resolve(reject("replay_incomplete", { missing: s.missing }));

    // 2) integrity gate — verify the ledger chain if provided, else the single record; then bind.
    var integrityP;
    if (options.ledger) {
      integrityP = LEDGER.verifyLedger(options.ledger, options.publicKey || null).then(function (lv) {
        if (!lv.ok) return { ok: false, issues: ["ledger_unverified"] };
        return EV.verifyEvidence(evidence, options.publicKey || null);
      });
    } else {
      integrityP = EV.verifyEvidence(evidence, options.publicKey || null);
    }

    return integrityP.then(function (vi) {
      if (requireVerified && !vi.ok) {
        // tampered record or broken binding → cannot replay
        var why = (vi.issues && vi.issues.indexOf("intent_changed") !== -1) ? "intent_changed" : "record_tampered";
        return reject(why, { issues: vi.issues });
      }
      // 3) re-derive under the chosen policy/policies
      return providerHealthDrift(evidence, options).then(function (unhealthy) {
        if (mode === "comparison") {
          var exactBundle = evidence.policy_bundle;
          var currentBundle = options.currentPolicyBundle || evidence.policy_bundle;
          if (!exactBundle || !options.currentPolicyBundle) {
            // still produce what we can, but flag incompleteness for the missing side
          }
          return replayOnce(evidence, exactBundle, options).then(function (exactOut) {
            return replayOnce(evidence, currentBundle, options).then(function (curOut) {
              var d = diffAgainstRecord(evidence, curOut, options);
              if (unhealthy) d.reasons = dedupe(d.reasons.concat(["provider_unhealthy"]));
              if (!exactBundle || !options.currentPolicyBundle) d.reasons = dedupe(d.reasons.concat(["replay_incomplete"]));
              var status = d.reasons.length ? "DRIFT" : "MATCH";
              return {
                status: status, mode: mode, reasons: d.reasons,
                comparison: comparison(evidence, curOut, d.providerStatus, d.curKernel, options),
                original: { decision: evidence.governance.decision, policy_bundle_hash: evidence.policy_bundle_hash, provider: evidence.provider ? evidence.provider.provider_id : null, kernel_version: evidence.kernel_version },
                exact: exactOut, current: curOut, unsigned: vi.unsigned || false, verified: vi.ok
              };
            });
          });
        }
        var bundle = (mode === "current") ? (options.currentPolicyBundle || null) : evidence.policy_bundle;
        if (!bundle) return reject("replay_incomplete", { detail: "no policy bundle for mode '" + mode + "'" });
        return replayOnce(evidence, bundle, options).then(function (outcome) {
          var d = diffAgainstRecord(evidence, outcome, options);
          if (unhealthy) d.reasons = dedupe(d.reasons.concat(["provider_unhealthy"]));
          var status = d.reasons.length ? "DRIFT" : "MATCH";
          return {
            status: status, mode: mode, reasons: d.reasons,
            comparison: comparison(evidence, outcome, d.providerStatus, d.curKernel, options),
            original: { decision: evidence.governance.decision, policy_bundle_hash: evidence.policy_bundle_hash, provider: evidence.provider ? evidence.provider.provider_id : null, kernel_version: evidence.kernel_version },
            current: outcome, unsigned: vi.unsigned || false, verified: vi.ok
          };
        });
      });
    });
  }

  function reject(reason, detail) { return { status: "REJECTED", mode: null, reasons: [reason], detail: detail || null }; }

  var API = { replay: replay, replayOnce: replayOnce, DRIFT_REASONS: DRIFT_REASONS, comparison: comparison };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_REPLAY_ENGINE = API;
})();
