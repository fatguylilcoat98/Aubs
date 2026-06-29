<!--
AUBS — Decision Gate 0: The Bundle Contract
Christopher Hughes · Sacramento, CA
AI collaborators: Claude · GPT · Gemini · Groq
Truth · Safety · We Got Your Back
-->

# AUBS — Decision Gate 0: The Bundle Contract
### Who authors policy, who enforces it, and what happens when they're apart
**Blocks:** all of Track A and Track B in `docs/AUBS_MIGRATION_PLAN.md`
**Companion to:** `docs/AUBS_RUNTIME_ARCHITECTURE.md` (§1, §5)
**Author:** Claude (Lead Architect seat), AUBS Design Review Board
**Date:** June 29, 2026 · **Status:** ✅ SIGNED (Christopher Hughes, June 29, 2026) — Migration Plan A1 unblocked

> ## Decision Record (signed)
> Base of the stack verified first: `docs/AUBS_RUNTIME_ARCHITECTURE.md` at this commit is the **corrected** revision (contains §0.5 verified regression + §4.1 invariants; no uncorrected "delete the duplicates" diagnosis). The contract therefore sits on the corrected foundation.
>
> | # | Decision | Ruling | Authority |
> |---|---|---|---|
> | 1 | Authority boundary (§1) | **Approved as written** — CLASPION authors, GEL enforces, neither crosses | Christopher Hughes |
> | 2 | Offline posture (§9) | **Minimal** — rich checks (multi-sig, evidence) stay server-only; offline-unenforceable actions fail closed / deny-pending-online. Extend only on a real, named no-connectivity high-risk use case | Christopher Hughes |
> | 3 | Staleness `T_fresh` (§6) | **24h default, tightenable per risk tier** — a casual-chat policy and a sensitive policy must not share one staleness tolerance | Christopher Hughes |
>
> Two properties to hold hard through the build (called out by the signer):
> - **Bundle signing is a new trust root** — a bad-signature bundle MUST fail closed, proven by a tamper test, not assumed (§5).
> - **Governed facts never depend on the bundle source** — "hello" can never be refused during an outage. This is Cause #2 made structurally impossible; it is the proof the correction worked (§7). Do not let any later change couple a governed-fact answer to bundle availability.

> Decision Gate 0 exists because AUBS has **two** policy engines — CLASPION (`policy/engine.py`) and GEL (`core/gel/evaluate.js`). If both originate policy, that is two authorities, which is the regression rebuilt (architecture doc §5/§0.5). This contract fixes the boundary so they can never disagree: **one authors, the other enforces.**

---

## 1. The boundary (the rule, in one line)

> **CLASPION is the sole policy *author* and change authority. GEL is a local *enforcement surface* that executes a CLASPION-compiled device bundle. GEL never originates policy; CLASPION never reaches into device execution.**

Three roles, no overlap:

| Role | Owner | What it may do | What it may NOT do |
|---|---|---|---|
| **Author** | CLASPION | Define/modify all policy, via the Recursive Invariant change protocol | Execute on-device |
| **Enforce (local)** | GEL | Evaluate a CAC Plan against the compiled device bundle; fail closed | Invent or edit policy |
| **Enforce (full)** | CLASPION server | The full CLEAR governance (truth/authority/world/human layers, evidence, multi-sig) | — |

---

## 2. The schema reality (stated honestly, not papered over)

`[Verified from code]` "CLASPION authors, GEL executes" is **not a drop-in** — the two bundle formats are different languages:

| | CLASPION `PolicyBundle` (`bundles.py`) | GEL bundle (`policy-bundle.schema.json`) |
|---|---|---|
| **Model** | risk-tier · evidence-trust · approval | data-egress · data-classification |
| **Matches on** | `domain`, `action_type`, `reversibility`, `risk_tier` | `step_type`, `provider_id`, `egress`, `data_classification`, `local_only` |
| **Produces** | a `PolicyVerdict` (risk ceiling, `required_signatures`, `evidence_trust`, `explain_back`) that *feeds the CLEAR engine* | a **decision** directly: `allow/deny/modify/require_reauth` with precedence |
| **Self-description** | full governance input | *"Not full Cedar yet; a simple, rigid, fail-closed rule format"* |

