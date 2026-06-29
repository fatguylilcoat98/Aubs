/* AUBS Trust OS Layer 6 — the Check-Order + Reasoning-Permission gate.
   Runtime consults Constraints → Policies → GovernedFacts → Memory → ReasoningPermission →
   ModelSelection, in that order, short-circuiting at the first owner; the model is reached
   LAST and only if every earlier owner declined and reasoning is permitted. The Reasoning-
   Permission gate (previously missing) can deny/defer before any model selection.
   Usage: node tests/run-trust-check-order.cjs */
"use strict";
const CO = require("../core/trust/check-order.js");
const RP = require("../core/trust/reasoning-permission.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const base = {
  constraints: async () => ({ violated: false }),
  policies: async () => ({ decision: "allow", winning_rule: "default" }),
  governedFacts: async () => ({ handled: false }),
  memory: async () => ({ items: [{ id: "m1", type: "FACT" }] }),
  selection: async () => ({ provider: "local-webllm", basis: "deterministic order", strength: "runtime-attested" })
};
const stepNames = (r) => r.trace.map(l => l.step);

(async () => {
  // ── reasoning-permission gate unit ─────────────────────────────────────────────────────────
  t("RP: governed fact handled → not_needed (model 0×)", RP.evaluate({ governedFactHandled: true }).permission === "not_needed");
  t("RP: policy deny → deny", RP.evaluate({ policyDecision: "deny" }).permission === "deny");
  t("RP: modelForbidden → deny", RP.evaluate({ modelForbidden: true }).permission === "deny");
  t("RP: restricted w/o escalation → defer", RP.evaluate({ classification: "restricted" }).permission === "defer");
  t("RP: otherwise → allow", RP.evaluate({}).permission === "allow");

  // ── full order: model reached LAST, after all six steps ─────────────────────────────────────
  {
    const r = await CO.runCheckOrder(base, { classification: "personal" });
    t("model path: outcome 'model', model_called true", r.outcome === "model" && r.model_called === true && r.provider === "local-webllm");
    t("trace shows the full ordered sequence ending at ModelSelection",
      JSON.stringify(stepNames(r)) === JSON.stringify(["Constraints", "Policies", "GovernedFact", "Memory", "ReasoningPermission", "ModelSelection"]));
    t("every trace line carries a strength", r.trace.every(l => typeof l.strength === "string"));
  }

  // ── constraint violation STOPS first (model never reached) ───────────────────────────────────
  {
    const r = await CO.runCheckOrder(Object.assign({}, base, { constraints: async () => ({ violated: true, reason: "do_not_cross" }) }), {});
    t("constraint violated → blocked_constraint, model 0×, stops at step 1", r.outcome === "blocked_constraint" && r.model_called === false && stepNames(r).length === 1);
  }

  // ── policy deny stops at step 2 ──────────────────────────────────────────────────────────────
  {
    const r = await CO.runCheckOrder(Object.assign({}, base, { policies: async () => ({ decision: "deny", reason: "rule_19" }) }), {});
    t("policy deny → blocked_policy, model 0×", r.outcome === "blocked_policy" && r.model_called === false);
  }

  // ── governed fact answers at step 3 (model 0×, memory/selection never run) ───────────────────
  {
    const r = await CO.runCheckOrder(Object.assign({}, base, { governedFacts: async () => ({ handled: true, answer: "I'm Tom.", factId: "identity:assistant_identity" }) }), {});
    t("governed fact → outcome governed_fact, model 0×, no Memory/Selection lines",
      r.outcome === "governed_fact" && r.model_called === false && !stepNames(r).includes("ModelSelection") && !stepNames(r).includes("Memory"));
  }

  // ── reasoning-permission denies BEFORE model selection ───────────────────────────────────────
  {
    const r = await CO.runCheckOrder(base, { modelForbidden: true });
    t("reasoning denied → reasoning_deny, model 0×, never reaches ModelSelection",
      r.outcome === "reasoning_deny" && r.model_called === false && !stepNames(r).includes("ModelSelection"));
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 6 Check-Order: Constraints→Policies→GovernedFacts→Memory→ReasoningPermission→ModelSelection; first owner wins; model reached last; the reasoning gate (was missing) can deny/defer before selection.");
  process.exit(0);
})().catch(e => { console.error("check-order test crashed:", e); process.exit(1); });
