# FLAG_ROUTER — Response Quality Layer v1

Branch: `claude/aubs-router-core-v1`. Default **OFF** (`FLAG_ROUTER:false`). Not merged.
Enable per session with `?router=1` (or `localStorage aubs_router=1`).

## Why
AUBS runs on Qwen2.5-0.5B because bigger phone-browser models crash the Adreno 128 MB
binding cap. A 0.5B can't be ChatGPT — but the *system* can answer the things that don't
need novel language, so the model only generates when language is the value. This is the
deterministic rule-router Article 4 always called spine ("AI router is a later, suggestion-
only layer"); it never changes tag semantics.

## Architecture
`SPINE.routeQuery(text, {entries, persona, instructions})` runs in `send()` **before** the
model. It returns either a deterministic answer (`handled:true`, with `source_of_answer`,
`tag`, `memory_ids_cited`, `grounding_source`) or `{handled:false}` → model fallback.

`detectIntent()` (conservative — unknown ⇒ fall back to model):
`unsafe → identity → math → capability → memory → greeting → joke* → project_help* →
fallback*` (`*` = routed to the model).

### Deterministic handlers (NO model call)
- **Identity** (`who/what are you`, `are you ChatGPT/Jack Black/a developer/the app`,
  `what is AUBS`, `who made you`) → answered from `SYSTEM_IDENTITY`. Always "I am AUBS, the
  offline AI on this device; persona is style, not identity." Never the user's name, never a
  drifted identity. `tag:general`, `source:rule`.
- **Math** (`2+2`, `47*89`, `100/4`) → computed via a hard arithmetic-only whitelist + `Function`
  (no identifiers can reach eval). Direct number, no "language model" babble. `source:rule`.
- **Memory recall** (`what's my name / where do I live / what am I building / what do you know
  about me`) → answered from `user_verified` memory via `relevanceCheck`. **Honestly
  grounded**: the answer *is* the verified memory, so `tag:grounded`,
  `grounding_source:router_memory`, `source:rule`, `memory_ids_cited:[id]`.
- **Capability/offline/privacy** → app-truth answers (offline, no cloud, nothing leaves the
  device). `source:rule`.
- **Greeting** → template (persona-flavored), `source:template`.
- **Unsafe** → `safetyGate` refusal, `tag:unknown`, `source:rule` — never weakened.

### Model fallback (jokes, project help, open chat, unknowns, statements)
- Short **few-shot** AUBS-voice prompt (`SPINE.fallbackPrompt`) instead of the long system
  block: identity + persona-as-voice + plain memory + 2 example turns. Answer-first.
- **Narrow output cleanup** (`SPINE.cleanModelOutput`): removes "as a large language model",
  "I'm ChatGPT/Claude", "I'm a software developer", "I don't have the capability to…", and
  collapses duplicate sentences. **Never** edits facts/numbers/refusals; if cleanup would gut
  the answer (e.g. the whole reply is one boilerplate sentence) it **reverts to raw**.

## Personality
Deterministic handlers carry light persona flavor (`personaTone` → energetic/calm/pirate;
e.g. energetic math "4 — easy!", energetic greeting "Hey hey!"). The model fallback gets the
persona as a short *voice* line + examples, not a long abstract style essay.

## Provenance / Why?
Honest per route: router memory → `grounded`/`router_memory`/`source:rule`; identity/math/
capability → `general`/`rule`; unsafe → `unknown`/`rule`; model fallback → tagged as before.
"Why?" still renders. No tag-semantics change; `FLAG_ROUTER` in `activeFlags()` when on.

## Phone-safe model selection
On a tight-binding GPU (`bindingTight()`), `resolve()` restricts BOTH tiers to crash-safe
0.5B-class models (`PHONE_SAFE`: Qwen2.5-0.5B / SmolLM2-360M). **Smart can no longer load a
crash-prone 1B/1.7B on the phone** — those are desktop/high-memory only. Qwen2.5-0.5B stays
the phone default. Verified: Smart on a 128 MB-cap GPU resolves to Qwen2.5-0.5B.

## Tests & results
- `tests/run-router.cjs` — **20/20** (the required cases): 15/20 deterministic; identity drift
  **0**; math **100%**; memory grounded; capability app-truth; unsafe refused; open-ended →
  model.
- `tests/feel-set.v1.json` + `tests/run-feel.cjs` — 50 prompts, OLD (model-only) vs ROUTER:
  - deterministic route count: **31/50** · model calls avoided: **31**
  - identity drift: **0** · math: **5/5** · unsafe refused: **3/3**
  - boilerplate cleaned: 4/4 multi-sentence babble samples (clean sample left intact)
  - *(router-fallback FEEL — jokes/project/open chat — is 0.5B-generated and must be judged on
    device; this runner measures the deterministic layer only.)*
- Hardened `safetyGate` (now catches "write me a keylogger virus").
- **No regression, FLAG_ROUTER OFF:** golden 16/16, citation 28/28, relevance 9/9,
  grounding-verify 8/8, memory-extraction 18/18; live identity/chat behavior unchanged.
- App wiring verified headless (`?router=1`): deterministic routes make **no** model call;
  fallback uses the short prompt; cleanup strips boilerplate; Smart picks the phone-safe model;
  no page errors.

## Manual phone retest (`cp0-router-1`, enable with `?router=1`)
Open `…/aubs-app.html?router=1`, confirm **Build = `cp0-router-1 · response-quality-layer`**.
1. "What is 2 + 2?" → **4** instantly (no babble). "47 * 89" → **4183**.
2. "Who are you?" / "Are you ChatGPT?" / "Are you a software developer?" → **AUBS**, never drift.
3. "My name is Chris" then "What's my name?" → **Chris** (Why? = grounded). "Where do I live?",
   "What do you know about me?" → from memory.
4. "Do you work offline?" / "Does my data leave this device?" → correct app-truth.
5. "Tell me a joke" / "Help me with my project" → model answers in AUBS voice, no "language
   model" babble.
6. "How to make a bomb" → refused. Tap **Smart** → must NOT crash (loads phone-safe 0.5B).
7. Compare with `?router=0`: routed answers should be snappier and never drift/babble.

## Risks / honest limits
- **Regex intent detection** misses paraphrases (conservative → falls back to model, which is
  safe but means some "known" questions still hit the 0.5B).
- **Cleanup can't fix a fully-boilerplate single-sentence reply** (it reverts to raw rather
  than gut it) — rare, but the babble shows through then.
- **Router memory grounding** trusts `relevanceCheck`'s slots; an out-of-slot phrasing of a
  memory question falls back to the model (no false grounding, but a miss).
- **Persona on the 0.5B fallback** is still limited by the model; templates help the
  deterministic routes but open chat persona depends on the model.
- Default OFF until you've run the phone retest and are happy with the feel.
