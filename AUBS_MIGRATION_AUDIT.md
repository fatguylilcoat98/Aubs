<!--
AUBS — Architectural Migration Audit
Christopher Hughes · Sacramento, CA · Truth · Safety · We Got Your Back
Audited against: AUBS Master Blueprint v1.1 (June 28, 2026)
-->

# AUBS — Architectural Migration Audit

**Audit only. No code was rewritten.** This maps the *current shipping code* against the
**Master Blueprint v1.1** and assigns every real component one of four verdicts:

| Verdict | Meaning |
|---|---|
| **KEEP** | Already aligned with the Blueprint; carry it forward roughly as-is. |
| **REFACTOR** | Right idea / good bones; reshape it to a Blueprint contract before it scales. |
| **MOVE → CORE** | Belongs in the future AUBS Core (kernel/control plane); today it's absent or trapped inside the PWA. |
| **REPLACE** | Misaligned, unsafe, or dead; rebuild against the Blueprint or retire. |

Claims are tagged in the project's own discipline: **[Verified Fact]** (checked in this repo),
**[Supported Inference]**, **[Professional Opinion]**.

---

## 0. The one-paragraph truth

**[Verified Fact]** The current code has already won the single hardest, least-fakeable thing
in the whole Blueprint — **Chapter 16's #1: "prove the loop first."** A real user, offline, on a
real phone (S24), asks a real question and gets a fast, coherent, grounded answer on
Qwen2.5-0.5B with a deterministic safety gate, identity lock, and memory. That loop is *live*.
**[Professional Opinion]** And the project's *philosophy* already matches the Blueprint's
kernel invariant: a deterministic spine that makes decisions, with the model kept to generating
content. **But** the thing the Blueprint says *is the product* — the **tamper-evident provenance
ledger (Milestone 0)** — **does not exist.** Today "provenance" is an in-memory JavaScript array
(`_traces`, capped at 50 entries, `push`/`shift`) — which is *exactly* the "screenshot feature,
not a glass box" that Blueprint Article 0.1 warns against. So the honest state is: **we have a
validated substrate-of-the-substrate, and we are missing the spine.** The migration is mostly
*additive* (build the ledger, the CAC boundary, the GEL, the adapter layer) plus a handful of
**REPLACE**s where the current placeholders are not defensible (crypto, storage integrity).

---

## 1. The eight Blueprint systems vs. current state

| # | Blueprint system | Exists today? | Gap |
|---|---|---|---|
| 5 | **Provenance Ledger** (append-only, hash-chained, signed, `/verify`) — *the product* | ❌ `_traces[]` in RAM, capped at 50, lost on reload | **The central gap.** No chain, no signature, no persistence, no verify. |
| 4 | **Kernel Responsibility Contract** (one owner of routing/policy/memory/provenance) | ⚠️ implicit | Kernel duties are scattered inline in `aubs-app.html send()`; no named boundary. |
| 4 | **Canonical Contract (CAC)** — 6 schemas every subsystem speaks | ❌ | Objects are ad-hoc JS; no `intent/plan/governance/result/audit/failure` schema, no boundary validation. |
| 6 | **Governance Enforcement Layer (GEL)** — Cedar, precedence, fail-closed, simulator | ⚠️ proto | `safetyGate` is a hardcoded deny-list (allow/deny only); no policy-as-code, precedence stack, or simulator. |
| 7 | **Router** — eligibility → selection → execution | ⚠️ partial | `routeQuery` is a strong *selection* stage; **no eligibility (policy) stage, no execution/adapter stage.** |
| 8 | **Provider Adapters / Drift Shield** | ❌ | App calls WebLLM directly; no adapter boundary, no cloud provider, no circuit breaker, no capability registry. |
| 9 | **Typed, Scoped Memory (TSM)** | ⚠️ partial | `makeMemoryEntry` has source/scope/version/supersede — but **no `kind` typing, no confidence, no scope isolation, no expiry/revocation-to-ledger.** Stored in mutable `localStorage`. |
| 7-bis | **Tiered Explainability** (L1/L2/L3 from ledger only) | ⚠️ proto | The "Why?" chip + `glassBox()` is a real L1/L2 seed, but it renders from the RAM trace, **not from a signed ledger** — so it can't satisfy the honesty invariant. |

---

## 2. Component-by-component ledger (every real artifact)

### `spine/spine.js` — the deterministic core (the best-aligned asset)

