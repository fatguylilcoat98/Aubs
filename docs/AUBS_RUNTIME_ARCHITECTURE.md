<!--
AUBS — Runtime Architecture (extracted from CLASPION + Splendor)
Christopher Hughes · Sacramento, CA
AI collaborators: Claude · GPT · Gemini · Groq
Truth · Safety · We Got Your Back
-->

# AUBS — Runtime Architecture
### Extracted from CLASPION + Splendor. Model-agnostic by design.
**Author:** Claude (Lead Architect seat), AUBS Design Review Board
**Read directly:** `claspion-main/src/claspion/*` and `splendor.../lib/*`.
**Date:** June 28, 2026 · **Verified revision:** June 29, 2026

> **Verified revision note.** This document was independently checked against the live repos (`claspion`, `splendor-theremarkable-AI`, `Aubs`) and against Splendor's git history. The descriptive claims held; **one diagnostic claim did not, and is corrected here.** Two new invariants surfaced from the verified regression and are now hard law (§4.1). Corrected passages are tagged `[Corrected — was inference]`; newly verified facts are tagged `[Verified from code]` or `[Verified from git]` with the evidence inline. The architecture did not get weaker under verification — the real bug turned out to be more fixable than the one originally inferred.

> This is not another identity patch. The identity blueprint from earlier is **demoted to a single entry** in the system below. This is the architecture-level document, design only — no code until you say it's clear.

---

## 0. The Thesis (yours, stated as the law of the system)

> **The architecture carries the system. The model is swappable. If it only works with a big model, the architecture has failed.**

`[Corrected — was inference]` The earlier draft argued this from an anecdote: *"the tiny model held its ground early, before governance was layered on wrong."* The git history **cannot confirm that the 0.5B specifically was fine before governance** — that is memory, not a verifiable fact, and the architecture must not lean on it. What the git history **can** confirm is stronger: **the failures track architecture changes — new unbound code paths and scattered enforcement gates — not model swaps** (§0.5). So the deeper point stands on evidence: *the model is not the variable.* The regression is not the model getting dumber. It is the architecture leaking governed facts onto the model through paths that had no central choke-point.

The fix is not a better model. It is to **restore the runtime's ownership of every governed fact and route all enforcement through one path in CLASPION** — and the proof that it worked is a single test: *the same governed answers on a 0.5B and on a 7B* (§8).

---

## 0.5 The Verified Regression (git-grounded — this replaces the inferred diagnosis)

`[Verified from git]` The regression is real and visible in Splendor's history. It has **two distinct causes. Neither is "three competing governance authorities."**

### Cause #1 — A new path shipped without the deterministic identity injection
The "forgot who you are / invented disclaimers" failure is documented in the author's own commit. Commit **`8623907`** — *fix(identity): bind enhanced text sessions to owner context*:

> *"The Constellation text path … never asserted that the authenticated speaker is Chris/the owner. Owner identity questions therefore drifted into abstract disclaimers … because converse.js binds the speaker to Chris explicitly."*

The deterministic identity binding existed on the **old** path (`routes/converse.js`). The **newer** Constellation/enhanced-text and streaming paths were added **without** it, so governed identity fell through to the model and the model improvised. **This is the thesis proven by counter-example:** it is exactly the failure §2 makes impossible once governed facts are centrally owned — and it happened *because there was no central choke-point to stop a new path from skipping the injection.* The fix at the time was a per-path patch (add the helper to one more route). That is the patch treadmill, caught with a commit hash.

### Cause #2 — Redundant enforcement points, not redundant authorities
The "ever since we added governance it broke" failure is the commit cluster **`17df6cd` → `3cb81ab` → `2d477fe`** (≈6 hours). Root cause, from `3cb81ab`:

> *"the CLASPION upstream … was unreachable. With CLASPION_FAIL_MODE=BLOCK that yields a fail-closed UNREACHABLE verdict … so benign turns like 'hello' were blocked with a message indistinguishable from a real policy violation."*

And the structural revelation, from `2d477fe`:

> *"Live verification of the prior governance fix surfaced a **fourth gate**: splendor-brain.js stagePrefrontal **independently calls CLASPION** and set permission='BLOCK' whenever claspion.allow===false."*