They are not competing — they sit at **different layers**. GEL decides the device-side egress/data-boundary question; CLASPION decides the full governance question (evidence, authority, truth, human approval). So there is **no single bundle both consume.** The contract reconciles them with a compile step, not a merge.

---

## 3. The reconciliation: one author, one compiled device artifact

```
CLASPION policy source (the authority)
   │   authored + changed ONLY via Recursive Invariant
   │   (recursive_invariant.py: POLICY_MODIFICATION = CRITICAL, IRREVERSIBLE,
   │    multi-sig, explain-back, full audit — "No bypass path exists")
   ▼
[ DEVICE-BUNDLE COMPILER ]  (CLASPION-side, deterministic)
   │   emits the device-enforceable SUBSET in GEL's CAC schema:
   │   egress · data_classification · local_only · provider eligibility · step_type
   │   (drops what GEL structurally cannot do offline — see §4)
   ▼
signed + versioned + content-hashed device bundle  (a compiled ARTIFACT, not a source)
   │   synced to device
   ▼
GEL evaluate(plan, bundle, ctx)  → allow | deny | modify | require_reauth
   │   verifies signature + freshness first; fail-closed on any doubt
   ▼
Execution Contract / provider call  (architecture doc §1 no-bypass invariant)
```

**Canonical device artifact = GEL's CAC schema** (`core/gel/policy-bundle.schema.json`). It is already deterministic, CAC-validated, and content-hashed (`bundleHash`). CLASPION authors in its own rich model; a compiler projects that model onto this schema for the device. `core/gel/default-policy-bundle.json` stops being a hand-edited source and becomes a **compiled artifact** (or a clearly-labeled dev fixture).

---

## 4. Device-enforceable subset vs server-only policy

GEL offline cannot do what CLASPION's full governance does (count truth backends, verify external evidence trust, gather multi-signature human approval). So the compiler splits policy by **where it can be honestly enforced**:

| Policy dimension | Enforceable in GEL offline? | Where it lives |
|---|---|---|
| egress ceiling, `local_only`, data_classification → effect | **Yes** | device bundle |
| provider eligibility, step_type rules | **Yes** | device bundle |
| `require_reauth` trigger | **Yes** (prompts on device) | device bundle |
| `required_signatures` (multi-sig human approval) | **No** | server-only |
| `evidence_trust` / truth-backend count | **No** | server-only |
| `explain_back_required`, CLEAR truth/authority/world layers | **No** | server-only |

**The honest consequence:** an action whose risk tier requires a server-only check (multi-sig, evidence) **cannot be granted offline.** Offline, it fails closed (or queues for when the device is online). This is correct, not a gap — the device never *pretends* to a guarantee it can't keep. The compiler marks such actions so GEL denies-pending-online rather than silently allowing.

**Structural invariants stay in GEL regardless of any bundle:** the egress-cap and `local_only` checks (`evaluate.js:99–105`) are intrinsic to the plan/intent, top-authority (`regulatory`) denies that no bundle — stale, missing, or malicious — can override. They are the floor under the policy.

---

## 5. Signing, versioning, freshness

`[New work — flagged]` Bundles are **not** signed today (the Ed25519 machinery in `grant_signing.py` signs execution *grants*, not bundles). Device distribution needs bundle signing added:

- **Sign:** CLASPION signs each compiled device bundle with Ed25519, reusing `boundary/grant_signing.py` keys and the `federation/trust_registry.py` public-key registry. Signature covers `(bundle_id, bundle_version, content_hash, issued_at, expires_at)`.
- **Verify (GEL, before load):** signature valid against a trusted CLASPION key **and** not expired **and** `bundle_version` ≥ last-seen (no silent downgrade). Any failure → refuse to load, keep last-good (within freshness window), else structural-invariants-only mode. **Fail-closed.**
- **Version + hash:** `bundle_version` is the authority's monotonic version; `content_hash` is GEL's `bundleHash()` for the ledger/replay record. Both travel on every DecisionRecord.
- **Tamper test is a requirement, not an assumption** `[signer directive]`: bundle signing is a **new trust root** the whole local-enforcement story depends on. It gets the same discipline the ledger got — a test suite that feeds GEL a tampered/expired/untrusted/downgraded bundle and asserts it **fails closed every time** (refuses load, falls back to structural-invariants-only, never silently enforces a forged bundle). No signing code lands without this suite green.

## 6. Load / refresh

