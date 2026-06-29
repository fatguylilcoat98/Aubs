<!-- AUBS Founder Acceptance Phase (post-M14). Product-validation milestone, not a feature
     milestone. Evidence-backed where executable; device-only items are marked as such. -->

# AUBS — Founder Acceptance Report (Post‑M14)

**Date:** 2026‑06‑29 · **Branch:** `claude/aubs-constitution-chat-m14` · **Build:** `cp0-constitution-chat-m14 · governed-local`
**Scope:** validate that the constitutional runtime behaves like a polished product. No features built. No defaults flipped. No Pages change.

**Verdict (one line):** The constitutional foundation is **stable enough to build outward from**. There are **no hard blockers** — flag‑OFF is byte‑identical to today's working app, and the flagged constitutional path is fail‑closed, writes exactly one tamper‑evident record per turn, and recovers honestly from every failure tested. Three robustness items and one product decision should be resolved **before** the ledger or TSM are promoted toward default‑on.

### How this was validated (truthfulness note)
- **Executable evidence (run here):** the full 25‑runner test suite, a dedicated end‑to‑end acceptance harness exercising the real modules across all six areas, a full‑stack headless‑Chromium proof, and direct performance instrumentation.
- **Device‑only (NOT run here — needs your phone + the real WebLLM model on the Adreno GPU):** time‑to‑first‑token, total response time, browser cold‑load, real IndexedDB growth under load, and whether the model's prose *feels* natural. Headless runs use an instant fake `generate()` so reported timings isolate **constitutional overhead**, not inference. These are flagged ⟦DEVICE⟧ throughout.

---

## 1. Founder Acceptance Checklist & Results

Legend: ✅ verified here · ⟦DEVICE⟧ needs phone · ⚠️ verified with a caveat

### Conversation (constitutional path, `?spine=1`)
| Check | Result | Evidence |
|---|---|---|
| Greetings / closers | ✅ | "hey there" / "thanks!" route through pipeline, allowed, answered |
| Multi‑turn discussion | ✅ | 5‑turn convo: all allowed+answered, 5 records, ledger verifies |
| Topic switching | ✅ | "ignore that — tell me a joke" handled as a normal turn |
| Long conversations | ✅ | **50 turns → 50 records, hash chain verifies end‑to‑end** |
| Corrections / follow‑ups | ✅ | follow‑up + correction turns each produce one clean record |
| Interruptions | ⚠️ | serialized by `window.__busy` (one turn at a time) — no concurrent‑turn corruption; rapid taps are safely ignored, see UX §2 |
| Natural feel of replies | ⟦DEVICE⟧ | depends on the real model; not measurable headless |

### Memory (TSM)
| Check | Result | Evidence |
|---|---|---|
| Store facts | ✅ | FACT + PREFERENCE writes succeed, signed into the memory log |
| Retrieve facts | ✅ | query "dog" → correct content returned |
| Refuse incorrect retrieval | ✅ | irrelevant query → `hits=0, reason=no_match` (no fabricated hit) |
| TSM permissions | ⚠️ | owner reads own private memory; cross‑*scope* denied. **Note:** `private` is a *capability scope*, not per‑owner — an actor holding the `private` scope reads private memories. Correct for a single‑user device; needs owner‑binding for multi‑user (see Risks R‑6, Phase B). |
| Supersession | ✅ | same `memory_id` new version → latest wins, **old version retained in history** (live=2, log=3) |
| Replay / verify | ✅ | memory log verifies (signed, append‑only); decision ledger verifies |
| **Wired into live chat?** | ❌ **No** | the live app and the M14 `local_chat` skill use **no** memory scopes; TSM is tested‑but‑unwired. This bounds the blast radius of all memory‑layer risks. |

