# AUBS Policy-Governed Provider Eligibility — Milestone 6

**Branch:** `claude/aubs-provider-eligibility-m6` (base: `claude/aubs-provider-adapters-m5`)
**Status:** isolated. No app changes, no cloud calls, no API keys. The governed-local phone path
is unchanged.

M5 built the provider boundary. M6 makes provider use **governed**: a provider may execute only
when policy and the user's constraints permit it. This milestone answers *"is this provider
**allowed** for this plan?"* — not *"which provider is **best**?"*. Selection stays deterministic
and boring; eligibility comes first.

```
CAC Intent constraints → CAC Plan → GEL decision
   → (deny? block before eligibility)
   → eligibility(Intent, Plan, GEL, Registry)  →  eligible / rejected(+reasons)
   → kernel executes ONLY through an eligible provider (deterministic pick: lowest id)
   → DecisionRecord proves the provider choice / denial → ledger verifies
```

## What provider eligibility is
A provider is **unavailable** unless it is, in order:
1. **governed-allowed** (GEL returned `allow` for the plan),
2. **valid** under the Provider Contract (Drift Shield),
3. **enabled**,
4. **compatible with the Plan** (egress ceiling covers the plan's demand),
5. **compatible with Intent constraints** (local-only, data classification),
6. **capable** of the step (e.g. tool steps need `supports_tools`),
7. **healthy** (live `healthCheck`).

Any failure produces an **explicit reason code**. No silent fallback, no hidden provider choice.

## Why eligibility comes before selection
*Routing does not begin with choosing the best provider — it begins with eliminating every
provider that is not allowed.* Policy before preference; trust before convenience. Scoring a
provider that isn't even permitted would be a privacy/safety hole dressed up as optimization.

## How Intent constraints affect eligibility
Derived deterministically by `planDemands(plan, intent)`:
- `local_only: true` → only `local` providers; anything needing the network is rejected
  (`requires_network_but_local_only`).
- plan with **no egress** → cloud / network providers rejected (`egress_not_allowed`).
- plan that **leaves the device** → provider's `max_egress` must cover the demand, else
  `egress_not_allowed`.
- `data_classification` (e.g. `sensitive`) → the provider must list that class in
  `data_classes_allowed`, else `data_class_not_allowed`.

## How GEL affects eligibility
GEL runs **first**, in the kernel, on the Plan. If GEL does not return `allow`
(`deny` / `require_reauth` / `modify`), the kernel blocks **before** eligibility is even computed —
the provider registry is never consulted, and a `policy_denied` Failure + DecisionRecord are
written. The eligibility engine also encodes this directly: a non-allow decision rejects every
provider with `governance_denied`.

## How provider capabilities affect eligibility
The capability record (M5) is the contract a provider must honour: `max_egress`,
`data_classes_allowed`, `requires_network`, `supports_tools`, type↔capability consistency, etc.
Eligibility checks the plan's demands against these declared capabilities — a provider that
*claims* it can carry the plan but whose capabilities say otherwise is rejected.

## Deterministic selection rule
Of the eligible set, the kernel selects the provider with the **lowest `provider_id`** (string
sort). That's the entire rule for this milestone — **no cost, latency, quality, or learned
ranking.** Same inputs → same provider, every time.

## Rejected-provider reason codes
`governance_denied`, `provider_invalid`, `provider_disabled`,
`requires_network_but_local_only`, `egress_not_allowed`, `data_class_not_allowed`,
`unsupported_step_type`, `provider_unhealthy`, and the summary `no_matching_provider`.

## Kernel integration
`executeIntent(intentInput, adapters, options)` gains an **optional** `options.providerRegistry`.
- If absent → the M3/M4 local-adapter path runs **exactly as before** (M4 kernel-chat tests +
  the real-browser proof confirm this; the live app passes no registry).
- If present → on a GEL `allow`, the kernel runs the eligibility engine, then:
  - no eligible provider → CAC `Failure` (`no_eligible_provider`),
  - one or more eligible → execute the lowest-id provider **behind the Drift Shield**
    (`registry.runGuarded`), mapping a drifting response to a CAC `validation_error` Failure.
- Every terminal path still writes one DecisionRecord.

## DecisionRecord provider metadata
The record's `provider` field carries the selected `provider_id` (or `local` on the legacy path),
and `explanation` now includes `provider_governed`, `provider_id`, `provider_type`,
`eligible_count`, `eligibility_reason`, and `rejected_providers[{provider_id, reasons}]` — enough
for "Why?" and the offline verifier to later show *answered locally / provider selected / provider
rejected / no provider eligible / nothing left device when local*. **Milestone 0 is not weakened**:
records remain append-only, hash-chained, Ed25519-signed, and the verifier still passes.

## What remains future work
Real provider adapters (OpenAI/Anthropic/Gemini/xAI/…), real cloud execution, API-key handling,
and **selection by score** (cost/latency/quality/learned routing). M6 deliberately stops at
eligibility + deterministic pick.

---

## Files
**New** — `core/providers/eligibility.js`, `tests/run-provider-eligibility.cjs` (24/24),
`docs/AUBS_PROVIDER_ELIGIBILITY_M6.md`.
**Modified** — `core/kernel/execute.js` (optional governed provider path; legacy path unchanged),
`core/kernel/explanation.js` (honest heads for provider / no-provider outcomes),
`core/providers/index.js` (export `eligibility`).
**Untouched** — `aubs-app.html`, `sw.js`. The live app passes no registry, so the governed branch
is inert on device.

## Tests
`run-provider-eligibility.cjs` **24/24** + full regression green: golden 16/16, citation 28/28,
relevance 9/9, grounding 8/8, memory 18/18, router 20/20, feel ✓, safety ✓, ledger 13/13, cac
22/22, gel 19/19, kernel 23/23, kernel-chat 24/24, providers 28/28. The real-browser proof
(headless Chromium) still passes — the phone's kernel stack is unaffected.
