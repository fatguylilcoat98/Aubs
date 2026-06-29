# AUBS Constitutional Planner (Execution Planner) — Milestone 12

**Branch:** `claude/aubs-planner-m12` (base: `claude/aubs-skills-m11`)
**Status:** isolated, additive. **No shared file changed**; no live app change. The planner is the
only producer of executable plans.

The planner converts a validated Intent into an executable plan using **only** constitutional
resources. The separation is mandatory:

> The planner decides **WHAT** should happen. The kernel decides **WHETHER** it may. The executor
> decides **HOW** it happens.

## What the planner may / may never do
**May:** decompose an intent, choose required skills, request providers/tools/memory, estimate risk,
egress, and required permissions. **Never:** execute providers/tools, read memory directly, bypass
GEL, bypass eligibility, or write DecisionRecords. The planner produces **data only** (asserted: no
`governance`, no `record`, no `result` on its output).

## Explicit planning DAG (`graph.js`)
Flat planning is replaced by an explicit directed acyclic graph. Each node has `node_id`,
`node_type`, `dependencies`, `required_resources`, `estimated_risk`, `estimated_egress`, `status`.
Node types: `MemoryRead`, `Retrieve`, `Skill`, `Tool`, `Provider`, `Deterministic`, `Answer`,
`Refusal`. New node types do not require a planner redesign.

## Skills describe; the planner composes
Skills (M11) stop producing plans directly — they **declare** capabilities (allowed
providers/tools/memory-scopes, permissions, risk). The planner expands a skill's declared resources
into DAG nodes (`MemoryRead` per scope, `Tool` per tool, `Provider` per provider, a `Skill` node
depending on them, an `Answer` terminal) and compiles a **CAC Plan** for the kernel to govern.

## Deterministic planning
Same Intent + same Context + same Config → **byte-identical** plan and graph hash. No randomness, no
timestamps in the graph; ids are derived structurally and clocks/ids are injectable
(`config.created_at`, `config.intent_id`, `config.plan_id`). The graph hash is structural (it
ignores the mutable `status` field).

## Fail-closed validation (`validateGraph`)
Rejects: `cycle`, `unknown_node_type`, `duplicate_id`, `orphan_node` (a non-root node nothing
depends on), `illegal_dependency` (a dependency on an undefined node), and — against the declared
skill + intent — `provider_conflict`, `tool_conflict`, `memory_conflict`, `permission_conflict`,
`resource_conflict` (a node's egress exceeding the intent's `max_egress`).

## Resource estimation (`estimate.js`)
Before execution, computed from graph state only: `required_providers`, `required_tools`,
`required_memory_scopes`, `required_permissions`, `max_egress`, `estimated_risk`, `node_count`,
`requires_network`, `uses_cloud`. These become planner metadata.

## Planning summary (`summary.js`) — graph-derived, never model-generated
> This request requires: 1 provider, 1 memory read. No network. No cloud. Low risk.

## DecisionRecord metadata (`record.js`)
The planner never writes records. `plannerRecordFields(plan)` produces the fields the **executor**
folds into the DecisionRecord — `planner_version`, `graph_hash`, `node_count`, `estimated_risk`,
`estimated_egress`, `resource_summary` — so there is no hidden planner state. (Tested by folding the
fields into a ledger record and verifying.)

## Replay the planner only (`replay-planner.js`)
`capturePlannerEvidence(plan, {intent, config})` + `replayPlanner(evidence, {context})` **rebuild the
DAG** (no execution) and compare **structurally** — never semantic guesses. Detects:
`planner_version_drift`, `planning_drift` (graph hash differs), `dependency_drift`, `resource_drift`,
`skill_drift` (e.g. a skill version bump is caught even when the graph hash is unchanged).

## Kernel remains authoritative
The planner only proposes. The compiled CAC Plan still passes through GEL — a planned plan can be
**denied** by policy (tested: the same plan is `allow` under the default bundle and `deny` under a
model-blocking bundle). Execution remains impossible without GEL approval.

---

## Files (all new)
`core/planner/{graph.js, estimate.js, summary.js, planner.js, record.js, replay-planner.js,
index.js}`, `tests/run-planner.cjs` (29/29), `docs/AUBS_PLANNER_M12.md`. **No file outside
`core/planner/` + `tests/` was modified.**

## Tests
`run-planner.cjs` **29/29** — deterministic planning (identical graph + hash twice), DAG composition,
resource estimation, planning summary, GEL-still-authoritative, no-planner-bypass, validation
(cycle / duplicate / illegal dependency / unknown type / orphan), conflict detection (provider /
tool / memory / permission / egress), structural graph hashing, planner DecisionRecord metadata,
and planner replay (MATCH / skill / planning / resource / dependency / planner-version drift). Full
regression green (**21 suites**). The real-browser proof is unaffected.

## How this completes the architecture
With the planner in place, the full constitutional pipeline is: **Intent → Planner (DAG + CAC Plan)
→ GEL → eligibility (providers M6 / tools M10 / memory M9 / skills M11) → kernel execution → signed
DecisionRecord (with planner metadata) → replay**. The planner is the single producer of plans;
everything downstream governs and records. Nothing bypasses the constitution.