### Governance
| Check | Result | Evidence |
|---|---|---|
| Allow | ✅ | `decision=allow`, model runs, "Answered locally. Nothing left this device." |
| Deny | ✅ | `decision=deny`, **model called 0×**, honest "I can't run that under your current policy.", `execution_type=blocked` |
| Require re‑auth | ✅ | **model called 0×**, "You'll need to re‑authenticate before I can run that." |
| Failure paths | ✅ | empty/throw → `status=error`, honest message, no fabricated answer |
| Honest explanations | ✅ | every terminal message derives from recorded state, never from model output |
| **Fail‑closed** | ✅ | deny & reauth **never** reach the model; no path observed where a blocked turn runs or invents text |

### Provenance
| Check | Result | Evidence |
|---|---|---|
| Exactly one DecisionRecord per turn | ✅ | `counters.records===1` on every terminal path (allow/deny/reauth/fail); 50‑turn chain = 50 records |
| Ledger integrity | ✅ | clean chain verifies; **1‑byte tamper → detected** (`verifyLedger.ok===false`) |
| Hash chain | ✅ | `prev_hash`/`record_hash` link every record; Ed25519 `signature` present |
| Replay | ✅ | replay evidence captured against the single record on allowed turns |
| "Why?" explanation | ✅ | Level‑1 string from recorded state (e.g. "Answered locally. Nothing left this device.") |
| Grounding | ✅ | no memory in prompt → `general` (honest; doesn't claim grounding it doesn't have) |
| **Privacy of records** | ✅ **positive finding** | records store **`input_hash`/`output_hash`, not raw text** — provenance is verifiable without storing message contents |

### Failure testing
| Attempt | Result |
|---|---|
| Malformed (empty text) | ✅ did not crash; clean terminal state |
| Oversized prompt (~250k chars) | ✅ one record written; pipeline overhead 3.7 ms (governance is not the bottleneck) |
| Engine restart / model failure (throw) | ✅ caught → honest failure, one record (the live app also auto‑recovers the engine once before failing) |
| Browser refresh | ⚠️ history + memory persist (localStorage); ledger persists (IndexedDB); key reused. ⟦DEVICE⟧ confirm mid‑append refresh on phone |
| Offline mode | ⚠️ SW `aubs-shell-v21` precaches the full stack; verify is fully offline. ⟦DEVICE⟧ confirm cold offline launch |
| Repeated Verify Integrity ×10 | ✅ stable + idempotent |

**Functional acceptance: PASS.** Machine summary:
`conversation{multiOk,longOk}=✓ · memory{stored,retrieved,refusedNoMatch,superseded,ledgerOk}=✓ · governance{allow,denyClosed,reauthClosed,failHonest}=✓ · provenance{oneRecord,chainOk,tamperDetected,hasEvidence}=✓ · failure{all}=✓`

---

## 2. Performance Report

All figures from headless instrumentation with an **instant** model, so they measure *constitutional overhead only*. Device/model timings are ⟦DEVICE⟧.

| Metric | Value | Note |
|---|---|---|
| Constitutional overhead / turn | **0.67 ms** | full pipeline: planner→GEL→eligibility→drift shield→grounding→signed record→replay |
| Ledger append (Ed25519 sign + chain) | **0.32 ms / record** | dominated by the signature |
| Verify integrity | **~15 ms / 50 records** | **O(n)** — full re‑verify of the chain (re‑hash + re‑verify every signature) |
| Memory write | 0.65 ms | TSM, signed log |
| Memory read over 100 | 0.73 ms | linear substring scan |
| DecisionRecord on disk | **~1.04 KB / record** | hashes, not raw text |
| Projected ledger growth | ~1 MB / 1,000 turns · ~10 MB / 10,000 turns | unbounded — see bottleneck #1 |
| Test suite (25 runners) | ~1.66 s | CI‑grade |
| Full JS stack loaded by app | ~344 KB across 61 `<script>` tags | classic scripts, parsed on every load |
| Time‑to‑first‑token / total response | ⟦DEVICE⟧ | inference‑bound; constitutional overhead is <1 ms and not the driver |
| Browser cold‑load | ⟦DEVICE⟧ | 61 script tags + model download dominate |

