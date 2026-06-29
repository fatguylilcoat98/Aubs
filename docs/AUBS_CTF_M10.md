# AUBS Constitutional Tool Framework (CTF) — Milestone 10

**Branch:** `claude/aubs-tools-m10` (base: `claude/aubs-tsm-m9`)
**Status:** isolated, additive. **No shared file changed** — `aubs-app.html`, `sw.js`, the kernel,
CAC, providers, and memory sources are all untouched. The offline runtime is unaffected.

M10 makes every external capability a **governed constitutional resource**: files, email, calendar,
shell, camera, microphone, web search, MCP servers, databases, future APIs. None are called
directly — everything goes through the constitution.

> **Models never execute tools. The kernel authorizes tools. The model may REQUEST; the kernel
> DECIDES.**

```
request → CAC Intent → Plan(tool_call) → GEL → Tool Eligibility →
   (allow & eligible? run the DECLARED op behind the Drift Shield : block) →
   normalized CAC Result (ok / blocked / error / partial) → DecisionRecord → Replay
```

## Tool contract (`tool.schema.json` + Drift Shield)
Every tool exposes:
`tool_id`, `tool_type`, `version`, `permissions_required[]`, `requires_network`,
`requires_user_confirmation`, `supported_operations[]`, `healthCheck()`, `execute()`, `metadata()`.
**No tool may expose arbitrary methods** — only its declared `supported_operations`. The Drift
Shield validates the contract at registration and the result at runtime, and **fails closed**.

## Tool registry (`registry.js`) — fails closed
`registerTool` / `removeTool` / `getTool` / `listTools` / `validateTool`. Rejects duplicate ids,
invalid contracts, missing metadata, empty operations, unknown permissions, bad types. `listTools`
is deterministic (sorted by id). `describe()` is a data-only view for inspection.

## Permission categories (`permissions.js`)
`filesystem.read|write|delete`, `calendar.read|write`, `contacts.read`, `camera.capture`,
`microphone.capture`, `network.http|websocket`, `shell.execute`, `database.query` — extensible.
Camera/microphone map to required **device capabilities**; `network.*` and `requires_network` map
to **network availability**.

## Tool eligibility engine (`eligibility.js`) — mirrors provider eligibility
A tool may run an operation only if **all** hold; otherwise an explicit reason:
`policy_denied`, `tool_invalid`, `tool_disabled`, `unknown_operation`, `permission_denied`,
`network_unavailable`, `device_capability_missing`, `user_confirmation_required`, `tool_unhealthy`.
Health is the last gate (only checked if nothing else disqualifies). **No eligibility, no execution.**

## Execution returns normalized CAC Results only
Never raw tool output. Every execution is exactly one of: **success** (`ok`), **blocked**
(`blocked`), **failure** (`error`), **partial** (`partial`). A blocked tool **never runs** (proven
with a spy whose call-count stays 0). A throw, malformed result, or undeclared operation fails
closed.

## DecisionRecords — classifications only, no secrets
Each tool execution records: `tool_id`, `tool_type`, `tool_version`, `operation`, `permission_set`,
`arguments_classification`, `result_classification`, `execution_time_ms`, `approval_path`,
`network_used`, `requires_user_confirmation`, `eligibility_reasons`. **Arguments are classified by
shape, never stored by value** (e.g. `{path:"/secret/…"}` → `object{1}`, asserted absent from the
record). `execution_type: "tool"`, `provider: <tool_id>`.

## Explainability — from recorded state, never an LLM
`explanation.toolWhy(record)` renders: tool used, why permitted, which permission allowed it,
whether the network was used, whether user approval was required — entirely from the DecisionRecord.

## Replay (`replay-tool.js`) — no side effects, no re-execution
`captureToolEvidence(execResult)` + `compareTool(evidence, { registry, currentBundle })` detect:
`tool_removed`, `permission_changed`, `tool_version_changed`, `operation_removed`, `health_changed`,
`policy_drift` — **without ever calling `execute()`**. Composes with M7 (record verification proves
authenticity).

## Reference tools (fakes only — prove execution, not functionality)
`fs.read` (filesystem), `fs.write` (needs confirmation), `calendar`, `http` (needs network), `shell`
(needs confirmation), plus failing / drift / throwing / unhealthy / partial fakes. **No real side
effects** — each returns deterministic, classified output.

---

## Files (all new)
`core/tools/{tool.schema.json, permissions.js, drift-shield.js, registry.js, eligibility.js,
fake-tools.js, execute.js, explanation.js, replay-tool.js, index.js}`, `tests/run-tools.cjs`
(36/36), `docs/AUBS_CTF_M10.md`. **No file outside `core/tools/` + `tests/` was modified.**

## Tests
`run-tools.cjs` **36/36** — registration validation, permission denial/approval (tool never runs
when blocked), GEL deny, unknown operation, user-confirmation gating, network/device gating, health
failure, success/blocked/failure/partial outcomes, drift/throw fail-closed, DecisionRecord
classifications (no secret leakage), ledger verify, `toolWhy` explainability, and replay drift
(removed / permission / version / operation / health / policy). Full regression green (**19 suites**).
The real-browser proof is unaffected (the app loads none of this).

## How future tools / MCP servers follow this pattern
Implement one adapter satisfying the contract (declare `supported_operations` + `permissions_required`,
keep secrets out of results, return a normalized status). The registry validates it, eligibility +
GEL + the Drift Shield govern it, the ledger records it, and replay audits it — no kernel changes,
no exceptions.