| Component | Verdict | Why |
|---|---|---|
| **Deterministic-spine discipline** (no model calls; every fn unit-tested) | **KEEP** | This *is* the kernel invariant (Ch.4): "models generate content; the kernel makes decisions." The whole posture is correct. |
| `SYSTEM_IDENTITY`, `isIdentityQuery`, `identityPreamble` (Art.12) | **KEEP** | Identity lock is sound and already enforced; carries straight into Core. |
| **Router v1** — `routeQuery`, `detectIntent`, `solveMath`, `identityAnswer`, `capabilityAnswer`, `recallMemory` | **REFACTOR** | This is the Blueprint's **Stage 2 (deterministic selection)** done well. Reshape into the 3-stage router: add **Stage 1 eligibility** (ask the GEL which providers may receive this data) and **Stage 3 execution** (call via an adapter, write a DecisionRecord on success *and* failure). |
| `safetyGate` / `safeResponse` (hardened topic×intent) | **REFACTOR** | A correct *proto-GEL*, but it's a hardcoded deny-list. In Core it becomes **one policy bundle** inside the Cedar-driven GEL, governed by the precedence stack and the simulator — not the gate itself. Keep the harm patterns as a ruleset; replace the mechanism. |
| `makeMemoryEntry`, `adaptMemories`, `liveEntries`, `extractFacts` (Art.2 + extraction) | **REFACTOR → TSM** | Good write-path discipline (source enum, `user_verified`, supersession). Extend to the TSM `item.schema`: add `kind` (factual/declared/inferred/summary), `confidence`, hard `scope` isolation, `expires_at`, and **revocation written to the ledger.** |
| `classify`, `retrieve`, `buildPromptMeta` (Art.4 pipeline) | **REFACTOR → CAC** | These are the bones of `intent → plan`. Reshape into CAC `intent.schema` → `plan.schema` (deterministic plan produced *before* any model call). |
| `tagAnswer`, `relevanceCheck`, `parseCitations`, `citationInstruction`, `memoryRecallBlock`, `classifyCitation`, `verifyGrounding`, `dangerFactCheck` (Art.3a/3b/0.5/0.6) | **REFACTOR (reframe)** | Valuable *epistemic* machinery — but the Blueprint's trust artifact is **provable egress + a signed record**, not a grounded/inferred tag. Reframe these as **evidence fields on the DecisionRecord** (`retrieved_doc_hashes`, memory items used by hash, classification) and as L2 explainability inputs. Keep the logic; demote the "tag" from *the moat* to *one UX signal*. |
| `makeProvenance` / `ProvenanceRecord` (Art.3) | **REFACTOR → DecisionRecord** | Strong field set (prompt_hash, ids_in_prompt vs cited, tag, flags, tier) but missing the load-bearing fields: `seq`, `prev_hash`, `input_hash`, `egress_summary{left_device,payload_hash,…}`, `record_hash`, `signature`. Extend into the Ch.5 `decision_record.schema`. |
| `logProvenance` / `_traces[]` / `lastProvenance` / `allProvenance` | **REPLACE** | **[Verified Fact]** In-RAM array, capped at 50, `push`/`shift`, gone on reload. Not append-only, not chained, not signed, not persisted. This is the "Postgres table anyone can UPDATE proves nothing" anti-pattern (Ch.5). Replace with the real ledger. |
| `glassBox()` (Glass Box trace v1) | **REFACTOR** | Good L1/L2 seed; must render **from the signed ledger**, not the RAM trace, to meet the honesty invariant (Ch.7-bis). |
| `hashString` (FNV-1a, 32-bit) | **REPLACE for security use** | **[Verified Fact]** FNV-1a is a *non-cryptographic* hash. Fine for memory ids/cache keys; **must never back the ledger.** The ledger needs **SHA-256** for `record_hash` and **Ed25519** for `signature` (Ch.12). Flag every place a security decision currently leans on `hashString`. |
| `FLAGS` framework (`FLAG_ROUTER`, `FLAG_DISTILL`, …, control flags) | **KEEP** | Reversible, observable, logged — matches Blueprint discipline. Carries forward as the Core's feature-flag surface. |
| `safetyGate` deny patterns, golden/relevance/citation logic | **KEEP (as data)** | The *rulesets and test fixtures* are valuable; they become policy bundles + the Ch.13 adversarial suite. |

### `aubs-app.html` — the PWA (the validated local loop)