### Largest bottlenecks (ranked)
1. **Unbounded ledger growth (O(n) verify + linear storage).** At ~1 KB/record, verify cost and IndexedDB use grow forever. ~15 ms/50 records means a 5,000‑record chain verifies in ~1.5 s. **Fix:** checkpoint/rotate the chain (signed checkpoint every N records) or verify incrementally. *This is the single most important scaling item.*
2. **61 separate `<script>` tags (~344 KB).** Each is a network round trip on first load and a parse on every load. Constitutional overhead at runtime is negligible (<1 ms), so the cost is **load‑time**, not per‑turn. **Fix:** bundle the constitutional stack into one file for production (keep the per‑module sources for dev). ⟦DEVICE⟧ measure the real delta.
3. **Inference dominates everything else.** ⟦DEVICE⟧ — but the data is unambiguous that governance adds <1 ms, so TTFT/latency work belongs in the model/runtime layer, not the constitution.

---

## 3. UX Report (fresh‑eyes)

The constitutional runtime is **invisible by default** in the right places — but several strings and one always‑on element leak internal vocabulary. Severity: 🔴 blocker · 🟠 major · 🟡 minor · ⚪ polish.

### Leaks of the runtime into normal UX
- 🟠 **Build string in the Settings drawer** shows `cp0-constitution-chat-m14 · governed-local · spine …` to **every** user (no flag needed). Reads as broken debug text and exposes internal terms. **Fix:** show a plain version (`Version: 2026.06`) or hide it.
- 🟡 **The "Why?" button appears on every normal turn.** This is the **pre‑existing Glass Box** transparency feature (Article 6), not new in M14, and its vocabulary is product‑level (`grounded / general / inferred / unknown`), *not* governance jargon. It is an intentional design choice — but a founder product decision is warranted: keep it (transparency) or gate it behind an "Advanced" toggle. *Not a regression.*
- 🟠 **Governance jargon under flags only:** with `?spine=1`/`?kernel=1`, clicking "Why?" toasts `… · decision: allow · record #5`, and errors read `Constitution path error:` / `Kernel path error:`. Internal, but flag‑gated (dogfood only). **Fix before any default‑on:** human‑friendly strings; log internals to console.
- 🟡 **Console prefixes** (`[AUBS spine]`, `[AUBS kernel]`, `[AUBS Ledger]`) expose architecture if a user opens devtools. **Fix:** generic `[AUBS]` prefix.

### Confusing wording / missing feedback
- 🟠 **Raw technical errors reach the bubble:** e.g. `Error: GPUBuffer is disposed [Adreno … maxBind:160MB …]` and `(No text came back. finish: length · model: …)`. **Fix:** friendly "I need a moment — tap send again," keep diagnostics in console.
- 🟡 **"Reconnecting the engine…"** exposes an internal fault and has no animation. **Fix:** "Restarting… ⟨dots⟩"; consider making recovery silent.
- 🟡 **"✗ TAMPERING DETECTED — N fatal issue(s). See console."** is alarming with no next step. **Fix:** add "This shouldn't happen — please report it."
- ⚪ **The thinking dots are subtle**; ⚪ **double confirm dialogs** for clear‑memories/clear‑history; ⚪ **brief blank** before the download progress bar.

### What's already good
- Default experience shows **no** governance vocabulary in the chat flow.
- Blocked/failed messages are **honest and non‑fabricated**.
- "Answered locally. Nothing left this device." is plain, reassuring English.

---

## 4. Remaining Risks (truth‑checked)

Each subagent‑proposed risk was re‑verified against the code; corrections noted. Severity reflects the **actual live blast radius**, not the abstract code smell.