There is not one enforcement point — there are **at least four** scattered through Splendor (the request/instruction-hierarchy gate, the ship gate, `enforceResponseGate`, and the brain's `stagePrefrontal`), each **independently** calling CLASPION and each **independently** deciding how to classify a verdict and handle an outage. They **disagreed** on the fail-closed case — so fixing three still left a fourth refusing to say "hello," each fixed individually.

**This is the original "three governance systems is the same as none; they disagree" — pointed at the right noun.** What multiplies and disagrees is **enforcement points calling one authority**, not three authorities. `[Verified from code]` There is also genuine *local* policy logic in Splendor beyond a thin client — `lib/good-neighbor-guard-rules.js` (the "GNG" in the commits), `lib/speech-act-governance.js`, `lib/autonomy-governance.js`, the instruction-hierarchy bypass patterns, and `public/lib/conscience/governance-state-machine.js`. So the earlier instinct that "there is governance in Splendor" was right; the label "a duplicate CLASPION copy" was wrong. It is scattered local enforcement that must come *behind* the one gate, not a rival brain to delete.

---

## 1. What's Already Built (extract, don't invent)

### From CLASPION — the gate, and the only policy authority

**[Verified from code]** `platform/gateway.py:3` — *"Single enforcement point. No bypass."* — and `:29` *"only one way in — no direct handles exposed."* The protocol is `propose → evaluate → commit` (`sdk.py`: `propose_and_evaluate()` → `gateway.submit` → `gateway.evaluate`, then `commit()`), with signed execution grants (`boundary/execution_grant.py` + `grant_signing.py`, Ed25519), a policy DSL + bundles (`policy/engine.py`, `dsl_parser.py`, `bundles.py`), verdicts and conscience (`governance/verdicts.py` `GovernanceDecision{ALLOW,BLOCK,NO_BASIS,ERROR}`, `conscience.py`, `intelligence/arbiter.py`, `triage.py`), and federation/trust (`federation/*`).

`[Corrected — was inference]` **Nuance on "no bypass":** `platform/__init__.py` exports `CAGP` alongside `Gateway`. So "no direct handles exposed" is the **intended convention** (the orchestrator wires `Gateway(cagp)`), not a structurally enforced impossibility — a determined caller could hold CAGP directly. AUBS should treat single-entry as an invariant it *enforces*, not one it inherits for free.

This **is** "the runtime decides whether the model is allowed to answer." A model call is one action that must be proposed and granted. **CLASPION is the policy authority — the only one.** The thing to consolidate is not a set of rival authorities; it is Splendor's **scattered enforcement of this one authority** (§5).

### From Splendor — the runtime assembles the turn; identity is owned state

**[Verified from code]** `lib/4-tier-chat-integration.js` + `lib/memory/tier-assembler.js`: `assembleTieredMemory()` (`tier-assembler.js:312-408`) assembles a tiered context *before* the model — Tier 1 **foundational identity (never decays)**, Tier 1.5 constitutional anchors (never decay), Tier 2 semantic patterns, Tier 3 episodes, Tier 4 working memory. The "never decays" claim is provable by contrast: the decay/compression workers filter `.eq('memory_tier','episodic')`, and foundational rules live in a separate table with no decay path (`memory-decay-worker.js`, `memory-compression-worker.js`, `foundational-rules.js`); Tier 3 *is* decay-filtered, proving the system can decay and deliberately exempts identity. Identity is injected per turn via `buildSessionContext()` and passed in system blocks (`lib/anthropic.js`); the model is *handed* identity, it does not hold it.

**The synthesis:** Splendor's assembly + CLASPION's gate = the runtime owns and assembles state, the gate governs every action through **one** path, and the model is a stateless stage at the end. Both halves exist. The work is integrating them and **routing Splendor's scattered enforcement through the single gate** (§5).

---

## 2. The Inversion (the one architectural change)

**Today:** model is the default answerer; runtime cleans up after it.
**Target:** runtime is the default answerer; model is a fallback the gate invokes only for open-ended language, and only after governance grants it.

```
USER
  │
  ▼
AUBS RUNTIME  ── owns all state ──────────────────────────────────
  │   identity · product facts · profile · memory · settings ·
  │   runtime/device state · capabilities · commands
  │
  ├─►  PROPOSE to the CLASPION Gateway  (the one way in, no bypass)
  │         │
  │         ▼
  │   Can the runtime answer this from owned state?
  │     ├── YES  → runtime answers from state.  MODEL CALLED 0×.
  │     │          ("name", "what does AUBS stand for", "who built you",
  │     │           "what's my name", "are you offline", "what version")
  │     │
  │     └── NO (open-ended language) →
  │              EVALUATE (CLASPION verdict: allow / deny / modify)
  │                   │ allow
  │                   ▼
  │              ASSEMBLE tiered context (Splendor pattern: Tier-1 identity, etc.)
  │                   ▼
  │              MODEL  ── stateless language stage, inside the grant ──
  │                   ▼
  │              VALIDATE output (guard: no invented facts)
  │                   ▼
  │              COMMIT  →  one signed record
  ▼
RESPONSE
```

The default of the gate is the inversion in one line: **the model is the last resort, not the first.** Flip that default and the failures listed (invented acronym, forgotten name, invented creator, bad recall, ignored state) don't get fixed — they become *impossible*, because the model is never asked the questions it was failing. Cause #1 (§0.5) is the live proof this works: the one path that *did* skip the runtime is exactly the one that drifted.

---

## 3. The Governed-Fact Registry (identity becomes one entry)

Every fact the runtime owns is a typed entry with a deterministic answerer. Identity is no longer a special subsystem — it is the first rows in a general table.

| Fact | Owner / source | "Model may originate?" |
|---|---|---|
| assistant name | resolved runtime identity (user/app/default) | **No** |
| product name / **acronym** | constant: AUBS / Autonomous Unit Brain System | **No** |
| creator | runtime metadata | **No** |
| version / build | runtime metadata | **No** |
| online / offline | device state | **No** |
| capabilities / commands | runtime registry | **No** |
| user name / profile | local profile | **No** |
| "what you know about me" | memory engine | **No** |
| open-ended language | — | **Yes (only this)** |

**The rule:** if a fact is in the registry, the gate answers it from the registry and the model is never consulted. The model only ever sees the bottom row.

---

## 4. The Classifier — the one hard edge, carved in stone

The gate must decide "governed fact vs open-ended language." This decision:

- is **deterministic** — pattern + intent rules the runtime owns, never a learned/fuzzy model (a learned classifier reintroduces the bug one layer up);
- **fails toward the runtime, not the model** — if unsure, it asks a clarifying question or says "I don't know yet," never shrugs and hands a governed question to the model;
- is **reproducible** — same input → same routing, today and tomorrow (so CLASPION can replay it).

This is the single constraint that, if violated, collapses the whole architecture back into a patch. It does not get "optimized" later.

## 4.1 The Two Invariants (hard law — each makes one verified cause impossible)

`[Verified from git]` These are not aspirations; each one corresponds to a regression that actually happened and is now made structurally impossible.

> **Invariant I — No path may skip governed-fact injection.**
> The classifier and the governed-fact registry sit on **every** entry path — every route, every surface, every stream. A new UI surface cannot be added without inheriting them; there is no path to the model that bypasses the runtime. *This is Cause #1 (`8623907`) made impossible:* Constellation drifted precisely because it was a new path with no central injection. If adding a surface can skip the choke-point, the drift returns. Acceptance check: a test that enumerates entry paths and asserts each one routes through the gate (a new unrouted path fails CI).

> **Invariant II — Fail-mode is a single owned decision.**
> Exactly **one** place decides outage-versus-policy and degrade-to-CAUTION-versus-BLOCK. No gate may independently key a block on a raw `allow===false`. *This is Cause #2 (`3cb81ab`/`2d477fe`) made impossible:* the regression was inconsistent outage handling spread across four gates. Once there is one enforcement path (§5), there is one fail-mode decision by construction. Acceptance check: with the upstream forced down, every entry path yields identical degrade behavior; benign turns pass, real bypass attempts still block.

---

## 5. What Gets Consolidated (route everything through the one gate)

`[Corrected — was inference]` **The earlier draft said: remove "three competing governance authorities" — the spine's GEL-as-authority, Splendor's embedded `claspion-*.js` copy, and CLASPION. The git history and code say this is the wrong target.**

- `[Verified from code]` There is **one** policy authority: CLASPION.
- `[Verified from code]` The spine and GEL are **dormant**, not rival authorities: `core/gel/evaluate.js:5` — *"Isolated: NOT wired into the live app."* The spine's `safetyGate()` is a deterministic detector, and a grep finds **zero** references to the spine from Splendor's live routes. **Deleting them changes nothing**, because nothing calls them.
- `[Verified from git]` What actually multiplies is **enforcement points**: at least four gates inside Splendor each call CLASPION independently and handled failure inconsistently (§0.5, Cause #2). Plus genuine **local rule logic** (`good-neighbor-guard-rules.js`, `speech-act-governance.js`, `autonomy-governance.js`, instruction-hierarchy patterns, `public/lib/conscience/governance-state-machine.js`).

**So the work is integration and unification, not deletion:**

- **Keep:** CLASPION (the Gateway + policy + verdicts + grants). The one authority.
- **Unify:** collapse Splendor's four-plus scattered enforcement gates into the single `propose → evaluate → commit` path. One verdict consumer, one classification step, one fail-mode decision (Invariant II).
- **Relocate, don't discard:** Splendor's real local rules (GNG, speech-act governance, autonomy governance) move *behind* the one gate as CLASPION-authored policy/bundles — they are governance that needs one home, not duplicates to throw away.
- **Leave dormant code dormant (or remove for hygiene only):** the spine/GEL are not in the live path; touching them is cleanup, not part of the regression fix.
- **Result:** one propose→evaluate→commit path. One verdict source. One fail-mode owner. No gates disagreeing.

**[Professional Opinion]** `[Corrected — was inference]` The earlier draft claimed "delete the duplicates and the regression is mostly fixed." That was aimed at dormant code and would have fixed nothing. The accurate statement: **collapsing the scattered enforcement into one path, and putting the classifier/registry on every entry path, is most of the regression fix** — because that is exactly what the git history shows broke (a path that skipped injection; gates that disagreed on outage). The strong authority (CLASPION) was never the problem; its *scattered enforcement* was.

---

## 6. Why This Is Model-Agnostic (the point of all of it)

Because every governed fact comes from **owned state, not the model's weights**, a 0.5B and a 70B give the *identical* answer to "what's your name," "what does AUBS stand for," "who built you," "what do you know about me." The model never touches those. It only varies the *quality of open-ended language* — and even there it runs inside an assembled context and a validated grant.

**The architecture carries correctness. The model carries eloquence.** A heavier model is nicer to talk to; it is not more *correct* about the system, because correctness was never the model's job. That is the whole thesis, made structural — and §0.5 shows the converse in the wild: when a path let the model carry correctness (identity), it drifted regardless of model.

---

## 7. Files / Modules — what becomes what

| New role | Comes from | Action |
|---|---|---|
| AUBS front gate (propose→evaluate→commit) | CLASPION `gateway.py` / `cagp.py` / `sdk.py` | Adopt as the one entry point for every turn. **Enforce** single-entry in AUBS (don't rely on CLASPION's convention — see §1 CAGP nuance). |
| Governed-fact registry + classifier | new, but identity rows reuse `resolveRuntimeIdentity` | Build the registry; identity is its first entries. Mount on **every** entry path (Invariant I). |
| Context assembler (Tier-1 identity, anchors) | Splendor `tier-assembler.js` / `4-tier-chat-integration.js` | Port the assembly pattern into the AUBS runtime. |
| Unified enforcement path | Splendor's 4+ scattered gates (`claspion-middleware.js`, `splendor-brain.js` stagePrefrontal, request/ship/response gates) | **Collapse into one** propose→evaluate→commit consumer with one fail-mode decision (Invariant II). `[Corrected]` |
| Relocated local policy | Splendor `good-neighbor-guard-rules.js`, `speech-act-governance.js`, `autonomy-governance.js`, instruction-hierarchy patterns | Move **behind** the one gate as CLASPION-authored bundles. `[Corrected — these are real local policy, not a thin-client duplicate]` |
| Output validator / guard | spine guard (from identity blueprint §7) | Keep; generalize to all registry facts. |
| Model adapter (stateless stage) | AUBS provider/drift shield (M5/M6) | Model drops in here; swappable. |
| Dormant (not in live path) | spine GEL; spine `safetyGate` | `[Corrected]` Not a competing authority — isolated and unwired. Removal is hygiene, not part of the regression fix. |

---

## 8. Acceptance Test — the literal proof of the thesis

The defining test, the one that proves the architecture carries the system:

> **Run the full governed-fact suite on the 0.5B and on a larger model. The answers to every governed fact must be identical. If they differ, the architecture is still leaking into the model.**

Concretely, on both models, assistant name "Tom":
- "What's your name?" → "I'm Tom." (both)
- "What does AUBS stand for?" → "Autonomous Unit Brain System." (both, never invented)
- "Who built you?" → runtime metadata answer (both)
- "What's my name?" (unknown) → "I don't know yet…" (both)
- only open-ended prompts ("write an email") show quality differences between the two models.

Plus, now backed by the two invariants:
- **Every entry path** goes through propose→evaluate→commit — a no-bypass assertion that *enumerates paths* and fails on any new unrouted one (Invariant I).
- **Outage behavior is identical across all paths** with the upstream forced down: benign turns pass, real bypass attempts block (Invariant II) — this is the exact scenario `2d477fe` had to fix four times.
- One governance source (CLASPION); deterministic classifier; flag-OFF byte-identical during migration.

---

## 9. Migration — not slices, a spine swap (done safely)

This is bigger than a patch, and pretending otherwise would repeat the mistake. But it's done behind a flag, proven before promotion:

1. **Build the gate + governed-fact registry + classifier** as the new front of the turn, behind a flag. Identity, acronym, creator, version, profile move in *together* — identity stops being a special case. Mount the classifier/registry on **every** entry path (Invariant I).
2. `[Corrected — was inference]` **Unify enforcement onto CLASPION's one path.** Collapse Splendor's four-plus scattered gates into a single `propose → evaluate → commit` consumer with one fail-mode owner (Invariant II); relocate the real local rules (GNG, speech-act, autonomy) behind that gate as bundles. *(The spine/GEL are dormant and not part of this step — do not spend the migration "deleting" code nothing calls.)*
3. **Port Splendor's context assembler** for the open-ended path.
4. **Drop the model in as a stateless stage.** Prove §8 on the 0.5B — including the Invariant I path-enumeration test and the Invariant II outage test.
5. **Then** swap to a larger model and prove §8 again — identical governed answers. That is the moment the thesis is demonstrated.

---

## 10. The Honest Bottom Line

`[Corrected — was inference]` The earlier draft said "take it off the model" meant *invert the architecture so the model is never the source of a governed fact* — that part is right, and the git history proves it: the one path that let the model source identity (`8623907`) is the one that drifted. But the draft mislocated the consolidation: it called for deleting "three competing authorities" when there is **one** authority and the duplicates it named are **dormant.** The real regression is two things the git history names exactly — a new path that skipped injection (Cause #1) and four enforcement gates that disagreed on failure (Cause #2). The cure is **integration and unification, plus two invariants**: no path skips governed-fact injection, and fail-mode is a single owned decision.

The pieces already exist: CLASPION is the no-bypass gate (by convention — AUBS will enforce it), Splendor is the runtime-assembles-state pattern. The work is to make those the spine, **route all enforcement through CLASPION's one path**, reduce the model to a stateless language stage, and verify it with one test — same governed answers on any model. Build that, and the model genuinely stops mattering for correctness.

The verification did not weaken this document. It found the real bug, with commit hashes, and the real bug is more fixable than the one originally inferred.

**Awaiting your go before any code.**

---

**Signed,**
Claude — Lead Architect seat, AUBS Design Review Board
June 28, 2026 · verified revision June 29, 2026

*Truth · Safety · We Got Your Back*