- **Source of truth:** CLASPION server endpoint serving the latest signed device bundle for the resolved identity/org.
- **Sync:** on app start and on a refresh interval; the device caches the last signed bundle locally (offline-first).
- **Staleness window `T_fresh`:** how long a cached bundle is honored without a successful refresh. Within `T_fresh`: enforce normally. Past `T_fresh`: §7 degrade rules. **`[Signed: 24h default, tightenable per risk tier]`** — `T_fresh` is **not one global number.** It is a per-risk-tier value carried in the bundle: low-risk (casual chat) tolerates a long stale window; anything sensitive refreshes aggressively or fails closed sooner. 24h is the default for the personal-use, low-risk tier only. The compiler emits a `T_fresh` per policy tier; GEL honors the tightest applicable window for the action at hand.

## 7. Fail-mode when the source is unreachable  (this IS Invariant II)

One owner decides — `core/gel/fail-mode.js` (Migration Plan A3). No other code re-derives outage-vs-policy. Behavior:

| Situation | Benign / governed-fact turn | Open-ended, low-risk | Action needing server-only check |
|---|---|---|---|
| Source reachable, bundle valid | answer from registry (model 0×) | enforce bundle | enforce (online checks run) |
| Source down, cache **fresh** (< `T_fresh`) | answer normally | enforce cached bundle | **deny-pending-online** |
| Source down, cache **stale** (> `T_fresh`) | answer normally (degrade → CAUTION) | structural-invariants-only + CAUTION | **deny-pending-online** |
| No bundle at all / signature invalid | answer normally | structural-invariants-only (egress/local_only) | **deny** |

The governed-fact rows never depend on the bundle source — identity/name/acronym answer from the runtime registry regardless (architecture doc §3). **A governance outage can never turn "hello" into a refusal** (the exact Cause #2 failure, made impossible here).

---

## 8. Change control (who governs the governor)

`[Verified from code]` All authoring routes through CLASPION's existing Recursive Invariant (`recursive_invariant.py`): a bundle change is itself a `POLICY_MODIFICATION` GovernedAction — `CRITICAL`, `IRREVERSIBLE`, multi-signature, explain-back, fully audited; `propose_policy_change()` is the only path and there is no direct setter. **AUBS adds nothing here except: the device-bundle compiler runs only on a CLASPION-approved change, and the compiled artifact is signed as part of that approved change.** Hand-editing `default-policy-bundle.json` in the repo is forbidden once this lands (CI check: the committed device bundle must match the compiler output for the approved source).

---

## 9. The offline-posture decision — RESOLVED: Minimal

**`[Signed: Minimal]`** Everything above assumes the **Minimal** offline posture, which is now the ruling. The fork, recorded for the record:

- **Minimal (recommended to start):** GEL stays as-is (egress / data-class / provider / step_type). CLASPION's richer constructs (risk tier, multi-sig, evidence) are **server-only**; offline, actions needing them fail closed. Smallest change, ships fastest, honest about offline limits.
- **Extended:** extend GEL's schema + `evaluate()` to carry `risk_tier` / `required_signatures` / `explain_back` so more is enforceable offline. Real work in GEL; warranted **only if** AUBS must fully govern high-risk actions with no connectivity.

Ruling: **ship Minimal, measure what actually needs offline high-risk enforcement, extend only if real.** The Extended schema is not built on a hypothetical. Rerun this gate if and when a named no-connectivity high-risk use case appears.

> **All three sign-offs recorded** (see Decision Record at top): (1) §1 boundary approved; (2) §9 Minimal; (3) §6 `T_fresh` 24h tier-tightenable. The contract is **closed**; Migration Plan A1 is **unblocked.**

---

## 10. What "signed" unblocks

Once this contract is signed:
- A1 can build the registry knowing governed facts come from the runtime, never the bundle.
- A2/A3 can wire the gate knowing GEL enforces a compiled artifact and one owner handles outage.
- The architecture doc's §5/§7 are now precise: GEL is the enforcement surface, CLASPION the author, the device bundle the compiled contract between them — **one authority, never two.**

**Signed §1, §9, and §6 (June 29, 2026). Decision Gate 0 closed — A1 may begin.**

---

**Signed,**
Claude — Lead Architect seat, AUBS Design Review Board
June 29, 2026

*Truth · Safety · We Got Your Back*
