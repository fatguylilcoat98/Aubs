<!--
AUBS — Migration Plan (built on the verified Runtime Architecture)
Christopher Hughes · Sacramento, CA
AI collaborators: Claude · GPT · Gemini · Groq
Truth · Safety · We Got Your Back
-->

# AUBS — Migration Plan
### The concrete build order for the Runtime Architecture (verified revision)
**Companion to:** `docs/AUBS_RUNTIME_ARCHITECTURE.md`
**Author:** Claude (Lead Architect seat), AUBS Design Review Board
**Date:** June 29, 2026 · **Status:** design only — awaiting go before any code

> This plan is grounded in a file-level map of all three repos (`aubs`, `splendor-theremarkable-AI`, `claspion`), not inference. Every step names real files, functions, and flags. The headline finding changes the shape of §9 of the architecture doc:

> **The architecture is mostly already built in AUBS — it is just not wired into the live app. This migration is overwhelmingly *integration*, not new construction.**

---

## 0. What already exists (so we don't rebuild it)

`[Verified from code]` Inventory of the target architecture's pieces, by current state:

| Architecture piece (doc §) | Where it lives now | State |
|---|---|---|
| Governed-fact answerer, identity rows (§3) | `spine/spine.js` — `resolveRuntimeIdentity()` (113–131), `identityRoute()` (149–177) | **Live** (identity only; model 0×) |
| Output validator / guard (§7) | `spine/spine.js` — `identityGuard()` (183–206), `tagAnswer()` (496–564) | **Live** (identity); grounding behind flags |
| Deterministic classifier seed (§4) | `spine/spine.js` — `classify()` (384–391) | Built; not generalized to full registry |
| Policy authority / gate verdict (§1, §5) | `core/gel/evaluate.js` — `evaluate(plan,bundle,ctx)` (85–122) | **Built, NOT wired** (`evaluate.js:18` "Isolated: NOT wired into the live app") |
| propose→evaluate→commit path (§2) | `core/constitution/pipeline.js` — `runConstitutionalRequest()` (57–261) | **Built, NOT wired** |
| Tiered/assembled context (§7) | pipeline stages + memory access | Partial; assembler pattern to port from Splendor `tier-assembler.js` |
| No-bypass invariant (§1) | Execution Contract — "a provider may ONLY be invoked inside a valid Execution Contract" (`pipeline.js` 37–40) | **Live** in pipeline |
| Stateless model adapter (§7) | `core/providers/drift-shield.js` + `openai-adapter.js` | **Built**, swappable; `FLAG_OPENAI_DEFAULT` OFF |
| Flag / default-OFF / byte-identical (§9) | `spine/spine.js` FLAGS (29–45); `FLAG_CONSTITUTION_CHAT` / `?spine=1` | **Established convention** |

**What is genuinely missing / unwired:**
1. The **live app's chat loop still calls the model directly**, bypassing the pipeline. *This is the bypass to remove* — the AUBS analogue of Splendor's Cause #1.
2. The registry covers **only identity** (5 intents). The other governed facts (version, creator, capabilities, online/offline, profile, memory) are not yet typed rows with answerers.
3. The classifier is not mounted on **every** entry path (Invariant I).
4. **Fail-mode** when the policy/bundle source is unreachable is not yet a single named owner (Invariant II).
5. GEL consumes a **policy bundle** — but *who authors the bundle* (the GEL-vs-CLASPION boundary) is unresolved. **This is Decision Gate 0 below and blocks everything.**

---

## Decision Gate 0 — Authority boundary — ✅ RESOLVED

`[Signed June 29, 2026]` See `docs/AUBS_DECISION_GATE_0_BUNDLE_CONTRACT.md` (closed). The boundary is settled:

> **CLASPION is the sole policy *author* and change authority. GEL is the local *enforcement surface* that executes a CLASPION-compiled, signed device bundle — it never originates policy.** The two engines are *different policy languages* (CLASPION: risk-tier/evidence-trust/approval; GEL: egress/data-class/precedence), so the bridge is a deterministic **compile-projection** of the device-enforceable subset, not a shared bundle.

