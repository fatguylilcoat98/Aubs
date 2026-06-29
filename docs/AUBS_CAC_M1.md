<!--
AUBS — Milestone 1: The Canonical AUBS Contract (CAC v0.1)
Christopher Hughes · Sacramento, CA · Truth · Safety · We Got Your Back
-->

# Milestone 1 — The Canonical AUBS Contract (CAC v0.1)

**The shared language every future AUBS subsystem speaks.** The ledger (M0) proves *what
happened*; the CAC defines *what happened* in a stable, versioned shape. Boring, rigid, explicit
— on purpose (Blueprint Ch.4: "make it almost too simple").

**Isolated, additive, zero-regression.** The CAC is new modules under `core/cac/`. **The live app
does not depend on it** — no app/spine/ledger/SW/UI change this milestone. `git status` shows only
new files. The Milestone-0 ledger is untouched and remains the authority.

## Files
```
core/cac/
  schemas/
    intent.schema.json
    plan.schema.json
    governance-decision.schema.json
    result.schema.json
    failure.schema.json
  validate.js                  # dependency-free JSON-Schema-subset validator (fail closed)
  builders.js                  # pure builders (no model calls, no input mutation)
  decision-record-adapter.js   # CAC → Milestone-0 ledger input (additive)
  index.js                     # single entry point
tests/run-cac.cjs              # 22/22
docs/AUBS_CAC_M1.md
```

## The five schemas (CAC v0.1, `cac_version: "0.1"`)
- **Intent** — the request before execution. `intent_id, created_at, user_text, source, constraints{max_egress, allowed_providers?, data_classification, local_only, requires_user_approval}, context_refs?`. Builder defaults are conservative: `max_egress:"none"`, `local_only:true`.
- **Plan** — the **deterministic** execution plan, built *before any model call*. `plan_id, intent_id, created_at, steps[], requires_governance, status`. Step types: `memory_read · retrieve · model_call · tool_call · deterministic_answer · refusal`. `requires_governance` is derived deterministically (true if any step egresses or calls out).
- **Governance Decision** — the policy outcome (the GEL's M2 target shape). `decision(allow|deny|modify|require_reauth), winning_rule, precedence_level(regulatory|org|group|user|default), policy_bundle_hash, reason?`.
- **Result** — the final output. `result_id, intent_id, plan_id, status(ok|blocked|error|partial), output_text, model_id?, provider_id?, grounding{tag, grounding_source?, memory_refs?}?`.
- **Failure** — an **explicit** failure state, never a silent fallback. `failure_type(policy_denied|no_eligible_provider|model_error|validation_error|timeout|unsafe_blocked|internal_error), message, recoverable`. `intent_id`/`plan_id` may be null (pre-plan failures).

Every schema is `additionalProperties: false` (unknown fields are rejected) with explicit `required`
lists and `enum`/`const` constraints.

## Validation behavior
`validate.js` is a tiny, dependency-free validator (no ajv, no npm) covering the subset the CAC
uses: `type` (incl. unions + integer), `required`, `properties`, `additionalProperties:false`,
`enum`, `const`, `items`, and a loose `date-time` check. It **never coerces**. Invalid objects
**fail closed** with path-prefixed errors (e.g. `$.constraints.max_egress: "everything" is not one
of [none, redacted, full]`). `assertValid()` throws — builders use it so a builder can never emit
invalid CAC.

## Builders
`buildIntent / buildPlan / buildGovernanceDecision / buildResult / buildFailure`. They:
- **never call a model** (plan construction is deterministic),
- **never mutate inputs** (always build fresh objects),
- **validate output and throw on invalid** (fail closed),
- accept injectable `id`/`created_at` via `options` so builds are **reproducible** in tests.

## DecisionRecord adapter (additive)
`adapter.cacToDecisionRecordInput(result, {intent, plan, governance})` maps CAC objects to the
**exact input the Milestone-0 `ledger.appendRecord` already accepts** — it does **not** replace
DecisionRecord. `execution_type` is derived from the plan (`model_call`→model, `deterministic_answer`→rule, `refusal`/blocked→blocked); `explanation` carries tag + grounding + the governance decision; `policy_version` = `policy_bundle_hash`. Test 10 maps a CAC Result and **appends + verifies it in the real ledger**, proving the kernel can speak CAC and still feed the signed chain.

## Tests — 22/22 (`node tests/run-cac.cjs`)
valid Intent passes · missing-required fails · invalid egress enum fails · valid Plan passes ·
invalid step type fails (+ builder fails closed) · **Plan builder deterministic** + non-mutating ·
`requires_governance` derived · governance precedence/decision enums validated (+ fail closed) ·
Result validates (+ bad status fails) · Failure validates (+ null intent/plan) · **CAC→DecisionRecord
maps and appends+verifies in the M0 ledger** · unknown field rejected · wrong `cac_version` rejected ·
helpful errors.

**No regression:** golden 16/16, citation 28/28, relevance 9/9, grounding-verify 8/8,
extraction 18/18, router 20/20, feel, safety 26/26, **ledger 13/13** — all pass. **Live app behavior
unchanged** (no app/spine/ledger/SW edits).

## Architectural notes discovered
- **Conservative-by-default constraints** (`max_egress:"none"`, `local_only:true`) make the safe
  state the *default* state — the GEL (M2) raises privileges explicitly, never the reverse.
- **`requires_governance` is computed deterministically from the plan**, giving M2's GEL a clean
  trigger without re-deciding policy.
- **The adapter is one-directional (CAC → ledger).** The ledger stays authoritative; the CAC is the
  *language*, the ledger is the *record*. Keeping them separate preserves M0's tamper-evidence.

## Is CAC ready to be the kernel's input/output language?
**Yes.** The shape is stable, versioned (`cac_version`), validated fail-closed, and already proven to
feed the signed ledger via the adapter. The future kernel can build an Intent → deterministic Plan →
(M2) Governance Decision → Result/Failure, all in CAC, and emit a DecisionRecord at the end. The
contract is deliberately minimal — add fields only when reality forces it, never speculatively.

## Not done (later milestones, per scope)
GEL · router redesign · provider adapters · memory redesign · making the live app depend on CAC.
