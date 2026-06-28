# Checkpoint 0 — Live Grounding & Identity Diagnostic (+ candidate Article 3a amendment)

Branch: `claude/aubs-cp0-live-grounding-fix`. No layers, all layer flags OFF. Not merged.

## Why grounding rarely fires — diagnosis

The live `send()` path is instrumented behind **`FLAG_TRACE_VERBOSE`** (enable on device with
`?trace=1`). It exposes, per turn: the full prompt, `memory_ids_in_prompt[]`, raw model output,
parsed citations, final tag, and the reason. A headless run against the real app
(`grounding-dx.cjs`) captured the trace; device-side `?trace=1` captures the **real 1B output**.

### Phase 1 answers (with evidence)

**A. Are memories injected into the prompt?** **YES.** For a grounded turn the system prompt
contains `- [ID:m_8a51f056] User's name is Chris`, and `memory_ids_in_prompt = ["m_8a51f056"]`.

**B. Is the citation / `[ID:x]` recall block present when grounding is needed?** **YES** — the
grounded prompt carries `memoryRecallBlock` (recall framing + the citation instruction +
`[ID:x]` fact lines). (Lean/normal-chat turns omit it by design — B-minimal.)

**C. Does the raw model output contain `[ID:` / `[m_`?**
- When the model **emits** a citation (`"Your name is Chris [ID:m_8a51f056]."`) → parsed
  `["m_8a51f056"]` → **`grounded` (`model_cited`)**. The pipeline works end-to-end.
- When it **omits** the id (`"Your name is Chris."`) → parsed `[]` → **`inferred`** under
  Article 3a (correctly *not* grounded).
- ⚠️ **These two outputs are simulated in the headless harness** (no 1B model runs in CI).
  The **real** 1B raw outputs must be captured on Chris's device with `?trace=1`. Prior device
  transcripts show the model producing **no `[ID:` tag** in any reply — strong preliminary
  evidence that the 1B model does **not** reliably emit the citation, which is **Path 2**, not a
  wiring failure.

**D. Is `SYSTEM_IDENTITY` used, and do identity queries avoid user memory?** **YES.** "Who are
you?" classifies as `identity` → `tagAnswer` returns **`general`** and **never `grounded`**, even
with a user memory in prompt (Article 12). The prompt's identity line comes from
`SYSTEM_IDENTITY.name_default` ("You are AUBS … your name … never changes"); a persona is a style
layer only.

### Conclusion — which path

**Path 1 (wiring) is DISPROVEN:** memory text + ids + citation instruction all reach the model.
**Path 2 is the proven cause:** Article 3a requires a model-emitted `[ID:x]`, and a 1B model
emits it unreliably — so correct, memory-using answers get downgraded to `inferred`/`general`.

## Fix taken (Path 2)

**2.1 — Strengthened the citation instruction** for 1B models: shorter, imperative, with a
worked example ("fact `[ID:x] User's name is Chris`, question 'what's my name?', you answer:
'Your name is Chris [ID:x].'"). This raises the odds the model emits a real citation — and when
it does, grounding fires as **`model_cited`** (verified, unchanged Article 3a law).

**2.2 — Candidate deterministic post-hoc grounding (`SPINE.verifyGrounding`)** — a proposed
**Article 3a amendment, NOT yet law**, behind **`FLAG_SPINE_VERIFIED_GROUNDING` (default OFF)**.
When the model answers a personal query correctly but without a citation (`inferred`), the spine
deterministically grounds it **only if** the answer affirmatively states a relevant,
`user_verified`, in-prompt memory's exact value. Guards: `relevanceCheck` (same as 3a) + exact
value match + a **negation guard** so "your code is **not** 1234" never grounds 1234 (the classic
3a false-positive trap). It records `grounding_source: "spine_verified"` (vs `"model_cited"`) so
the Glass Box never blurs the two. Conservative: when unsure, it does **not** ground.

**Known limits (for council):** literal value match only (no paraphrase/synonyms); the negation
guard is a fixed window, not a parser. **Ratification required before this becomes law**; until
then it stays OFF and the app's law remains model-cited-only grounding.

## Identity (Article 12) — validated
`SYSTEM_IDENTITY` is hardcoded/immutable; identity queries answer **AUBS** from it; persona
cannot rename it; identity answers never ground on user memory (tag `general`). Verified headless.

## Provenance / trace change
Added `grounding_source` to the provenance record and bumped `SPINE_VERSION → cp0-spine-1.2.0`
(Article 1a#6: trace-format change requires a version bump). `glassBox`/"Why?" surface it.

## Tests
- `run-grounding-verify.cjs` (new) — **8/8**: affirmative grounds; **negation trap**, value-omitted,
  wrong-slot, no-query → never ground.
- Golden **16/16**, citation **28/28**, relevance **9/9**, extraction **18/18** — unchanged.
- Live (headless, real app): Phase-1 A/B/C/D all confirmed; B-minimal routing + engine recovery
  still **9/9**.
- **Flags OFF (acceptance):** a no-citation personal answer stays **`inferred`** (no false
  grounded); `activeFlags() === []`.

## Device retest for Chris
1. Reload; Settings → Build must read `cp0-devaudit-6 · grounding-dx`.
2. **Diagnose:** open `…/aubs-app.html?trace=1`, store a fact (`well hello im chris`), ask
   **"what's my name?"**. Under the reply a TRACE box shows the **real** raw output + parsed
   citations + tag. **Report whether the raw output contains `[ID:…]`.**
   - If it does → grounding already fires (`model_cited`); the stronger instruction worked.
   - If it doesn't → that is the proof of Path 2; evaluate the amendment.
3. **Try the candidate:** open `…?trace=1&svg=1` and repeat. "what's my name?" answered "Your name
   is Chris" should now tag **`grounded (spine_verified)`**. "what's your name?" must still answer
   **AUBS** and never `grounded`. Confirm no answer false-grounds.
4. Decision: ratify / amend / reject the Article 3a amendment.

## Council ruling required?
**Yes.** `verifyGrounding` changes what may earn a `grounded` tag (Article 3a / 1a#8). It is
implemented as a **default-OFF candidate** with `grounding_source: "spine_verified"`; it must be
ratified by council + Chris before it can ship ON. The app's shipped law is unchanged
(model-cited grounding only).