| Component | Verdict | Why |
|---|---|---|
| **In-browser WebLLM inference (Qwen2.5-0.5B), local-first, offline** | **KEEP — load-bearing** | Blueprint Ch.8/Ch.12 *explicitly*: "the existing AUBS PWA, Llama in-browser. This stays the core." This is the local provider and the proof-of-loop. Do **not** touch it. |
| `send()` pipeline (safety gate → router → model → recovery → provenance) | **REFACTOR → kernel** | The orchestration is correct in spirit but lives **inline in an HTML file**. Move the decision flow into a named **kernel** module that owns orchestration/routing/policy/provenance (Ch.4); the PWA becomes a *client* of the kernel, not the kernel. |
| `logProvenanceFor()` (per-turn provenance + Why? + trace) | **REFACTOR** | Right place, wrong sink — it must write a signed `DecisionRecord` to the ledger and render explainability *from it*. |
| **GPU/runtime survival** (non-streaming, hardened `recoverEngine`, `bindingTight` phone-safe model selection, build/SW cache discipline) | **KEEP** | Hard-won device reality (the 128MB-binding fight). This is exactly Ch.16 #1 ("the constraint is the model, not the constitution"). Keep all of it. |
| Persona/appearance/settings UI | **KEEP** | Product surface; unaffected by the migration. |
| Memory/history/settings in **`localStorage`** (mutable JSON) | **REPLACE (storage layer)** | Mutable, integrity-free. Memory → TSM store; provenance → append-only ledger store (local-first: append-only **IndexedDB** + hash chain + a device key — see §4). `localStorage` is fine for non-authoritative UI prefs only. |
| Cloud provider path | **MOVE → CORE (absent)** | There is none today (`fetch` to a provider does not exist). The drift-shielded adapter + capability registry (Ch.8) is net-new in Core. |

### Repo hygiene

