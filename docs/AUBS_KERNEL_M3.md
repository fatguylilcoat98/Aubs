# AUBS Kernel v0.1 — Milestone 3

**Branch:** `claude/aubs-kernel-m3` (base: `claude/aubs-gel-m2`)
**Status:** isolated, additive, the live app is unchanged.

The Kernel is the constitutional runtime that connects the three layers already built —
the Canonical AUBS Contract (CAC, M1), the Governance Enforcement Layer (GEL, M2), and the
tamper-evident Ledger (M0) — into one governed execution lifecycle. It runs **beside** the
working offline AI loop, not in place of it.

> **Invariant:** models generate content; the **kernel** makes decisions; routing is
> deterministic, never an LLM. No plan executes unless GEL returns `allow`.

---

## Lifecycle

```
intent text
   │
   ▼
CAC Intent ──► deterministic Plan ──► GEL.evaluate
                                          │
                         decision !== "allow"      decision === "allow"
                                │                         │
                                ▼                         ▼
                         CAC Failure            terminal kind of plan
                       (policy_denied,      ┌──────────┬───────────────┬────────────┐
                        no adapter call)    refusal   deterministic    model_call
                                │             │        _answer            │
                                │             ▼          ▼          local adapter.run()
                                │       CAC Failure   CAC Result    ok→Result / fail|throw→Failure
                                │      (unsafe_blocked)  (no model)        │
                                └─────────────┴───────────┴────────────────┘
                                              │
                                              ▼
                                   DecisionRecord appended to Ledger
                                   (EVERY terminal path, signed + hash-chained)
                                              │
                                              ▼
                                   Level 1 explanation (one sentence,
                                   derived from recorded state)
```

`executeIntent(intentInput, adapters, options)` returns:
`{ intent, plan, governance, result, failure, record, explanation, status, kind }`.

It is **deterministic** — all ids and timestamps are injectable via `options`
(`intent_id`, `plan_id`, `decision_id`, `result_id`, `failure_id`, `created_at`), so the
same input + pins + fresh ledger store yields byte-identical CAC objects.

---

## Modules (`core/kernel/`)

| File | Responsibility |
|------|----------------|
| `plan-builder.js` | `buildPlanForIntent(intent, opts)` — deterministic Plan, no model. Three kinds: `model_call`, `deterministic_answer`, `refusal`. `planTerminalKind(plan)` / `planLeftDevice(plan)` classify the plan. |
| `adapters.js` | Local adapter interface + deterministic test fakes (`localOkAdapter`, `localFailAdapter`, `localThrowAdapter`, `localSlowAdapter`, `makeSpyAdapter`). The **real** WebLLM-wrapping adapter is added later, behind a flag. |
| `explanation.js` | `level1(outcome)` — one honest sentence derived from `{decision, status, kind, left_device}`. Never invented from model output. |
| `execute.js` | `executeIntent(...)` — the lifecycle above. The only module that touches CAC + GEL + Ledger together. |
| `index.js` | Single entry point (Node `require` + browser `window.AUBS_KERNEL`). |

### Plan builder
- `model_call` → `[memory_read(user), model_call(local, egress:none)]` by default.
- `deterministic_answer` → `[deterministic_answer]` (precomputed, no model).
- `refusal` → `[refusal]`.
- `egress` defaults to `none`; `planLeftDevice` is therefore `false` for the local-first path.

### Adapter contract
```
run(plan, ctx) ->  { ok:true,  output_text, model_id, provider_id, grounding? }
               |   { ok:false, failure_type, message, recoverable }
               |   (may throw → kernel converts to CAC Failure model_error)
```

### Governance enforcement (the hard rule)
- The kernel **always** evaluates the plan through GEL. `allow` is mandatory.
- `deny`, `modify`, and `require_reauth` **all block in M3** and the adapter is **never called**
  (proven by `makeSpyAdapter().calls() === 0`).
- Blocked runs produce a CAC `Failure` of type `policy_denied`; `require_reauth` is marked
  `recoverable: true`.

### Ledger integration
- Every terminal path — allowed-success, allowed-failure, refusal, and policy-denied —
  appends one signed, hash-chained `DecisionRecord`.
- `execution_type` is `model` for executed model calls, `blocked` otherwise.
- `policy_version` carries the GEL `policy_bundle_hash`; the `explanation` field records the
  decision, winning rule, status, kind, and `left_device`.
- A ledger failure never crashes the kernel (append is wrapped; `record` falls back to `null`).
- `verifyLedger` passes over the records produced by a kernel session.

### Level 1 explanation
Derived purely from recorded state:
| Outcome | Sentence |
|---|---|
| denied | `Blocked by policy. Nothing left this device.` |
| refusal | `Refused for safety. Nothing left this device.` |
| failed | `Execution failed before an answer. Nothing left this device.` |
| executed (local) | `Answered locally. Nothing left this device.` |

---

## Tests — `tests/run-kernel.cjs` (23/23)

Covers: valid Intent + deterministic Plan; GEL `allow` → execute → CAC `Result`; GEL `deny`
→ blocked with adapter **never called**; `require_reauth`/`modify` block; adapter
returned-failure and **thrown** failure → CAC `Failure`; `deterministic_answer` and `refusal`
plan kinds; every terminal path writes a record; ledger **verifies** after the run; all four
Level 1 sentences; full-path determinism (same pins + fresh stores → identical objects); and
produced `Result`/`Failure` validate against CAC.

### Full regression (all suites green)
```
run-golden            16/16     run-feel              pass
run-citation-harness  28/28     run-safety            pass
run-relevance-spike    9/9      run-ledger            13/13
run-grounding-verify   8/8      run-cac               22/22
run-memory-extraction 18/18     run-gel               19/19
run-router            20/20     run-kernel            23/23
```

---

## What did NOT change
- `aubs-app.html` — untouched. `git status` shows only new `core/kernel/` + `tests/run-kernel.cjs`.
- The offline WebLLM loop, the service worker, the spine, and every flag default are unchanged.
- No live behavior is altered; the kernel is not yet wired into the app.

## Is the kernel ready to wrap the offline loop behind a flag?
**Yes.** The lifecycle, governance gate, ledger integration, and explanation layer are proven
against deterministic fakes. The remaining step (a future milestone) is a single real adapter
that calls the in-browser WebLLM loop inside `adapter.run(plan, ctx)`, switched on behind a
default-OFF flag — exactly mirroring how the fakes are injected here. The sacred offline loop
stays untouched until that flag is deliberately turned on.
