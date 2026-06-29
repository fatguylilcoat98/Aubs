<!--
AUBS — Trust OS: Verification & Build Roadmap
Christopher Hughes · Sacramento, CA
Truth · Safety · We Got Your Back
-->

# AUBS — Trust OS: Verification & Build Roadmap
### Code-grounded reconciliation of `AUBS_TRUST_OS_ARCHITECTURE.md`
**Author:** Claude (Lead Architect seat), AUBS Design Review Board
**Date:** June 29, 2026 · **Status:** verification complete; build not started (no feature code yet)

> The Trust OS architecture doc was checked against the live repo (three independent read passes). This is the result: what the doc gets right, what it overclaims, and the corrected build order grounded in what actually exists. Same discipline that caught the three-governance error and the cost-selection claim below. **Trust shouldn't require faith — neither should a roadmap.**

---

## 1. Verification verdicts (per claim, with evidence)

| Doc § | Claim | Verdict | Evidence / correction |
|---|---|---|---|
| 4.1 | Integrity Proof "exists today" | **TRUE** | `spine/ledger.js` — hash-chain (`prev_hash`/`record_hash`), Ed25519 sign + `verifyLedger`, offline `exportLedger`/`verifyExport`; tested (`run-replay.cjs`). |
| 4.2 | Provenance: "every artifact referenced **by hash**" | **PARTIAL** | input/output/**policy** are hashed; **model_id, memory items, retrieved docs are stored as IDs/strings, not content hashes** (`ledger.js`, `pipeline.js:memRefs`). Re-matchability is incomplete. |
| 4.3 | Grounding: deterministic **T0→T1→T2** restore + model **T3/NLI** | **PARTIAL / mislabeled** | Real code is deterministic `value_verified` / `topic_relevant` (`spine.js groundingStrength`, behind `FLAG_SPINE_GROUNDING_V2`, default OFF). No T0/T1/T2 restore pipeline; no NLI tier. It IS model-free already (good) — but the doc's tier model doesn't match. |
| 4.4 | Decision selection re-verifiable | **TRUE** | `core/replay/replay-engine.js` re-evaluates GEL + eligibility from recorded inputs. |
| 4.4 | Rejection rationale recorded (and not self-verifiable) | **TRUE (nuance)** | Per-candidate `rejected[].reasons` recorded (`eligibility.js`). Those policy reasons ARE re-checkable; the doc's *capability/cost counterfactual* ("Qwen too weak") is the part that's only an estimate. Both must be labeled distinctly. |
| 4.4 / 6 | Selection = "cheapest enabled model meeting capability" | **FALSE** | Selection is **lowest `provider_id` alphabetically** (`eligibility.js:91` — "cost ranking is explicitly future work"). `cost_class` exists but is unused. Either build real cost-selection or label it an estimate; never a proof. |
| 4.5 / 5 | Single `egress()` chokepoint, egress ledger, CI lint | **FALSE (net-new)** | No `egress()`, no `appendEgress`, **no package.json / CI / lint infra at all**. But egress is *nearly single-door already*: only `core/providers/openai-adapter.js` (transport) and `sw.js` (service worker) touch the network. Tractable. |
| 4.6 / 6 | Memory = 7 types: Constraint·Policy·Fact·Preference·Episode·Source·Capability | **FALSE** | Actual: 8 types `FACT·PREFERENCE·PROFILE·TASK·DOCUMENT·SUMMARY·SYSTEM·INFERENCE`, **scoped** (`private…device`). Only Fact & Preference overlap. Policy lives in GEL, Capability in `providers/capabilities.js` — correctly NOT memory. |
| 4.6 | Memory referenced by hash **and type** in the record | **PARTIAL** | Memory items ARE hashed+signed in the store, but the DecisionRecord carries `memory_refs` as **IDs only**, without type. |
| 6 | Check-order: Constraints→Policies→GovernedFacts→Memory→ReasoningPermission→ModelSelection | **PARTIAL** | Policies (GEL) ✓, GovernedFacts ✓, Memory ✓ exist. But **model selection runs BEFORE memory** (not after); **Constraints** aren't a distinct stage (folded into GEL egress/local_only); **Reasoning-permission gate is MISSING entirely.** |
| 7 | Decision Trace (structured, not chain-of-thought) | **TRUE** | The pipeline `path`/`step()` array is exactly this. Strength tags are not yet per-line. |
| 9.9 | Portable verifier re-runs self-verifiable proofs offline | **PARTIAL** | Re-verifies chain + signatures + intent-binding + governance-reproducibility offline. Does NOT re-verify memory/doc **content** (not hashed). |
| 2 | TrustRecord unifying schema | **17/20 fields exist** | Missing: `privacy` (no field), `strengths` (no field), `trace` (not stored by default), and `provenance` is a sidecar (`facts/provenance.js`) not a first-class record field. |

---

## 2. The corrections the code forces (before building)

1. **Provenance is by ID, not hash, for model/memory/docs.** To make Provenance Proof *self-verifiable* (the doc's claimed strength), the record must carry **content hashes** for memory items, retrieved spans, and the model id/version — not just string ids. Until then it's *runtime-attested*, not self-verifiable. **Label it honestly or fix the hashing.**
2. **"Cheapest model meeting capability" is not real.** Selection is alphabetical. Either implement cost+capability selection, or the Decision Proof must say *"selected by deterministic provider_id order (runtime policy), cost not yet a factor."* No estimate wearing a proof badge.
3. **The 7-type memory taxonomy is wrong.** Don't bolt on 7 new types. Reconcile: Policy→GEL (already), Capability→providers (already), Source→`DOCUMENT`, Episode→`TASK`/`SUMMARY`, **Constraint** is the one genuinely missing concept (today it's implicit in GEL). Decide: new `CONSTRAINT` type, or keep constraints in GEL and drop them from the memory taxonomy.
4. **The check-order doesn't match.** Two real gaps: (a) **no Reasoning-Permission gate** ("is the model even allowed to answer this?") — net-new; (b) model selection currently precedes memory. Decide whether to reorder or update the doc to the real order.
5. **Grounding tiers are mislabeled.** The doc's T0/T1/T2+T3 should be rewritten to the real deterministic `value_verified`/`topic_relevant` model (which is *stronger* for zero-trust since it's fully model-free). Keep the self-verifiable/model-inferred split, but describe what's actually there.
6. **No build/CI infra exists.** The "CI lint that fails the build on egress outside the gateway" has nothing to hang on. Pragmatic path that fits the repo's convention: a **`tests/run-egress-lint.cjs`** that scans source for forbidden network calls and exits non-zero — a real gate without inventing a package.json/CI system.

None of these are fatal. They're the difference between an honest Trust OS and one that overclaims — which is the whole moat.

---

## 3. What exists / extend / build-new (toward the Trust OS)

**Exists — formalize into the Trust Record:**
- Integrity (chain + sigs + offline verify) · Decision selection + replay · Decision Trace (`path`) · typed+scoped memory store · device-bundle signing (A2) · provenance metadata (A2.1) · governed-fact registry as first pre-model owner (A1/A2).

**Partial — extend:**
- Provenance → add content hashes (memory/model/docs). · Portable verifier → re-verify those hashes. · Grounding → promote the deterministic tier as the self-verifiable proof; relabel. · Trace → per-line strength tags.

**Net-new — build:**
- Trusted Egress Gateway + egress ledger + egress-lint test. · Trust Record schema (unify + promote provenance + add `privacy` and `strengths`). · Proof-strength taxonomy + Glass Box badges. · Privacy Proof (sealed-door/Incognito first, then filtered). · Reasoning-Permission gate. · Constraint handling. · cost-aware selection (or honest relabel). · Glass Box Easy/Detailed.

---

## 4. Corrected build order (the doc's order, grounded)

The doc's dependency ordering is sound — **gateway first** is correct *because it doesn't exist yet*, not because of scatter (egress is already nearly one door). Everything flag-gated, byte-identical off, one reviewable stack, nothing ratified until evaluation.

| # | Layer | State | Note |
|---|---|---|---|
| 0 | Governed-fact / runtime ownership | **DONE (A1/A2 merged)** | doc Build-Order step 1 — shipped. |
| 1 | **Trusted Egress Gateway** + egress ledger + `run-egress-lint.cjs` | net-new | one `egress()`; route `openai-adapter` transport + audit `sw.js`; lint test fails on any other network call. |
| 2 | **Trust Record schema** | unify | promote `provenance` to first-class; add `privacy`, `strengths` (mandatory); keep existing chain fields. |
| 3 | **Integrity + Provenance proofs** | formalize + extend | add content hashes for memory/model/docs → upgrade Provenance to self-verifiable. |
| 4 | **Grounding Proof** | formalize | deterministic value-verify as self-verifiable; unsupported flag; model tier excluded. |
| 5 | **Privacy Proof** | net-new | reads from the gateway; **Incognito sealed-door first** (strongest, simplest). |
| 6 | **Typed memory reconciliation + check-order** | extend | Constraint decision; **Reasoning-Permission gate** (net-new); carry type+hash in record. |
| 7 | **Decision Proof (split-strength) + Trace strength-tags** | formalize | fix/relabel cost-selection; per-line strengths. |
| 8 | **Portable verifier extension** | extend | re-verify memory/doc hashes offline. |
| 9 | **Glass Box Easy/Detailed** + strength badges | net-new | five strengths visually distinct; no estimate dressed as proof. |
| 10 | Enterprise dashboard | later | — |

---

## 5. Non-negotiables carried into the build (honesty by construction)

- Every claim renders its **strength**, and the five are **visually distinct**. Self-verifiable ✓ ≠ runtime-attested ~ ≠ model-inferred ≈.
- **Privacy never claims "nothing leaked"** in-browser — only "every *recorded* egress went through one door," strongest at the sealed door.
- **Rejection rationale / cost** are estimates, never self-verifiable.
- **Model-assisted anything** is excluded from the zero-trust proof set.
- These are correct *by construction*, not bugs to weed out later. Mechanical bugs we fix on review; the honesty layer ships right or not at all.

---

**Signed,** Claude — Lead Architect seat, AUBS Design Review Board · June 29, 2026
*Trust shouldn't require faith. It should survive inspection.*