| ID | Risk | Verified finding | Severity |
|---|---|---|---|
| **R‑1** | `core/memory/service.js` `write()` → `STORE.appendMemory(...)` has **no `.catch()`**; a rejected append (quota/crypto) returns a rejected promise. | **Real**, but **TSM is not wired into live chat** (app + `local_chat` skill use no memory). Cannot break current chat. | 🟠 major **latent** — fix **before** wiring TSM into chat |
| **R‑2** | `spine/ledger.js` `sha256hex()` calls `SUBTLE.digest` with no guard → throws in a non‑secure context / missing SubtleCrypto. | **Real.** Production is HTTPS (secure context). In the constitutional path the pipeline **catches** append failures (`rec=null`) and chat continues; the ledger silently disables. | 🟠 major robustness — add explicit guard + **user‑visible "ledger unavailable"** state |
| **R‑3** | Lost/rotated signing key → split/unverifiable chain. | Key **is persisted and reused** (`aubs_ledger_keys` IndexedDB); records + key share storage fate. Split only on a *partial* wipe. | 🟡 minor edge |
| **R‑4** | Concurrent `ensureLedger()` race spawns duplicate init/keys. | **Dismissed.** `_ledgerInit` is assigned **synchronously before any `await`** (correct promise gate); turns are also serialized by `window.__busy`. | ✖ not a risk |
| **R‑5** | **Unbounded ledger growth**; O(n) verify; no rotation/GC. | **Real.** ~10 MB/10k turns; verify scales linearly. Append failure is caught so chat survives, but provenance silently stops near quota. | 🟠 major (Phase B) — checkpoint/rotate |
| **R‑6** | `private` scope is a capability token, not owner‑bound; `read()` returns `ok:true` even when all matches are permission‑denied. | **Real** but harmless single‑user; matters for multi‑user (family/org) scopes. Pipeline checks governance directly, not the aggregate flag. | 🟡 minor now / 🟠 for multi‑user Phase B |
| **R‑7** | Ledger init fails silently (private browsing, no IndexedDB) — user not told. | **Real**, by design ("chat unaffected"). | 🟡 minor — surface a one‑time notice |
| **R‑8** | Flag persisted in `localStorage` re‑enables constitutional mode on next visit without re‑consent. | **Real**, low impact (mode is byte‑safe). | 🟡 minor |

**Confirmed safe (no action):** flag‑OFF path is byte‑identical by construction (the constitutional scripts only define globals; `send()` only reaches them when the flag guard passes); deny/reauth are fail‑closed; exactly one record per turn on every path; tamper detection works; records store hashes not raw text.

---

## 5. Recommended Priority List for Phase B

**P0 — do before relying on the ledger/TSM outward (robustness foundations)**
1. **Ledger durability:** add explicit `SubtleCrypto` guards in `sha256hex`/sign paths (R‑2); surface a **"provenance unavailable"** state instead of silent disable (R‑2/R‑7).
2. **Ledger scaling:** signed **checkpoint + rotation** so verify is bounded and storage doesn't grow forever (R‑5, perf #1).
3. **Harden the memory service** (`.catch()` on append, clearer all‑denied semantics) **before** TSM is wired into the chat path (R‑1/R‑6).

**P1 — product polish that makes it feel finished**
4. **Bundle** the constitutional stack into one production file (perf #2).
5. **UX string pass:** plain‑English errors (no raw GPU/`finish` leakage), version label instead of the internal build string, generic console prefix, friendlier recovery + tamper messaging.
6. **Founder decision on the Glass Box "Why?"** default visibility (keep as transparency vs. gate behind Advanced).

**P2 — multi‑user readiness (only when expanding scopes)**
7. Owner‑bind `private` reads and tighten cross‑scope permission semantics (R‑6).
8. Per‑session consent / clear affordance for the dogfood flags (R‑8).

**P3 — device acceptance (you, on the phone)**
9. Capture the ⟦DEVICE⟧ metrics: TTFT, total response time, cold‑load, real IndexedDB growth, and a subjective naturalness pass on `?spine=1` vs `?spine=0`.

---

### Bottom line
AUBS is **ready to build outward from a stable constitutional foundation.** The runtime is correct, fail‑closed, tamper‑evident, one‑record‑per‑turn, privacy‑preserving (hashes not text), and adds <1 ms/turn — and with the flag off it is exactly today's working app. The work remaining before Phase B is **robustness and polish** (ledger durability/scaling, memory‑service hardening, UX strings), not architecture. No item **blocks** starting Phase B; items P0‑1…3 should land before the ledger or TSM are promoted toward default‑on.
