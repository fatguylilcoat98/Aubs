# AUBS Constitutional Skills Framework — Milestone 11

**Branch:** `claude/aubs-skills-m11` (base: `claude/aubs-tools-m10`)
**Status:** isolated, additive. **No shared file changed** — the app, kernel, CAC, providers,
memory, and tools sources are untouched. No live app behavior change.

A skill is **not** hard-coded behavior. A skill is a **declared, governed capability** that can
request providers (M5/M6), memory (M9), and tools (M10) — through the constitution. Models do not
own skills; plugins do not bypass policy; the kernel governs every step.

> A skill may describe work, request resources, and produce a plan — but a skill **never** directly
> executes providers, memory, or tools. **Only the kernel executes.**

```
request → CAC Intent → Plan(declared resource steps) → GEL → Skill Eligibility
   (manifest valid + GEL allow + every required provider/tool/memory-scope eligible +
    network + user-confirmation + permitted risk) →
   (eligible? run the deterministic skill : block) →
   CAC Result (ok / blocked / error / partial) → DecisionRecord → Replay
```

## Skill manifest (`skill.schema.json`)
Every skill declares: `skill_id`, `name`, `version`, `description`, `inputs`, `outputs`,
`required_permissions`, `allowed_tools`, `allowed_providers`, `allowed_memory_scopes`,
`requires_network`, `requires_user_confirmation`, `risk_level` (`low|medium|high|critical`),
`supported_operations`, `metadata`. The runtime `execute()` is validated structurally (deterministic;
no dynamic code).

## Registry (`registry.js`) — fails closed
`registerSkill` / `removeSkill` / `getSkill` / `listSkills` / `validateSkill`. Rejects duplicate
ids, invalid manifests, undeclared permissions (must be tool permission categories), unknown tools
and providers (cross-checked against the supplied registries), unknown memory scopes, and missing
operations. `listSkills` is deterministic (sorted by id).

## Skill eligibility (`eligibility.js`) — composes M6 + M10 + M9
A skill is eligible only if **all** hold, else an explicit reason and the offending resource is
recorded as blocked:
- manifest valid + GEL `allow` (`policy_denied`),
- **every** required provider is eligible per provider eligibility (`provider_denied` / `unknown_provider`),
- **every** required tool is eligible per tool eligibility (`tool_denied` / `unknown_tool`),
- every allowed memory scope is permitted by the context (`memory_scope_denied`),
- network requirement satisfied (`network_unavailable`),
- user confirmation satisfied (`user_confirmation_required`),
- risk level within the permitted maximum (`risk_level_denied`).

## Execution model (M11 = deterministic fakes)
No LLM-authored plans, no dynamic/arbitrary code. A skill returns a deterministic CAC Result (the
kernel builds the plan and governs it first). If any required resource is ineligible, the skill is
**blocked** and `execute()` is never called. Execution returns a normalized CAC Result only —
`ok / blocked / error / partial`.

## DecisionRecords — classifications only, no secrets
Each skill run records: `skill_id`, `skill_version`, `operation`, `risk_level`,
`required_resources`, `approved_resources`, `blocked_resources`, `required_permissions`,
`result_classification`, `approval_path`, `requires_user_confirmation`, `left_device`,
`eligibility_reasons`. Raw inputs and payloads are **never** stored (asserted: a `url`/secret input
does not appear in the record). `execution_type: "skill"`.

## Explainability — from recorded state, never an LLM
`explanation.skillWhy(record)` renders: skill used, resources requested / approved / blocked, the
policy decision, whether anything left the device, and whether confirmation was required.

## Replay (`replay-skill.js`) — no re-run, no side effects
`captureSkillEvidence(execResult)` + `compareSkill(evidence, { registry, currentBundle })` detect:
`skill_removed`, `skill_version_changed`, `permissions_changed`, `provider_requirement_changed`,
`tool_requirement_changed`, `memory_scope_requirement_changed`, `policy_drift` — without re-running
the skill. Composes with M7 (record verification proves authenticity).

## Reference fake skills (no side effects)
`summarize_note` (local provider + private memory), `local_fact_answer` (memory only),
`calendar_lookup` (calendar tool), `http_fetch_summary` (http tool + cloud provider, network,
medium risk), `shell_status_check` (shell tool, needs confirmation, high risk). Each **declares**
its real resource requirements; the implementation is canned and deterministic.

---

## Files (all new)
`core/skills/{skill.schema.json, registry.js, eligibility.js, execute.js, explanation.js,
replay-skill.js, fake-skills.js, index.js}`, `tests/run-skills.cjs` (26/26),
`docs/AUBS_SKILLS_M11.md`. **No file outside `core/skills/` + `tests/` was modified.**

## Tests
`run-skills.cjs` **26/26** — registration validation (duplicate / invalid manifest / unknown
permission / tool / provider / memory scope), GEL deny, memory-scope/tool/provider/risk/confirmation
denials each blocking the skill, valid execution + DecisionRecord, network skill leaving the device,
no-secret records, ledger verify, `skillWhy` explainability, and replay drift (removed / version /
permissions / policy). Full regression green (**20 suites**). The real-browser proof is unaffected
(the app loads none of this).

## How real skills follow this pattern (future)
Author a manifest that declares exactly which providers/tools/memory-scopes/permissions the skill
needs, keep the implementation deterministic (or have it return a CAC Plan for the kernel to execute),
and register it. The registry validates it, eligibility composes provider + tool + memory governance,
the ledger records it, and replay audits it — no kernel changes, no exceptions. Dynamic plugins, a
marketplace, user-installed code, remote downloads, and LLM-generated plans remain explicit
non-goals.
