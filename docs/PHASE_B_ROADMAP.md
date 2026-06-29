<!-- Phase B roadmap, derived from docs/FOUNDER_ACCEPTANCE.md. Planning only — no features
     built, no defaults flipped, no Pages change. Item IDs are stable and shared across
     PHASE_B_ROADMAP.md, EXECUTION_ORDER.md, and RISK_REGISTER.md. -->

# AUBS — Phase B Roadmap

**Source:** `docs/FOUNDER_ACCEPTANCE.md` (post‑M14 product validation).
**Premise:** the constitutional foundation is complete, correct, fail‑closed, tamper‑evident, and adds <1 ms/turn. Phase B **wires and hardens** subsystems that already exist and ship outward — it does **not** introduce new architecture. Everything below stays **default‑OFF / flag‑gated** until its category gate is met.

**Foundation already built (do not rebuild):** CAC · GEL · Kernel · Provider framework (M5) + eligibility (M6) + governed external ref (M8) · Replay/Audit (M7) · Typed Scoped Memory (M9) · Constitutional Tools (M10) · Skills (M11) · Planner (M12) · One‑Spine integration (M13) · Constitutional Chat path (M14) · Verified Grounding v2 (candidate, default OFF).

## Categories
- **Production Hardening (PH)** — make the ledger/memory/runtime safe to rely on and to promote toward default‑on.
- **User Experience (UX)** — remove internal vocabulary leaks and make failure/feedback feel finished.
- **Intelligence (IN)** — wire the already‑tested intelligence subsystems (memory, grounding, planner, router) into the governed live experience.
- **Ecosystem (EC)** — outward platform surfaces (tools, skills, external providers, multi‑user, portability) built on the foundation.

## Priority key
**P0** blocks promoting ledger/TSM toward default‑on · **P1** product polish + decisions that unblock outward work · **P2** core Phase‑B value · **P3** expansion.

## Testing key
🔬 automated · 🌐 browser · 📱 real‑device · 🏛 architectural review.

---

## Production Hardening

| ID | Item | Source | Priority | Risk | Testing | Depends on |
|---|---|---|---|---|---|---|
| **PH‑1** | Ledger durability: explicit `SubtleCrypto` guards in `sha256hex`/sign; replace silent ledger‑disable with a user‑visible **"provenance unavailable"** state | R‑2, R‑7 | **P0** | Low | 🔬🌐📱 | — |
| **PH‑2** | Ledger scaling: **signed checkpoint + rotation**; bounded / incremental verify (today verify is O(n), storage unbounded) | R‑5, perf #1 | **P0** | **Med‑High** | 🔬🌐📱🏛 | — |
| **PH‑3** | Memory‑service hardening: add `.catch()` on `appendMemory`; make all‑denied reads return `ok:false` (not `ok:true, []`) | R‑1, R‑6 | **P0** | Low | 🔬🏛 | — |
| **PH‑4** | Production bundling of the constitutional stack into one file (keep per‑module dev sources); 61 script tags → 1 | perf #2 | **P1** | Low‑Med | 🔬🌐📱 | — |
| **PH‑5** | Key resilience: persist + pin the public key; on verify, detect a mid‑chain key change instead of silently marking "unsigned" | R‑3 | **P2** | Low | 🔬 | PH‑2 |
| **PH‑6** | Flag lifecycle: per‑session consent / explicit clear for dogfood flags (`?spine`, `?kernel`, `?ledger`, …) | R‑8 | **P2** | Low | 🌐📱 | — |

## User Experience

