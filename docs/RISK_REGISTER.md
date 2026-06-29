<!-- Phase B risk register. Companion to PHASE_B_ROADMAP.md and EXECUTION_ORDER.md.
     Two parts: (A) latent product risks carried from the Founder Acceptance pass, each
     truth-checked against the code and mapped to a roadmap item; (B) execution risks the
     Phase B work itself introduces. Planning only — no code, no defaults, no Pages. -->

# AUBS — Phase B Risk Register

Severity reflects **actual live blast radius**, not abstract code smell. Likelihood is for the live product as shipped today (HTTPS, flag‑OFF default, single user on device). Each risk names the roadmap item that retires it.

Severity: 🔴 blocker‑for‑promotion · 🟠 major · 🟡 minor · ✖ dismissed.
Testing to clear: 🔬 automated · 🌐 browser · 📱 real‑device · 🏛 architectural review.

## Part A — Carried risks (from `docs/FOUNDER_ACCEPTANCE.md`, re‑verified against code)

| ID | Risk | Verified finding | Severity | Likelihood | Mitigation (roadmap item) | Clears via |
|---|---|---|---|---|---|---|
| **R‑1** | `core/memory/service.js` `write()` → `appendMemory(...)` has no `.catch()`; a rejected append returns a rejected promise. | Real, but **TSM is not wired into live chat** (app + `local_chat` skill use no memory) — cannot break current chat. Must be fixed **before** IN‑1. | 🟠 (latent) | Med once wired | Add `.catch()` + denial record → **PH‑3** | 🔬🏛 |
| **R‑2** | `spine/ledger.js` `sha256hex()` calls `SUBTLE.digest` with no guard → throws without SubtleCrypto / non‑secure context. | Real. Production is HTTPS; pipeline **catches** append failures (`rec=null`) and chat continues; ledger silently disables. | 🟠 | Low (prod HTTPS) | Explicit guard + visible "provenance unavailable" → **PH‑1** | 🔬🌐📱 |
| **R‑3** | Lost/rotated signing key → split or unverifiable chain. | Key **is persisted and reused** (`aubs_ledger_keys`); records + key share storage fate. Split only on a *partial* wipe. | 🟡 (edge) | Low | Persist+pin public key; detect mid‑chain key change → **PH‑5** | 🔬 |
| **R‑4** | Concurrent `ensureLedger()` race spawns duplicate init/keys. | **Dismissed** — `_ledgerInit` is assigned synchronously before any `await` (correct promise gate); turns are serialized by `window.__busy`. | ✖ | — | none (no action) | — |
| **R‑5** | Unbounded ledger growth; O(n) verify; no rotation/GC. | Real. ~10 MB/10k turns; verify scales linearly. Append failure is caught (chat survives) but provenance silently stops near quota. | 🟠 | Med (long‑lived) | Signed checkpoint + rotation; bounded verify → **PH‑2** | 🔬🌐📱🏛 |
| **R‑6** | `private` scope is a capability token, not owner‑bound; `read()` returns `ok:true` even when all matches are permission‑denied. | Real but harmless single‑user; matters for multi‑user (family/org). Pipeline checks governance directly, not the aggregate flag. | 🟡 now / 🟠 multi‑user | Low now | All‑denied → `ok:false` (**PH‑3**); owner‑bind private reads (**EC‑4**) | 🔬🏛 |
| **R‑7** | Ledger init fails silently (private browsing, no IndexedDB) — user not told. | Real, by design ("chat unaffected"). | 🟡 | Med (private mode) | Surface a one‑time "provenance unavailable" notice → **PH‑1/PH‑6** | 🌐📱 |
| **R‑8** | Dogfood flag persisted in `localStorage` re‑enables a mode on next visit without re‑consent. | Real, low impact (flag‑mode is byte‑safe). | 🟡 | Low | Per‑session consent / explicit clear → **PH‑6** | 🌐📱 |

## Part B — Execution risks introduced by Phase B work

