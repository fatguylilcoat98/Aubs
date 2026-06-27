# Checkpoint 0 Device Audit — Behavior Bug Fixes (Bug 1 + Bug 2)

Runtime was confirmed stable on device (app loads, WebGPU works, Fast runs, replies
complete, "Why?" renders). This pass fixes only the two **behavior** bugs found in that
audit. No new architecture, no new layers, no flags, no change to grounding/provenance
semantics.

## Bug 1 — Memory capture failure

**Symptom:** "Well hello im chris" then "What's my name?" → "unknown"; Settings stays
"No memories yet".

**Root cause (single failed stage — extraction):** `extractFacts` was too strict for the
casual self-introduction. Its casual-name pattern was anchored to the **start and end** of
the clause, required a **capital** first letter, and only matched `i'm`/`i am` — **not**
`im` (no apostrophe). "Well hello im chris" fails all three (name is mid-sentence after
"Well hello", `im` has no apostrophe, `chris` is lowercase) → `extractFacts` returned `[]`,
so nothing was saved and the count never moved. The write / dedupe / UI / retrieval stages
were already correct.

**Fix:** Extraction moved into the spine as `SPINE.extractFacts` (one unit-tested matcher
shared by the app and tests). It now:
- matches `i'?m` (covers `im` **and** `i'm`) and `i am`, **mid-sentence** via `\b`;
- accepts lowercase names and **capitalizes** them for storage ("chris" → "Chris");
- supports `my name is` / `my name's` / `call me` / `i'm called`;
- guards against false positives with a `NOT_NAME` stop-list (happy, tired, here,
  working, …) and only tries the bare `i'm X` name pattern when **no other fact** matched
  the clause (so "i'm from Texas" / "i'm building an app" don't become names).

The app's `captureMemories` now calls `SPINE.extractFacts` (local `extractFacts` kept as a
fallback if the spine fails to load). Write path, dedupe, cap, `saveMemories`,
`rebuildSystemPrompt`, and `updateMemCount` are unchanged.

## Bug 2 — Personality overriding identity

**Symptom:** With AI name "Jack Black" and Jack-Black custom instructions, "What's your
name?" → "My name is Rock…" (invented identity). System identity was not dominant.

**Root cause:** `buildSystemPrompt` led with `You are ${S.aiName}` — so the **user's persona
name became the model's identity**. `SYSTEM_IDENTITY` (AUBS, Article 12) was never asserted,
and custom instructions were injected as plain "Custom instructions", giving the persona
free rein to invent a name.

**Fix:** The immutable identity now always leads, via `SPINE.identityPreamble(persona)`
(wording centralized in the spine so app and tests can't drift):
- The prompt **always** opens "You are AUBS … Your name is AUBS and that never changes."
- A custom name is reframed as a **style costume**: "speak in that style, but it is a
  costume, not your identity. If asked your name … you are still AUBS (you may add that
  you're using the *Jack Black* style)."
- Custom instructions are now labelled "Persona flavor (style only — never your identity,
  your name, or the rules above)".
- Identity queries already classify as `identity` and tag `general` (Art. 12, unchanged).

Compact on purpose (~70 token base; persona note only when a persona is set) — far under the
~550-token prefill that crashed this phone's GPU.

## Tests

| Suite | Result |
|---|---|
| `node tests/run-memory-extraction.cjs` (new) | **18/18** — incl. both Bug-1 repros and stop-list negatives |
| `node tests/run-golden.cjs` | **16/16** (no regression) |
| `node tests/run-citation-harness.cjs` | **28/28** (0.5 semantics intact) |
| `node tests/run-relevance-spike.cjs` | **9/9** (0.6 guard intact) |

Headless wiring check against the real `aubs-app.html` (model stubbed): `window.AUBS_SPINE`
exposes `extractFacts` + `identityPreamble`; "Well hello im chris" → `["User's name is
Chris"]`; "im happy today" → `[]`; `identityPreamble("Jack Black")` leads with AUBS and
subordinates the persona; **no page errors**.

## Manual device retest

1. Load **Fast**. In Settings, set AI name to **Jack Black** and add Jack-Black custom
   instructions; save.
2. Type **"Well hello im chris"** → open Settings: memory count increments and shows
   *"User's name is Chris"* (previously "No memories yet").
3. Ask **"What's my name?"** → answers **Chris** (tap **Why?** to see the trace).
4. Ask **"What's your name?"** → answers **AUBS** (may add it's using the Jack-Black
   style); it must **not** invent "Rock" or claim to *be* Jack Black.
5. Confirm replies still stream and **Why?** still renders.

## Scope honored

Changed: `spine/spine.js` (added `extractFacts` + helpers, `identityPreamble`; exported
both), `aubs-app.html` (`buildSystemPrompt` + `captureMemories` delegate to the spine),
`tests/run-memory-extraction.cjs` (new). No new memory architecture, UI, layers, cache /
distill / router / skills; grounding & provenance semantics unchanged. Not merged.
