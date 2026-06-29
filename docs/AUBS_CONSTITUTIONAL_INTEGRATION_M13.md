# AUBS Milestone 13 — Constitutional Integration ("One Spine")

**Branch:** `claude/aubs-constitutional-integration-m13` (base: `claude/aubs-grounding-v2`)
**Status:** isolated, additive. **No shared file changed** — the app, kernel, CAC, GEL, providers,
memory, tools, skills, planner, replay, and spine sources are all untouched. No UI/behavior change.

This is an **integration** milestone, not a feature. Every subsystem is individually tested; M13
proves they operate as **one constitutional pipeline** where nothing can bypass another subsystem.

## The single pipeline (`core/constitution/pipeline.js`)
`runConstitutionalRequest(request, options)` executes one complete request through every stage **in
order**, each consuming the previous stage's output, **reusing each subsystem's pure decision
functions** (no duplicated logic), and writing **exactly one DecisionRecord**:

```
Intent → CAC Intent → Deterministic Plan (planner M12) → GEL Decision →
Provider Eligibility (M6) → Kernel Execution (provider M5 / tool M10 / deterministic) →
Memory Access (M9) → Tool Access (M10) → Grounding Verification (spine 3a/v2) →
DecisionRecord → Ledger Append (M0) → Replay Evidence (M7) → Level 1 Explanation
```

Sub-executors are invoked **without a ledger store**, so the pipeline is the *only* provenance
writer — exactly one record per request. Nothing executes before GEL; nothing bypasses
eligibility or permissions.

## Integration coverage (`tests/run-constitution.cjs` — 24/24)
**9 end-to-end scenarios**, each finishing with exactly one DecisionRecord:
normal local answer · blocked by GEL · blocked by provider eligibility · blocked by memory
permissions · blocked by tool permissions · replay a historical decision · verify ledger · verify
grounding · explanation generated.

**10 constitutional assertions:** a model can never execute before GEL · a provider cannot execute
without eligibility · memory cannot bypass permissions · tools cannot bypass permissions · replay
never executes a model · verification never modifies history · grounding never bypasses replay
evidence · every execution writes exactly one DecisionRecord · every DecisionRecord is replayable ·
every replay references the same ledger record.

### Two real integration gaps found and fixed
Building the One Spine surfaced a cross-subsystem leak the isolated suites could not: the pipeline's
provider eligibility evaluated the **whole registry** and selected the lowest-id eligible provider,
**ignoring the skill's declared `allowed_providers`**. A skill that requested only a cloud provider
would silently run a different local provider. **Fix:** the pipeline now restricts provider
eligibility to the skill's `allowed_providers` (`filterRegistry`), so a skill's capability boundary
is honoured end to end. This is exactly the class of bug integration testing exists to catch.

## Machine-readable dependency graph
The canonical 13-stage DAG is emitted to **`docs/constitution-graph.json`** (`graphHash g_49324236`).
It reuses the M12 graph validator, so **introducing a cycle fails the audit** (asserted: a back-edge
from `Intent → Explanation` yields a `cycle` error). There are no alternate paths.

## Architectural audit (`core/constitution/audit.js`) — report
All checks pass:

| check | result |
|---|---|
| no_circular_dependencies | ✔ pipeline DAG is acyclic |
| no_kernel_bypass | ✔ GEL precedes eligibility & execution; ledger precedes replay; explanation last |
| no_duplicate_provenance_writer | ✔ 1 definition of `appendRecord` |
| no_duplicate_policy_decider | ✔ 1 definition of `evaluate(plan, bundle)` (GEL) |
| no_duplicate_replay_path | ✔ 1 definition of `replay(evidence)` |
| no_duplicate_memory_permission | ✔ 1 definition of `canRead` |
| no_duplicate_tool_permission | ✔ 1 definition of `hasPermissions` |
| no_duplicate_grounding | ✔ 1 definition of `tagAnswer` |

The audit statically scans `core/` + `spine/` and **fails if any constitutional primitive is
forked** (more than one definition). It also runs a per-request runtime audit (`auditRun`) asserting
exactly one DecisionRecord and at most one GEL decision / provider run per request.

## Constitutional path report — "Explain Constitution"
`explainConstitution(trace)` prints the exact path a request followed, from recorded state only
(developer command, not UI). Example (S1, normal local answer):

```
Intent
↓ CAC (intent_…)
↓ Plan (graph g_… · 4 nodes)
↓ GEL (allow)
↓ Eligibility (selected local-echo)
↓ Memory (read 1)
↓ Tools (not required)
↓ Execution (provider local-echo)
↓ Grounding (general)
↓ DecisionRecord (…)
↓ Ledger (appended seq 0)
↓ Replay (evidence captured)
↓ Explanation (Answered locally. Nothing left this device.)
↓ Done
```

## Results
- **Integration suite:** `run-constitution.cjs` **24/24**.
- **Full regression:** **24 suites green** — golden 16, citation 28, relevance 9, grounding-verify
  8, memory-extraction 18, router 20, feel ✓, safety ✓, ledger 13, cac 22, gel 19, kernel 23,
  kernel-chat 24, providers 28, provider-eligibility 24, replay 20, openai 27, memory-tsm 28, tools
  36, skills 26, planner 29, grounding-v2 16, grounding-v2-evidence ✓, constitution 24.
- **Browser proof:** passes (the app loads none of this; live behavior unchanged).
- **Device proof:** not applicable — no app change; the on-device path is byte-identical and was not
  modified by this milestone. The existing `?kernel=1` device route is unaffected.

## Files
**New (all):** `core/constitution/{pipeline.js, graph.js, audit.js, explain.js, index.js}`,
`tests/run-constitution.cjs`, `docs/AUBS_CONSTITUTIONAL_INTEGRATION_M13.md`,
`docs/constitution-graph.json`. **No file outside `core/constitution/` + `tests/` + `docs/` was
modified.**

## Recommendation for merge readiness
**Ready to merge as a draft-reviewed integration layer.** It is purely additive, changes no live
behavior, touches no shared file, and is fully governed and tested (24/24 + a green 24-suite
regression + browser proof). The integration *found and fixed a genuine cross-subsystem bug* (skill
`allowed_providers` not honoured by pipeline eligibility), which is the strongest evidence that the
One-Spine harness does its job. As with the rest of the stack, the constitution pipeline is **not
wired into the live app** — adoption on-device remains a separate, flag-gated step. Recommend
merging the integration milestone into the stack (still no production default change), and keeping
the `runConstitutionalRequest` orchestrator behind the same opt-in posture as the kernel path until a
deliberate device-enablement milestone.
