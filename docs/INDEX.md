# AUBS Documentation Index

The AUBS constitutional runtime, documented in **One-Spine pipeline order**. Every governed
request flows through these stages; each doc covers one stage or subsystem.

> Models generate content · the kernel makes decisions · routing is deterministic, never an LLM.
> Truth · Safety · We Got Your Back.

## Constitutional pipeline (in order)

| # | Stage / subsystem | Doc | Flag (default) |
|---|---|---|---|
| M1 | **CAC** — Canonical AUBS Contract (Intent/Plan/Governance/Result/Failure schemas + builders) | [AUBS_CAC_M1.md](AUBS_CAC_M1.md) | — |
| M12 | **Planner** — the only producer of executable plans (deterministic DAG → CAC Plan) | [AUBS_PLANNER_M12.md](AUBS_PLANNER_M12.md) | — |
| M2 | **GEL** — Governance Enforcement Layer (policy decision, fail-closed) | [AUBS_GEL_M2.md](AUBS_GEL_M2.md) | — |
| M5 | **Providers** — adapter contract + registry + Drift Shield | [AUBS_PROVIDERS_M5.md](AUBS_PROVIDERS_M5.md) | — |
| M6 | **Provider Eligibility** — policy-governed provider selection | [AUBS_PROVIDER_ELIGIBILITY_M6.md](AUBS_PROVIDER_ELIGIBILITY_M6.md) | — |
| M8 | **OpenAI reference** — first real external provider (opt-in) | [AUBS_OPENAI_REFERENCE_M8.md](AUBS_OPENAI_REFERENCE_M8.md) | `FLAG_OPENAI` (off) |
| M3 | **Kernel** — governed local execution lifecycle | [AUBS_KERNEL_M3.md](AUBS_KERNEL_M3.md) | — |
| M4 | **Kernel-wrapped chat** — the live local chat behind the kernel | [AUBS_KERNEL_M4.md](AUBS_KERNEL_M4.md) | `FLAG_KERNEL_CHAT` / `?kernel=1` (off) |
| M9 | **Typed Scoped Memory (TSM)** — memory as a governed subsystem | [AUBS_TSM_M9.md](AUBS_TSM_M9.md) | — |
| M10 | **Tools (CTF)** — every external capability governed | [AUBS_CTF_M10.md](AUBS_CTF_M10.md) | — |
| M11 | **Skills** — declared, governed capabilities that compose providers/memory/tools | [AUBS_SKILLS_M11.md](AUBS_SKILLS_M11.md) | — |
| 3a | **Grounding** — Verified Grounding (Article 3a) + v2 candidate amendment | [AUBS_VERIFIED_GROUNDING_V2.md](AUBS_VERIFIED_GROUNDING_V2.md) | `FLAG_SPINE_GROUNDING_V2` / `?gv2=1` (off) |
| M0 | **Ledger** — tamper-evident, signed, hash-chained DecisionRecords | *(in M4 doc + `spine/ledger.js`)* | `FLAG_LEDGER` / `?ledger=1` (off) |
| M7 | **Decision Replay & Audit** — re-judge any record; verify ≠ replay | [AUBS_DECISION_REPLAY_M7.md](AUBS_DECISION_REPLAY_M7.md) | — |
| M13 | **Constitutional Integration ("One Spine")** — all subsystems as one pipeline + audit | [AUBS_CONSTITUTIONAL_INTEGRATION_M13.md](AUBS_CONSTITUTIONAL_INTEGRATION_M13.md) | — |

**Machine-readable artifact:** [constitution-graph.json](constitution-graph.json) — the canonical
13-stage dependency DAG (a cycle fails the architectural audit).

## Pipeline at a glance

```
Intent → CAC → Plan (M12) → GEL (M2) → Eligibility (M6) →
Execution (provider M5/M8 · tool M10 · deterministic) → Memory (M9) → Tools (M10) →
Grounding (3a/v2) → DecisionRecord → Ledger (M0) → Replay (M7) → Level 1 Explanation
```

## Default safety posture
All optional behavior is **default-OFF and opt-in**: `FLAG_KERNEL_CHAT`, `FLAG_SPINE_GROUNDING_V2`,
`FLAG_LEDGER`, `FLAG_ROUTER`, `FLAG_OPENAI`. The shipped app loads only the M0–M4 stack (spine,
ledger, CAC, GEL, kernel); providers/memory/tools/skills/planner/constitution are app-independent
test modules with no cloud or API-key path on-device.

## Archived documentation
Pre-constitutional design notes (conversation controller, fast engine, prompt builder, etc.) live
in [`docs/archive/`](archive/) — superseded by the M0–M13 stack, kept for history.
