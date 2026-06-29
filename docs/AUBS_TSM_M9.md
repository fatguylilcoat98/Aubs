# AUBS Typed Scoped Memory (TSM) — Milestone 9

**Branch:** `claude/aubs-tsm-m9` (base: `claude/aubs-openai-reference-m8`)
**Status:** additive, isolated. No UI changes, no breaking changes. The live app and the
on-device path are unchanged.

M9 transforms memory from a storage feature into a **constitutional subsystem**. Memory is no
longer a database or a cache — it is a **governed asset**. Every access is typed, scoped, owned,
provenanced, permissioned, recorded, and replayable. Nothing happens silently.

## Every memory answers
Who owns it (`owner`/`user_id`), who may read/write it (`scope`/`read_scopes` + permissions), who
granted access (grants), why it was used (DecisionRecord), when it was created/changed/expires
(`created_at`/`updated_at`/`expires_at`), and what evidence supports it (`evidence_refs`,
`provenance`).

## Memory types
`FACT`, `PREFERENCE`, `PROFILE`, `TASK`, `DOCUMENT`, `SUMMARY`, `SYSTEM`, `INFERENCE`.
- **Only `FACT` and `PREFERENCE` may be created automatically** (`captureAuto`).
- **`INFERENCE` is always marked `inferred: true`** and is **never silently promoted to fact** —
  even `write({type:"INFERENCE", inferred:false})` is forced back to `inferred:true`.

## Scope
`private`, `conversation`, `workspace`, `family`, `organization`, `device` (extensible). Every
memory carries a `scope`. **Cross-scope reads require explicit authorization** (a grant); without
one they are denied with `cross_scope_denied`.

## Provenance
Every memory records `provenance` — `timestamp`, `conversation_id`, `created_from` /
`decision_record`, `source` — plus `confidence` and a `source_classification`
(`user_stated` / `model_inferred` / `document` / `system` / `imported`). Every memory is traceable.

## Permission model
- **Reads** require GEL approval **and** scope approval (owner, in-scope, shared-scope, or an
  explicit grant). Expired memories are not readable.
- **Writes** require GEL approval, **schema validation**, and **ownership** (the actor must be the
  owner and subject — otherwise `ownership_violation`).
- **Deletes never physically erase.** A delete appends a deactivating version; supersession appends
  a new version with the **same `memory_id`** (latest-by-seq wins). **History always survives.**

## The memory service is the only access path
The kernel/app **request** memory; they never query storage directly. `read()` returns exactly:
```
{ ok, memories, reason, confidence, permission, denied, record }
```
`write()` returns `{ ok, memory, reason, permission, governance, record }`. Every read, write,
denial, and permission failure produces a **DecisionRecord** (`provider: "memory"`) in the ledger —
nothing is silent.

## Tamper-evident, append-only log
The memory log is append-only, hash-chained, and Ed25519-signed — the same construction as the M0
provenance ledger, verified by the same generic verifier (`verifyMemoryLog`). Mutating any stored
record fails verification.

## Replayable retrieval
A retrieval is replayable without altering history. `snapshotFromRead(readResult)` captures what was
returned (incl. the version hash); `compareMemory(snapshot, currentSnapshot, ctx)` later detects:
`memory_removed`, `memory_superseded`, `memory_scope_changed`, `memory_confidence_changed`,
`memory_permission_changed` — deterministically. This composes with M7: record verification proves
the decision was authentic; memory replay proves the memory inputs still reproduce.

## Modules (`core/memory/`)
| file | role |
|---|---|
| `types.js` | types, scopes, source classes; `AUTO_CREATABLE`, `ALWAYS_INFERRED` |
| `memory.schema.json` | the TSM record contract |
| `store.js` | append-only, signed, hash-chained log; `activeMemories` (latest-version, non-deleted); `historyOf` |
| `permissions.js` | `canRead` (scope/grant/expiry), `canWrite` (ownership) |
| `service.js` | the governed service — `write`/`read`/`captureAuto`/`inferFact`/`supersede`/`remove`/`snapshot`/`verify`; GEL-gated, ledger-recording |
| `replay-memory.js` | `snapshotFromRead` + `compareMemory` (drift) |
| `index.js` | entry point |

## What changed outside `core/memory/` (additive)
`memory_write` was added to the CAC plan `step_type` enum so memory operations are first-class,
governable plan steps (GEL fail-closed-validates the plans it evaluates, so the memory service
builds **valid** CAC plans via the builders). `core/browser-assets.js` was regenerated from the
schema. Both are backward-compatible — existing plans remain valid, the app never builds
`memory_write` steps, and the full regression + the real-browser proof confirm zero behavior change.

## What it is NOT (yet)
M9 defines the subsystem and proves it under the constitution. It does not wire memory into
`aubs-app.html` (no UI change) and does not replace the spine's lightweight on-device memory used by
the live phone path. The service already returns exactly what the kernel needs (`memories` + `reason`
+ `confidence` + `permission`), so wiring it behind a flag is a clean follow-up.

---

## Files
**New** — `core/memory/{types.js, memory.schema.json, store.js, permissions.js, service.js,
replay-memory.js, index.js}`, `tests/run-memory-tsm.cjs` (28/28), `docs/AUBS_TSM_M9.md`.
**Modified (additive)** — `core/cac/schemas/plan.schema.json` (+`memory_write`),
`core/browser-assets.js` (regenerated). **Untouched** — `aubs-app.html`, `sw.js`, the kernel,
providers, and replay sources.

## Tests
`run-memory-tsm.cjs` **28/28** — automatic FACT/PREFERENCE creation, inference tagging (never
promoted), cross-scope denial + grant, supersession with surviving history, logical delete,
ownership violations, schema failures, GEL-gated reads, governed DecisionRecords + ledger verify,
tamper verification, and replay drift (removed / superseded / scope / confidence / permission).
Full regression green (18 suites total). Real-browser proof still passes.
