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

## Runtime stability follow-up (device crash, same audit)

Device testing of the Bug-2 fix surfaced a crash on longer chats: after a few turns the
model returned empty (`finish: length`) and the next call failed with **"Model not loaded …
maxBind:128MB · TIGHT"**. This is not a behavior bug — it's the phone's Adreno GPU hitting
its **128 MB buffer binding cap**. Prefill (system prompt + sent history) drives that buffer,
and the app was sending up to **24 prior turns**, so by ~turn 5 the accumulated context
pushed prefill past the fault threshold; once the GPU faulted mid-generation the engine
dropped to "Model not loaded" with no auto-recovery for that error.

Two prefill-shrinking changes (no new layers, no engine-recreate — that path previously
caused the half-loaded state):
- **Compacted `identityPreamble`** (~half the persona text) — keeps AUBS dominance, fewer
  tokens paid every turn. The Bug-2 enlargement is what nudged the ceiling closer.
- **`CTX_MSGS` 24 → 6** — the model's working context is capped at ~3 exchanges. The **full
  thread and all memories are still kept** in the UI/storage; only what's sent to the model
  shrinks, keeping prefill well under the fault threshold.

Estimated worst-case prefill for the Jack-Black persona case drops from ~520 tokens (at the
~550 fault zone) to ~420. Device retest: hold a 6+ turn conversation and confirm no "Model
not loaded" / empty-reply crash.

## Retrieval / prompt-assembly audit (follow-up — "memory not recalled")

Device report: after "well hello im chris" stored a memory (counter → 1), the very next
turns didn't recall it ("I'm not Chris, I'm AUBS"; "I don't know what you're referring to").
Hypothesis was a broken retrieval pipeline. **Audited the full path by driving the real app
with a model stub that records the exact `messages` sent to WebLLM** (`retrieval-audit.cjs`,
`retrieval-audit-reload.cjs`).

Result — the memory is supplied correctly at every stage; **it never disappears**:

| Stage | Result |
|---|---|
| returned from storage | ✅ `["User's name is Chris"]` in `localStorage` |
| `adaptMemories` / `liveEntries` | ✅ live + `user_verified` |
| filtered out? | ✅ no |
| in `memory_ids_in_prompt` | ✅ `[ID:m_8a51f056]` |
| `build_prompt` inserts text | ✅ yes |
| **final prompt to WebLLM** | ✅ `- [ID:m_8a51f056] User's name is Chris` — in-session **and** after a full reload |

So the defect is **downstream of assembly** — a 1B model not acting on a correctly-supplied
fact. Causes: (1) the recall framing only fired "when asked what you remember", which a small
model doesn't map from "what's my name?"; (2) the identity line ("Your name is AUBS") competed
with "User's name is Chris", producing "I'm not Chris, I'm AUBS"; (3) the device test used the
*statement* "Im chris", not the *question* "what's my name?".

**Fix (prompt-framing only, no new feature/layer):** `memoryRecallBlock` framing is now
*enabling* and disambiguated — "Known facts about the USER … use them to answer the user's
questions about themselves — e.g. if the user asks their own name, answer with the name below.
Your own name is still AUBS; do not confuse the two." The `[ID:x]` lines + citation
instruction are unchanged (citation/relevance/golden suites still pass). Best-effort for a
small model — needs device confirmation with an actual **question**.

**Device retest:** type `well hello im chris` → send → wait for reply, then ask **"what's my
name?"** (a question). Expect "Chris". Statements like "im chris" are not recall prompts.

## B-minimal prompt split + engine recovery (device UX/runtime recovery)

Device testing showed normal chat felt over-governed (stilted 1B output) and the engine
hit "Model not loaded" by turn 3. Two changes, no new layers:

**B-minimal — lean-by-default, grounded-on-demand.** The system prompt is now built
**per turn** in `send()` based on the query:
- **Lean (default — normal chat):** `SPINE.identityPreamble(persona, {lean:true})` (one short
  identity line + a light "speak in X style" cue) + plain memory facts (`A few things you
  know about the user: …`). **No citation instruction, no recall governance.**
- **Grounded (identity / personal / provenance questions):** full identity preamble (immutable
  name + persona containment) + `memoryRecallBlock` (`[ID:x]` + citation instruction), so
  verifiable grounding and "Why?" still work.
- The switch is `needsGrounding(text)` — `SPINE.classify` is `identity`/`personal`, or a
  provenance trigger ("why did you…", "how do you know", "what do you remember"). Examples:
  "Hello" / "tell me a joke" → lean; "what's my name?" / "who are you?" / "why did you say
  that?" → grounded.

**Engine recovery.** `recoverEngine()` was defined but never called, and "Model not loaded"
wasn't treated as recoverable. Now the retry loop matches a broader `RECOVERABLE` set
(`GPUBuffer|mapAsync|unmapped|device is lost|disposed|not loaded|reload(`), and on such a
fault it recreates the engine from the **cached** model (no re-download), waits, and retries
the **same** prompt **once**. A `recovered` one-shot guard prevents any retry loop; a real
error is shown only if recovery itself fails. (The earlier build recreated mid-fault and
raced; this recovers only when the engine is already dead and awaits a full reload.)

**Verification (headless, real app):** 9/9 — "Hello"/"joke"/intro route lean; intro still
stores the memory; "what's my name?" routes grounded with `[ID:]` + the fact; "what's your
name?" stays AUBS with the persona active; "why did you say that?" routes grounded; a forced
"Model not loaded" self-heals (engine recreated once, user still gets the reply, no error
shown). Golden 16/16, citation 28/28, relevance 9/9, extraction 18/18 unchanged.

**Device retest:** Settings → Build must read `cp0-devaudit-5 · lean-chat+recovery`. Then:
"Hello" feels friendly; hold 6+ turns (no "Model not loaded"); `well hello im chris` →
Settings shows the memory; ask **"what's my name?"** → Chris; ask **"what's your name?"** →
AUBS (persona styling OK); "Why?" still renders.

## Scope honored

Changed: `spine/spine.js` (added `extractFacts` + helpers, `identityPreamble`; exported
both), `aubs-app.html` (`buildSystemPrompt` + `captureMemories` delegate to the spine),
`tests/run-memory-extraction.cjs` (new). No new memory architecture, UI, layers, cache /
distill / router / skills; grounding & provenance semantics unchanged. Not merged.