| ID | Risk | Trigger | Severity | Mitigation | Owner item | Clears via |
|---|---|---|---|---|---|---|
| **X‑1** | **Ledger rotation breaks backward verification** — a new chain/checkpoint format can't verify pre‑rotation records or an exported old ledger. | PH‑2 changes the record/chain shape. | 🔴 (for ledger promotion) | Versioned record format; migration that re‑anchors old records under a signed checkpoint; keep a verifier for both formats; golden‑file tests of old chains. | **PH‑2** | 🔬🏛 |
| **X‑2** | **Production bundle diverges from dev sources** — bundled build behaves differently from the 61‑script load. | PH‑4 introduces a build step. | 🟠 | Deterministic bundler from the same files; assert bundled globals == unbundled in a 🌐 proof; CI builds the bundle. | **PH‑4** | 🔬🌐 |
| **X‑3** | **Wiring TSM into chat regresses the flag‑OFF loop** — the live offline chat is no longer byte‑identical. | IN‑1 touches `send()`. | 🔴 (for IN‑1) | Strict flag gate (same pattern as M14); a flag‑OFF byte‑identical assertion; never call memory when the flag is off. | **IN‑1** | 🔬📱 |
| **X‑4** | **Governed memory leaks across scope/user** once memory feeds the prompt. | IN‑1 + EC‑4 expand read paths. | 🔴 (for multi‑user) | Owner‑bind private reads before multi‑user; 🏛 review of every read path; deny‑by‑default; provenance shows which memories entered the prompt. | **EC‑4**, IN‑1 | 🔬🏛 |
| **X‑5** | **External provider egress** sends user data off device under a misconfigured policy/eligibility. | EC‑3 enables a real cloud provider. | 🔴 (for cloud) | Default‑OFF; eligibility (M6) + GEL fail‑closed; explicit per‑turn egress **consent UX**; provenance records what left the device; 🏛 review before any flag is offered. | **EC‑3** | 🔬🌐📱🏛 |
| **X‑6** | **Tool/skill activation introduces a non‑fail‑closed path** — a tool runs without eligibility, or a skill escalates capability. | EC‑1/EC‑2 wire M10/M11 live. | 🟠 | Reuse the M10/M11 drift shields + eligibility unchanged; no live tool without eligibility; default‑OFF; 🏛 review. | **EC‑1/EC‑2** | 🔬🏛 |
| **X‑7** | **Default‑on promotion of router/grounding changes answers** users relied on. | IN‑2/IN‑4 propose default‑on. | 🟡 | Promotion only after device evidence + golden‑set non‑regression; staged flag rollout; one‑tap revert. | **IN‑4/IN‑2** | 🔬📱 |
| **X‑8** | **Verify cost UX** — a large chain makes "Verify integrity" feel slow (~1.5 s at 5k records today). | Growth before PH‑2 lands. | 🟡 | Incremental/checkpointed verify (PH‑2); show progress; verify since‑last‑checkpoint by default. | **PH‑2** | 🌐📱 |

## Promotion checklist (gate any default flip on ALL of these)
1. Item is **default‑OFF** and flag‑gated; flag‑OFF is **byte‑identical** to the working loop (🔬📱).
2. Fail‑closed verified: deny/error never runs the model and never fabricates an answer (🔬).
3. Exactly **one** DecisionRecord per turn; ledger verifies; tamper detected (🔬🌐).
4. No internal vocabulary in the no‑flag UX (📱).
5. For ledger/cloud/multi‑user: 🏛 architectural review signed off (X‑1, X‑4, X‑5).
6. Explicit founder **go** for the default flip and any Pages change.

## Overall posture
No **carried** risk blocks *starting* Phase B. The blocker‑severity risks are all **execution** risks (X‑1, X‑3, X‑4, X‑5) attached to specific outward items, and each is contained by the standing default‑OFF + fail‑closed + architectural‑review discipline. Land Wave 0 (PH‑1/PH‑2/PH‑3) before promoting the ledger or wiring TSM, and the rest of Phase B builds on a base that is already correct.