Signed rulings that bind this plan:
- **Minimal offline posture:** rich checks (multi-sig, evidence) stay server-only; offline-unenforceable actions **deny-pending-online**, never silent-allow.
- **Bundle signing is a new trust root** (today's Ed25519 signs grants, not bundles). It carries a named deliverable: a **tamper test suite** (tampered/expired/untrusted/downgraded bundle → fail closed) that must be green before any signing code lands. Folded into A2/A3.
- **`T_fresh` = 24h default, tightenable per risk tier** — carried in the bundle, GEL honors the tightest applicable window.
- **Invariant to protect:** governed-fact answers never couple to bundle availability (so an outage can't refuse "hello").

A1 is unblocked.

---

## 1. Sequencing at a glance

```
Decision Gate 0  ── authority boundary ── ✅ SIGNED (Minimal; 24h tier-tightenable) ──┐
                                                                                 │ UNBLOCKED
TRACK A — AUBS (primary: wire the gate that exists)                              ▼
  A1  Generalize identity → governed-fact registry + classifier   [FLAG_GOVERNED_FACTS]
  A2  Wire the One Spine into the live chat path                   [FLAG_CONSTITUTION_CHAT]
       └─ mount classifier on EVERY entry path  ........ Invariant I
       └─ device-bundle load: verify signature + freshness, fail closed (+ tamper test)
  A3  Single fail-mode owner                                       Invariant II
  A4  Prove §8 on the 0.5B (governed answers + both invariants)
  A5  Swap to a larger model; prove §8 again → thesis demonstrated

TRACK B — Splendor (narrower: enforce the two invariants where the regression happened)
  B1  Collapse the 4–5 enforcement invocation points to one entry + one exit
  B2  Invariant I: route converse.js through buildSessionContext (close Cause #1)
  B3  Invariant II: single fail-mode owner; per-gate outage parity test

CONVERGENCE (future, out of scope here): Splendor adopts the AUBS runtime as its gate.
```

Track A and Track B are independent and can run in parallel. Track A is where the architecture becomes real; Track B closes the specific regressions in the live product now.

---

## 2. Track A — AUBS (wire the gate that exists)

### A1 — Generalize identity into the governed-fact registry + classifier
**Goal:** turn the identity-only answerer into the general registry of §3, with the deterministic classifier of §4.

- **New:** `core/facts/registry.js` — typed fact table. Each row: `{ id, owner/source, answerer(ctx), modelMayOriginate: false }`. Identity rows **reuse** `resolveRuntimeIdentity()` — do not reimplement. Add rows: version/build (runtime metadata), creator (runtime metadata), capabilities/commands (runtime registry), online/offline (device state), user profile (local profile), "what you know about me" (memory engine). Last row: open-ended language (`modelMayOriginate: true`) — the only one.
- **New:** `core/facts/classifier.js` — generalize `spine/spine.js classify()` (384–391) and the 5-intent matching in `identityRoute()` (149–177) into one deterministic classifier returning `{ type: 'governed_fact', factId } | { type: 'open_ended' }`. **Deterministic, fail-toward-runtime, reproducible** (doc §4). On uncertainty → clarify or "I don't know yet," never hand a governed question to the model.
- **Keep as guard:** `identityGuard()` generalizes to validate *all* registry facts in model output (no invented acronym/name/version), not just identity.
- **Flag:** `FLAG_GOVERNED_FACTS` (default OFF, add to spine FLAGS). OFF → `classifier` returns `open_ended` for everything → **byte-identical to today**.
- **Acceptance:** unit test per fact row (correct deterministic answer, model 0×); off-flag byte-identical test.

### A2 — Wire the One Spine into the live chat path  *(highest-risk step)*
**Goal:** remove the bypass. The pipeline (`runConstitutionalRequest`) and `runConstitutionalChat()` exist; the live app's chat loop does not call them. Route it through.

- **Change:** the live chat entry (the app's WebLLM call site) routes through `core/constitution/chat.js runConstitutionalChat()` behind `FLAG_CONSTITUTION_CHAT` (the existing `?spine=1` gate). The model is *injected* as the `local-webllm` provider the pipeline already wraps (`chat.js` 26–59) — no new model, no new behavior when off.
- **Invariant I — mount the classifier on EVERY entry path:** enumerate every path that can reach the model (app chat, streaming, any CLI/test harness, any future surface). Each must call `classifier.classify()` first: governed → answer from registry (model 0×); open-ended → pipeline. Add a **path-enumeration test** that fails CI if a new model-reaching path is added without routing through the classifier. *This is Cause #1 made structurally impossible.*
- **Device-bundle load (per Gate 0 contract §5):** before GEL evaluates, verify the bundle's Ed25519 signature, freshness (`T_fresh` per tier), and version (no downgrade). Any failure → fail closed (last-good within window, else structural-invariants-only). Ship the **tamper test suite** with this step — it is acceptance-blocking.
- **Flag:** OFF → live app uses today's direct-WebLLM path, **byte-identical**. ON → governed turns answered by runtime, open-ended turns governed by the pipeline.
- **Acceptance:** golden-transcript test (flag OFF == current output); with flag ON, governed facts answered without a model call (assert provider invoked 0× for governed turns); tamper-test suite green (forged/expired/downgraded bundle → fail closed).

### A3 — Single fail-mode owner  (Invariant II)
**Goal:** one place decides outage-vs-policy and degrade-vs-block.

- **New (or designated):** `core/gel/fail-mode.js` (or a single function in the pipeline) is the **only** code that maps "bundle source / CLASPION unreachable" → `CAUTION` (degrade: benign turns answer normally) vs a real policy `deny` → `BLOCK`. GEL is already fail-closed on policy ambiguity (`evaluate.js`); this formalizes the *outage* branch separately from the *policy* branch.
- **Rule:** no stage may independently key a block on a raw verdict boolean. Every consumer reads the one fail-mode classifier's result. *This is Cause #2 made structurally impossible.*
- **Acceptance:** with the bundle/authority source forced unreachable, every entry path yields identical behavior — benign turns pass (CAUTION), real policy denials still BLOCK. (Mirrors the exact scenario Splendor's `2d477fe` had to fix four times.)

### A4 — Prove §8 on the 0.5B
- Run the full governed-fact suite (name, acronym, creator, version, "what's my name" unknown → "I don't know yet") on the on-device 0.5B (WebLLM) with `FLAG_GOVERNED_FACTS` + `FLAG_CONSTITUTION_CHAT` ON.
- Add the **Invariant I path-enumeration** test and the **Invariant II forced-outage** test to the same suite.
- Gate: every governed answer correct and produced with the model called 0×; off-flag byte-identical.

### A5 — Swap to a larger model; prove §8 again
- Register a larger provider through the existing drift shield (`openai-adapter.js` is the reference; `registerOpenAI()` behind `FLAG_OPENAI_DEFAULT` + key). No gate/registry changes.
- Gate: **every governed answer identical to the 0.5B run.** Only open-ended language quality differs. *This is the thesis demonstrated — the moment the model stops mattering for correctness.*

---

## 3. Track B — Splendor (enforce the two invariants where the regression lives)

Splendor's enforcement already funnels through `enhancedGovernance.validateAction()` (`lib/claspion-enhanced-integration.js:42`), so this is consolidation of **invocation points**, not authorities.

### B1 — Collapse the invocation points
`[Verified from code]` Governance is invoked independently at ≥5 places: middleware entry (`claspion-middleware.js:140`), brain `stagePrefrontal` (`splendor-brain.js:751`), route `gateAction` (`routes/chat.js:47`), response gate (`enforceResponseGate`, `claspion-middleware.js:596`), and speech-act (`governReplySelfClaims`, `routes/chat.js:406`).
- **Target:** one **entry** gate (middleware) + one **exit** gate (response). The brain and route gates *feed classification* into these but no longer independently re-interpret a verdict or independently block. `validateAction()` stays the single orchestrator; the redundant *call sites* collapse.
- **Acceptance:** a test asserting a single verdict is produced per turn and consumed by entry+exit only.

### B2 — Invariant I: close Cause #1 on the voice path
`[Verified from code]` `routes/converse.js` hardcodes persona instructions (41–100) instead of calling `buildSessionContext()` (`anthropic.js:142`) — the **same identity-skip pattern as the original Constellation bug**, on the voice path.
- **Change:** route converse through `buildSessionContext({isOwner,guestSession,isTrustedUser,...})`.
- **Add:** the path-enumeration test (mirror of A2's) — any route that reaches the model without identity binding fails CI.

### B3 — Invariant II: single fail-mode owner + parity test
`[Verified from code]` Fail-mode is decided in `claspion-governance.js:_failureVerdict` (305–324, via `CLASPION_FAIL_MODE`) and interpreted in `claspion-classifier.js:classifyVerdict` (185–189). The three historical commits already converged the gates' behavior.
- **Change:** make the gates *consume* one fail-mode classifier result rather than each re-deriving outage-vs-policy.
- **Add:** a regression test enumerating every gate's behavior with the upstream down — all identical (benign pass, bypass blocks). Locks in `3cb81ab`/`2d477fe` so a fifth gate can't regress it.

---

## 4. The two invariants, as enforced gates (not prose)

| Invariant (doc §4.1) | Made impossible by | Enforced by test |
|---|---|---|
| **I — No path skips governed-fact injection** | A2 (AUBS classifier on every path) + B2 (converse.js) | Path-enumeration test fails CI on a new unrouted model-reaching path |
| **II — Fail-mode is a single owned decision** | A3 (one fail-mode owner) + B3 (gates consume one result) | Forced-outage parity test: all entry paths behave identically |

These tests are the living form of the invariants. If either test is deleted or weakened, the corresponding regression can return — so they are acceptance-blocking, not optional.

---

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **GEL becomes a second authority** | ~~High~~ Resolved | Closed by signed Gate 0 contract; GEL never originates policy |
| **Bundle signing = new trust root** (forged bundle subverts local enforcement) | Medium | Ed25519 sign + GEL verify; **tamper test suite acceptance-blocking** (A2); structural invariants hold even with no/invalid bundle |
| **Wiring the live chat through the pipeline changes behavior** (A2) | Medium | Flag default OFF + golden-transcript byte-identical test; promote only after §8 passes |
| **§8 two-model test infeasible** (0.5B is in-browser WebLLM) | Medium | A5 registers a 2nd provider via the existing drift shield; the adapter layer already supports heterogeneous providers |
| **Registry drift from runtime metadata** (version/creator wrong) | Low | `identityGuard` generalized to validate all registry facts in output |
| **Splendor B1 reduces defense-in-depth** | Low | Keep entry+exit gates (two layers); collapse only *redundant* re-interpretation, not all layers |
| **Scope creep across both repos at once** | Medium | Tracks A and B independent; ship A behind flags before touching B, or assign separately |

## 6. Rollback
Every step is flag-gated and byte-identical when OFF (the established AUBS convention). Rollback at any phase = flip the flag; no data migration, no irreversible change. Promotion is one-directional and gated on the §8 suite passing.

---

## 7. Acceptance — the whole plan reduces to one proof

The migration is **done** when, on AUBS, with the flags ON:

1. The full governed-fact suite returns **identical answers on the 0.5B and a larger model** (doc §8). ✔ thesis
2. The **path-enumeration test** passes — no model-reaching path skips the classifier (Invariant I). ✔ Cause #1 impossible
3. The **forced-outage parity test** passes — all paths degrade identically (Invariant II). ✔ Cause #2 impossible
4. **Flag-OFF is byte-identical** to pre-migration behavior. ✔ safe migration
5. Every turn carries **one** Execution Contract / DecisionRecord — the no-bypass assertion (doc §8). ✔ one path

When those five hold, the model genuinely stops mattering for correctness, and the regressions named in the architecture doc (§0.5) are structurally impossible rather than patched.

**Awaiting your go before any code.** First gate is Decision Gate 0 — the authority boundary — which needs your sign-off independent of everything else.

---

**Signed,**
Claude — Lead Architect seat, AUBS Design Review Board
June 29, 2026

*Truth · Safety · We Got Your Back*