| ID | Item | Source | Priority | Risk | Testing | Depends on |
|---|---|---|---|---|---|---|
| **UX‑1** | User‑safe error strings — no raw GPU diag / `finish` / model id in the chat bubble; diagnostics to console only | UX §3 (major) | **P1** | Low | 📱🌐 | — |
| **UX‑2** | Replace the internal build string (`cp0‑…‑governed‑local`) shown to all users with a plain version label | UX §3 (major) | **P1** | Low | 📱 | — |
| **UX‑3** | Flag‑mode governance strings → human language ("decision: allow · record #5", "Constitution path error" → friendly); internals to console | UX §3 (major, flag‑gated) | **P1** | Low | 📱 | — |
| **UX‑7** | **Founder decision:** Glass Box "Why?" default visibility — keep as transparency vs gate behind an Advanced toggle (pre‑existing Article 6, not an M14 regression) | UX §3 (decision) | **P1** | Low | — (decision) | — |
| **UX‑4** | Generic console prefix `[AUBS]`; gate verbose architecture logs behind an explicit debug flag | UX §3 (minor) | **P2** | Low | 🌐 | — |
| **UX‑5** | Recovery + tamper messaging: animate/soften "Reconnecting…"; give the tamper toast a next step | UX §3 (minor) | **P2** | Low | 📱 | — |
| **UX‑6** | Micro‑polish: more‑visible thinking dots; single confirm for clear‑memories/clear‑history; instant download‑start feedback | UX §3 (polish) | **P3** | Low | 📱🌐 | — |

## Intelligence

| ID | Item | Source | Priority | Risk | Testing | Depends on |
|---|---|---|---|---|---|---|
| **IN‑1** | Wire **TSM into the constitutional chat path** — governed memory read feeds the prompt so answers can be grounded; flag‑gated, flag‑OFF byte‑identical | Acceptance "TSM not wired" + R‑1/R‑6 | **P2** | Med | 🔬📱🏛 | PH‑3 |
| **IN‑2** | Surface **grounding** through the constitutional path (tag today; Verified Grounding v2 candidate, default OFF) so grounded answers cite memory | Grounding v2 (candidate) | **P2** | Med | 🔬📱 | IN‑1 |
| **IN‑4** | Response Quality Layer (router v1, default OFF) — define evaluation + criteria for default‑on; measure on device | FLAG_ROUTER (exists) | **P2** | Med | 🔬📱 | — |
| **IN‑3** | Multi‑step constitutional planner in chat (planner M12 is single‑skill in the live path today) | Planner M12 | **P3** | Med‑High | 🔬🏛 | IN‑1 |

## Ecosystem

| ID | Item | Source | Priority | Risk | Testing | Depends on |
|---|---|---|---|---|---|---|
| **EC‑1** | Activate the Constitutional Tool Framework (M10) in the live path behind a flag (governed tools) | Tools M10 | **P3** | Med | 🔬🌐📱🏛 | UX‑3, PH‑4 |
| **EC‑2** | Activate the Skills Framework (M11) beyond the built‑in `local_chat` | Skills M11 | **P3** | Med | 🔬📱🏛 | EC‑1 |
| **EC‑3** | Governed **external provider** path (M8 OpenAI ref, default OFF) — eligibility + **egress consent UX** for real cloud | Providers M8 | **P3** | **High** | 🔬🌐📱🏛 | PH‑1, PH‑2, UX‑3 |
| **EC‑4** | Multi‑user readiness: owner‑bind `private` reads; family/org scope semantics | R‑6 | **P3** | **High** | 🔬🏛 | PH‑3, IN‑1 |
| **EC‑5** | Ledger portability: signed export/import + standalone offline verifier | perf #1 / R‑5 | **P3** | Med | 🔬🌐 | PH‑2 |

---

## Category gates (a category cannot promote any item toward default‑on until its gate is met)
- **Ledger default‑on gate:** PH‑1 **and** PH‑2 complete; ledger verifies under rotation + simulated quota in a real browser; verify cost bounded.
- **Memory/TSM‑in‑chat gate:** PH‑3 complete; no unhandled rejection paths; IN‑1 proven flag‑OFF byte‑identical.
- **Outward UX gate:** UX‑1/2/3 complete; a no‑flag device pass shows **zero** internal vocabulary.
- **Ecosystem gate:** the surface is default‑OFF, governed end‑to‑end, and has passed 🏛 architectural review (egress, permissions, fail‑closed).

## Out of scope for Phase B (parked)
Cross‑device sync/CRDT, server components, account systems, and any cloud default. These depend on EC‑3/EC‑4 landing first and on an explicit founder decision about leaving the device.
