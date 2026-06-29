# AUBS Decision Replay & Constitutional Audit — Milestone 7

**Branch:** `claude/aubs-decision-replay-m7` (base: `claude/aubs-provider-eligibility-m6`)
**Status:** isolated, additive. No app changes, no cloud calls. The governed-local phone path is
unchanged.

AUBS already records decisions (M0 ledger). M7 proves those decisions are **reproducible**: a
historical DecisionRecord becomes **executable evidence**. Given the record plus its CAC
Intent/Plan/Governance, the policy bundle, and a provider snapshot, the replay engine re-derives
the decision and answers two questions — *would the same decision occur?* and, if not, *exactly
why not?*

## Why replay exists
A signature proves a record wasn't altered. It does **not** prove the reasoning still holds. Policy
changes, providers are removed or drift, capabilities change, the kernel is upgraded. Replay turns a
record into a re-runnable proof of the reasoning, so an auditor (or the user) can see whether
today's AUBS — or any historical policy — would make the same call, and which specific input moved.

## Verification vs replay vs execution
- **Verification** (M0) proves the record is **authentic** — append-only, hash-chained,
  Ed25519-signed; tampering is detected. It says nothing about whether the decision still holds.
- **Replay** (M7) proves the reasoning is **reproducible** — it re-evaluates GEL (and provider
  eligibility) over the recorded Intent/Plan and compares to what was recorded. It never runs a
  model and never mutates history.
- **Execution** (M3–M6) actually runs the plan through the kernel and a provider, producing new
  output and a new record. Replay does none of that.

> Verification proves the record is authentic. Replay proves the reasoning is reproducible. Those
> are different. AUBS does both.

## Evidence — binding CAC to the record (`evidence.js`)
`captureDecision(kernelResult, { policyBundle, registry })` produces a serializable evidence object:
the signed `record`, the CAC `intent`/`plan`/`governance`, the `policy_bundle` (+ its hash), the
`kernel_version`, and a provider snapshot (`provider_id`, `provider_type`, `capabilities`,
`eligible_count`, `rejected_providers`).

`verifyEvidence(evidence, publicKey)` is the gate replay runs first:
1. **structural** — the minimum fields are present;
2. **record integrity** — recompute `record_hash` over the body and verify the signature
   (a modified body or forged signature fails);
3. **binding** — `sha256(intent.user_text) === record.input_hash`, so the CAC Intent cannot be
   swapped under an otherwise-intact record.

## Replay engine (`replay-engine.js`)
`replay(evidence, options)` returns one of three statuses — and **never** just says "different":

| status | meaning |
|---|---|
| `MATCH` | the same decision would occur under the chosen policy |
| `DRIFT` | it would differ — with explicit structured reasons |
| `REJECTED` | the record is malformed or tampered; it cannot be replayed |

### Modes
- **Exact** — uses the **original** policy bundle from the evidence; reproduces the original outcome.
- **Current** — uses **today's** policy (`options.currentPolicyBundle`); shows whether today's AUBS
  would decide the same.
- **Comparison** — runs both and returns `exact` + `current` + the `difference`, side by side.

### Drift reasons (explicit)
`policy_changed`, `provider_removed`, `provider_capability_changed`, `provider_unhealthy`,
`intent_changed`, `plan_changed`, `governance_changed`, `kernel_version_changed`,
`replay_incomplete`. Integrity failures surface as `REJECTED` (`record_tampered`, `intent_changed`,
`ledger_unverified`, `replay_incomplete`).

### Deterministic comparison objects
```
governance:    { original: "allow", current: "deny",  status: "CHANGED", reason: "v2 blocks model calls" }
policy:        { original: "pb_ab12", current: "pb_99ff", status: "CHANGED" }
provider:      { original: "local-qwen", current: "local-qwen", status: "SAME" | "CHANGED" | "REMOVED" }
kernel_version:{ original: "kernel-0.1", current: "kernel-0.1", status: "SAME" }
memory:        { original: 3, current: 4, status: "CHANGED" }
```

## How Intent constraints / GEL / capabilities affect replay
Replay holds the recorded **Intent and Plan constant** (bound by hash) and re-runs the *policy*:
GEL is re-evaluated over the plan with the chosen bundle, and — if a registry is supplied — provider
eligibility is recomputed (M6). So a changed regulatory rule, a removed/unhealthy provider, or a
changed capability each shows up as a specific drift reason rather than an opaque mismatch.

## Ledger integrity is required first
When the full ledger is supplied (`options.ledger`), replay runs `verifyLedger` and **refuses**
(`REJECTED: ledger_unverified`) if the chain is broken. Even without the full chain, a single
tampered record fails its hash recompute and is rejected. **A tampered record cannot replay.**

## Replay never mutates history
Evidence is deep-cloned on capture; replay only reads. Tests assert the evidence and the ledger are
byte-identical before and after replay, and the ledger still verifies.

## How this supports enterprise audit & constitutional governance
- **Audit:** "show me that decision #N was legitimate under the policy in force at the time, and
  whether our current policy would still permit it" — exact + current replay answer both, with a
  signed, offline-verifiable trail.
- **Constitutional governance:** when a policy or provider changes, replay quantifies the blast
  radius — which past decisions would now drift, and exactly which rule/provider/capability/kernel
  change is responsible — without re-running any model or sending data anywhere.

## What was added to the kernel (additive)
Every DecisionRecord now records `kernel_version` (`kernel-0.1`) in its explanation, and the kernel
exports `KERNEL_VERSION`, so replay can detect kernel drift. This does not change any decision and is
backward-compatible — all prior suites and the real-browser proof still pass.

---

## Files
**New** — `core/replay/{evidence.js, replay-engine.js, index.js}`, `tests/run-replay.cjs` (20/20),
`docs/AUBS_DECISION_REPLAY_M7.md`.
**Modified** — `core/kernel/execute.js` (record + export `kernel_version`), `core/kernel/index.js`
(export it). **Untouched** — `aubs-app.html`, `sw.js`.

## Tests
`run-replay.cjs` **20/20** + full regression green: golden 16/16, citation 28/28, relevance 9/9,
grounding 8/8, memory 18/18, router 20/20, feel ✓, safety ✓, ledger 13/13, cac 22/22, gel 19/19,
kernel 23/23, kernel-chat 24/24, providers 28/28, provider-eligibility 24/24. Real-browser proof
still passes.