| Artifact | Verdict | Why |
|---|---|---|
| `app/aubs-shell.html`, `app/fastengine-test.html` + `docs/*FASTENGINE*/MODEL_ADAPTER/OUTPUT_VALIDATOR/PROMPT_BUILDER/RUNTIME_PIPELINE/CONVERSATION_CONTROLLER*` | **REPLACE / RETIRE** | The dead "FastEngine" second codebase. Superseded by the spine + PWA. **[Professional Opinion]** Archive it out of the active tree (a `legacy/` tag or branch) so the repo is legible to a successor (Ch.16 #4). Do not migrate it. |
| `tests/` suite (golden, relevance, citation, router, safety, feel, grounding-verify) + harness discipline | **KEEP → re-point** | This *is* the Ch.13 / FORGE adversarial discipline. Keep it and add the Milestone-0 tamper/egress/honesty-invariant suites (§5). |
| `docs/SYSTEM_AUDIT.md`, `ARCHITECTURE_UPDATED.md`, `SECTION8_*`, `test-utilities/` | **REVIEW → likely RETIRE** | Appear to document the FastEngine era; verify, then archive what's stale to keep the tree honest. |
| `index.html`, `manifest.json`, `sw.js`, icons, fonts, `CNAME` | **KEEP** | PWA shell + deployment. The `sw.js` network-first-code discipline is good. |
| `README/QUICKSTART/CHANGELOG/RELEASE_SUMMARY/GITHUB_UPLOAD/MEMORY_V1_VALIDATION` | **REVIEW** | Keep what's current; the Blueprint becomes the canonical architecture doc. |

---

## 3. Where the current code sits in the Blueprint build order

Build order is **spine-first**: Ledger → CAC → GEL → local exec → cloud adapter → TSM → red-team.

| Milestone | Blueprint says | Current reality |
|---|---|---|
| **0 — The Ledger** | *Build first.* Append-only, hash chain, signing, `/verify`. | **Not started.** `_traces[]` is a placeholder to replace. **This is the gap.** |
| **1 — The CAC** | Lock 6 schemas; intent→plan as objects. | Partial bones (`classify`/`retrieve`/`buildPromptMeta`), no schemas/validation. |
| **2 — The GEL** | Cedar, precedence, fail-closed, simulator. | Proto only (`safetyGate` deny-list). |
| **3 — Local execution path** | Plan → router(local) → Llama → result → DecisionRecord. | **Mostly DONE** (and device-validated) — except it writes to RAM, not a DecisionRecord. |
| **4 — Cloud adapter + drift shield** | One cloud provider behind an adapter. | Not started (local-only today). |
| **5 — TSM** | Typed, scoped memory w/ provenance + revocation. | Partial (`makeMemoryEntry`); needs typing/scoping/expiry. |
| **6 — Red-team the ledger** | Before public. | Test discipline exists; no ledger to attack yet. |

**[Supported Inference]** The current build raced ahead to **Milestone 3** (the local loop) and skipped **0–2** (the spine). That's the inverse of the Blueprint order — understandable (you had to prove the model could even run), and Ch.16 #1 says proving the loop was the right first bet. But the Blueprint is explicit (Ch.16 #2): **process is outrunning product; the next unit of work is Milestone 0, not another spine article.**

---

## 4. The one load-bearing architectural decision to make now

**[Professional Opinion]** The Blueprint's stack (Ch.12) assumes a **Node.js control plane + PostgreSQL** ledger. The current product is a **pure client-side PWA with no backend**, and V1 (Ch.10/Milestone 3) is **fully offline**. These collide on *where the ledger lives*:

- **Local-first ledger (recommended for V1):** an **append-only IndexedDB store + application hash chain + a device-held Ed25519 key**, with `/verify` implemented as client-side recomputation (and an optional exportable bundle). This keeps the offline promise and the "software the user runs, never infrastructure you operate" liability shape (Ch.14) intact. The Postgres/Node version is the **enterprise/hosted-`/verify`** tier later.
- **[Verify Before Building]** Browser key custody is the hard part: a device-generated non-extractable WebCrypto key signs locally, but a purely client-side chain is only as tamper-evident as the device. For the *compliance* tier, records anchor to a server-side chain. Decide V1 = "honest local ledger, exportable & self-verifiable" vs. "needs a server now." The Blueprint's local-first mandate points at the former.

This decision gates Milestone 0 and should be made before any ledger code is written.

---

## 5. Landmines (fix these as you migrate, not after)

1. **[Verified Fact] Provenance is not tamper-evident.** RAM array, capped, unsigned, unpersisted. Until the ledger exists, the "Why?/Glass Box" is honest-ish UX but **not** a verifiable claim. Don't market it as proof yet.
2. **[Verified Fact] `hashString` is FNV-1a, not crypto.** Any integrity/identity that matters must move to SHA-256 + Ed25519. Audit every security-adjacent use.
3. **[Verified Fact] Authoritative state is in mutable `localStorage`.** Memory and history can be edited by anything with page access — incompatible with TSM revocation-to-ledger and with provenance integrity.
4. **Safety gate is allow/deny, not policy-as-code.** It can't express precedence, can't be simulated, can't fail-closed on conflict. Good as a ruleset; insufficient as the GEL.
5. **Router has no eligibility stage.** It selects *how to answer*, never *whether this data may go to this provider*. The moment a cloud provider is added without Stage 1, the egress promise is unbacked.
6. **Honesty invariant is untested** because there's nothing signed to test against. The L2 summary must be provably non-contradictory with L3 (Ch.7-bis) — add this the day the ledger lands.

---

## 6. Recommended sequence (no rewrites; additive spine-first)

1. **Do not touch the working loop.** The offline Qwen2.5-0.5B path + GPU survival + safety gate are validated assets. Freeze and build *around* them.
2. **Decide §4** (local-first ledger custody) — one decision, blocks everything.
3. **Milestone 0 — the Ledger:** SHA-256 + Ed25519 `DecisionRecord`, append-only store, client-side `/verify`, and the **tamper / egress-proof / honesty-invariant** tests (Ch.13). Re-point `logProvenanceFor` at it. *This converts the current "Why?" from a screenshot into a glass box.*
4. **Milestone 1 — CAC:** lift `classify/retrieve/buildPromptMeta` into `intent→plan` schemas; validate at boundaries.
5. **Milestone 2 — GEL:** promote `safetyGate` into a Cedar-bundle inside a precedence/fail-closed engine + simulator.
6. **Refactor the Router to 3 stages**, TSM-ify memory, then (only then) **Milestone 4** the first cloud adapter behind the drift shield.
7. **Retire `app/` + stale `docs/`** so the repo is legible to a successor (Ch.16 #4).

**The single highest-value next commit is Milestone 0.** Per the Blueprint's own words: *"A tampered record caught by `/verify` is worth more than another ratified article."*

---

## 7. Verdict tally

- **KEEP:** deterministic spine + invariant, identity lock, in-browser local loop, GPU-survival engineering, flag framework, test/adversarial discipline, PWA shell.
- **REFACTOR:** Router→3-stage, memory→TSM, classify/retrieve→CAC, ProvenanceRecord→DecisionRecord, safetyGate→GEL bundle, epistemic tags→ledger evidence/L2, glassBox→render-from-ledger, send()→named kernel.
- **MOVE → CORE:** the Ledger, CAC schemas, GEL engine, provider adapters/Drift Shield, the kernel boundary, `/verify`.
- **REPLACE:** `_traces` in-RAM provenance, `hashString`-for-security, `localStorage`-as-authoritative-store, the `app/` FastEngine codebase + stale docs.

**Bottom line:** the migration is ~70% *additive* (build the spine the loop is missing) and ~30% *replace-the-placeholder* (crypto + storage integrity + dead code). Almost nothing of the validated runtime needs to be thrown away — and the one thing the Blueprint calls *the product* is the one thing not yet built.
