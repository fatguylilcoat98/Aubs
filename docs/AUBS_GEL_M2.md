<!--
AUBS — Milestone 2: The Governance Enforcement Layer (GEL v0.1)
Christopher Hughes · Sacramento, CA · Truth · Safety · We Got Your Back
-->

# Milestone 2 — The Governance Enforcement Layer (GEL v0.1)

The ledger (M0) proves *what happened*. CAC (M1) defines *what happened*. **The GEL decides
whether a Plan is allowed to execute at all.** A Plan is not executable until it carries a
Governance Decision. No decision → no execution.

**Isolated, additive, zero-regression.** New modules under `core/gel/`. The live app does **not**
depend on the GEL (it's not wired into the chat loop). `git status` shows only new files. M0 and M1
remain intact.

## What the GEL is — and is not
Governance is a **hard execution gate**, not advice, not a prompt, not model behavior. `evaluate(plan,
bundle, ctx)` takes a **CAC Plan**, validates it, evaluates it against a deterministic **policy
bundle**, and returns a **valid CAC Governance Decision**: `allow | deny | modify | require_reauth`.
It calls no model, uses no randomness, and is fully deterministic (only the decision's own
`decision_id`/`created_at` vary, and both are injectable).

## Why a hard gate
A policy that cannot *deny* an action is decoration. The whole point of AUBS is that an honest
"no" is enforceable and provable. So evaluation is deterministic code on the CAC Plan — you cannot
govern a non-deterministic thing from inside itself, and you cannot trust a gate you can't reproduce.

## Files
```
core/gel/
  policy-bundle.schema.json    # the rule format (CAC-validated, additionalProperties:false)
  default-policy-bundle.json   # a starter bundle (protect sensitive data; default-allow local)
  evaluate.js                  # the deterministic evaluator (precedence + fail-closed)
  simulator.js                 # dry-run many plans → counts + per-plan outcomes
  index.js
tests/run-gel.cjs              # 19/19
docs/AUBS_GEL_M2.md
```

## Policy bundle format (v0.1)
A simple, rigid JSON format (not full Cedar yet — that's a later milestone).
```
{ bundle_id, bundle_version, require_explicit_allow, policies: [
    { policy_id, precedence_level, effect, enabled, reason, match } ] }
```
- **`effect`**: `allow | deny | modify | require_reauth`.
- **`precedence_level`**: `regulatory | org | group | user | default`.
- **`match`** (all conditions must hold; empty `{}` matches everything): `step_type`, `provider_id`,
  `egress`, `max_egress`, `data_classification`, `local_only`, `requires_user_approval`, plus
  set-membership variants `step_type_in`, `provider_id_in`, `egress_in`, `data_classification_in`.
- **`require_explicit_allow`**: when true, a Plan with no matching allow is **denied** (fail-closed
  default-deny). When false, an unmatched Plan gets `default` allow.

Matching facts are built per Plan **step**, merged with the **Intent's constraints** (so a policy can
reason about `data_classification`/`local_only` even though those live on the Intent).

## Precedence — how a decision is chosen
```
regulatory > org > group > user > default   (highest wins)
```
1. The **highest-precedence level** that has a matching policy decides.
2. Within that level: **deny wins** over allow; two *different* non-deny effects are a **conflict →
   deny** (fail closed).
3. A lower level can therefore never override a higher-level decision. *Note (conservative
   choice):* at **equal** precedence, **deny wins**, so an explicit allow must be **strictly higher**
   than a deny to override it. (If you want allow-wins-on-equal, that's a one-line change + a
   council decision — flagged, not assumed.)

## Fail-closed — every ambiguous path denies
The result is **`deny`** (never a silent fallback) when:
- the policy bundle is missing or malformed → `system:malformed_policy_bundle`
- the Plan is invalid CAC (incl. **unknown step type**) → `system:invalid_plan`
- a step's egress **exceeds the Intent's `max_egress` cap** → `system:egress_exceeds_cap` *(structural, regulatory-level, non-overridable)*
- a `local_only` Intent has a step that egresses → `system:local_only_violated` *(structural)*
- policies conflict at the winning level → `system:policy_conflict`
- no rule matches and the bundle requires explicit allow → `system:no_matching_rule`

Structural invariants are emitted at `regulatory` precedence — they are the system floor and no
policy can override them.

## Simulation
`simulate(samples, bundle)` dry-runs an array of `{plan, intent}` against a bundle and returns
`{ count, counts:{allow,deny,modify,require_reauth}, results:[{plan_id, decision, winning_rule,
precedence_level, reason}] }`. This is the seed of the future `aubs policy simulate` admin tool —
an IT team can see exactly what a policy *would* do before deploying it.

## Integration with CAC (Milestone 1)
The GEL **consumes** CAC Plans (validated via `CAC.validate.validatePlan`) and **emits** CAC
Governance Decisions (built via `CAC.builders.buildGovernanceDecision`, so every output — including
fail-closed denies — is a valid CAC object). `policy_bundle_hash` is a deterministic content id of
the ruleset (not a crypto hash — the **ledger** owns cryptographic integrity).

## Tests — 19/19 (`node tests/run-gel.cjs`)
local-only allowed · cloud-with-`max_egress:none` denied · sensitive→cloud denied (and allowed by a
higher policy) · regulatory/org deny over user allow · user can't override org deny · default
overridden by higher deny · invalid plan / malformed bundle / missing bundle / unknown step / no-rule
all fail closed · **deterministic** · `require_reauth` path · simulator counts · decisions valid CAC ·
default bundle valid.

**No regression:** golden 16/16, citation 28/28, relevance 9/9, grounding-verify 8/8,
extraction 18/18, router 20/20, feel, safety 26/26, ledger 13/13, **cac 22/22**. Live app unchanged.

## What the GEL does NOT do yet
Full Cedar; wiring into the live chat loop; router/memory redesign; provider adapters; enterprise
mode; smarter cloud routing. M2 is the policy gate, nothing more.

## How later milestones wire it in
The future **Kernel** will, per request: build an Intent → a deterministic Plan → **call the GEL** →
attach the Governance Decision to the Plan. **If the decision is `deny`, the Kernel does not execute**
(it emits a CAC Failure and a ledger DecisionRecord); `modify`/`require_reauth` gate or adjust
execution; only `allow` proceeds. The gate becomes mandatory there — this milestone proves the gate
itself is correct, deterministic, and fail-closed first.
