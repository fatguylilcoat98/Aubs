<!--
AUBS — Runtime-First Architecture
Christopher Hughes · Sacramento, CA · The Good Neighbor Guard
Truth · Safety · We Got Your Back
-->

# AUBS — Runtime-First Architecture
### Run the entire runtime BEFORE the LLM. The model is the last resort, maximally scaffolded.
**Author:** Claude (Lead Architect seat), AUBS Design Review Board · **Date:** June 29, 2026
**Status:** master blueprint — drives the build. Marks what's built ✅, extend ◑, new ☐.

> **The law (extended):** the architecture carries the system. So put *everything that can be
> deterministic* into the runtime, and consult the model only for genuinely open-ended language —
> and even then, hand it a fully-assembled, governed, guarded turn. Every fact the runtime can
> own, it owns. Every intent the runtime can answer, it answers (model 0×). Every turn the model
> *does* touch, the runtime frames it and validates the output. The bigger the runtime, the
> smaller, cheaper, more private, and more consistent the model's job becomes.

The proof it's working: on-device, "who created you / what does AUBS stand for / what's your
name" already answer from the runtime, model 0×, with a signed Trust Record. This doc maximizes
that surface.

---

## 0. Constitutional guarantees (🔒 never regress)

Above the four maturity stages (Implemented / Integrated / Verified / Observed) sits a fifth,
stricter class: **🔒 Constitutional.** These are not features — they are guarantees the system
makes about itself. A feature can be deferred; a constitutional guarantee may never silently
regress. If one breaks, that is *architecture damage*, not a normal bug, and the build goes red.

- 🔒 **The runtime owns identity.** Name / product / acronym / creator / version come from owned
  state, never the model's weights.
- 🔒 **The runtime owns memory recall.** Recall before reasoning; stored personal facts are
  answered from owned memory, and honestly ("I don't know yet") when absent — never invented.
- 🔒 **Governed facts are model 0×.** A governed answer is produced without consulting the model.
- 🔒 **A Trust Record exists for every answer**, with a declared proof strength that can never
  silently increase itself.
- 🔒 **The Glass Box reflects real execution** — it renders the Trust Record, not a narrative.
- 🔒 **The door was locked.** When nothing needs to leave, nothing leaves; egress is the single
  audited door.

**These are enforced by an executable test, not by assertion.** The **Architecture Independence
Test** (`tests/run-architecture-independence.cjs`, a.k.a. the Model Independence Proof) runs the
full governed-fact battery through the real pipeline against five wildly different backends —
0.5B, 7B, 70B, cloud, and a **HOSTILE model that actively lies about identity** — and proves
every governed answer is **byte-identical**, the model is called **0×** on governed turns (the
liar cannot corrupt a single fact), and **only open-ended language varies** by model. It runs
**first, on every merge, forever** (CI: `.github/workflows/ci.yml`). If it ever fails, something
leaked into the model. *The architecture carries correctness; the model carries eloquence —
and now that sentence is a green check, not a slogan.*

---

## 1. The pre-LLM runtime stack (every turn runs ALL of this first)

Ordered. Each layer can resolve the turn (model 0×) or enrich it for the next. The model is
reached only if every prior layer declines.

```
USER TURN
  1. Safety gate ............... harm check, always first                    ✅ spine.safetyGate
  2. Constraints .............. hard limits; violated → stop                 ◑ (in GEL)
  3. Policies ................. CLASPION-authored, precedence                 ✅ GEL
  4. Governed-Fact Registry ... runtime OWNS the answer? → answer, model 0×  ✅ core/facts (expand §2)
  5. Reality Context .......... date/time/location/device — runtime truth    ☐ (§5)
  6. Deterministic Responders . greeting/thanks/math/units/commands          ◑ spine.routeQuery (expand §6)
 6b. Knowledge Packs ......... owned corpora (lexicon ✓; reference = cited)  ◑ core/knowledge (§6b)
  7. Memory-First Answer ...... answer in owned memory? → answer, model 0×    ✅ recall (§7)
  8. Reasoning Permission ..... is the model even allowed to answer?          ✅ core/trust
  9. Context Assembly ......... build the tiered context the model will see   ◑ (§4 — Splendor pattern)
 10. Model Selection ......... cheapest capable enabled model                 ◑ eligibility
 11. MODEL (last resort) ...... open-ended language, IN-PERSONA, scaffolded   ✅ provider/drift-shield
 12. Output Guards ........... identity/persona/fact-injection/grounding      ◑ identityGuard (expand §8)
 13. Trust Record + Glass Box  one signed record; honest per-claim strength   ✅ core/trust
```

**Goal metric:** maximize the share of turns resolved at layers 1–9 (model 0×), and for the
rest, maximize how much of layers 5/9/12 scaffold and validate the model. Track "% model-0×" as
a first-class product metric.

---

## 2. The Governed-Fact Catalog — own everything ownable

The registry is the heart. Expand it from identity-only into a broad, typed table. Each row:
`{ id, category, owner/source, answerer, model_may_originate:false }`. Categories:

| Category | Facts to own | Source | State |
|---|---|---|---|
| **Identity** | assistant name · product (AUBS) · acronym · creator · version/build · persona name | resolved runtime identity / constants / metadata | ✅ (name/acronym/creator/version) |
| **Reality / runtime** | current date · time · day-of-week · timezone · "today/tomorrow/this year" · online/offline · device · locale · units | device/runtime clock + locale (§5) | ☐ |
| **User profile** | user name · location · occupation · pronouns · stated facts | local profile / memory | ◑ (name via identity; rest via memory §7) |
| **Capabilities / commands** | what it can do · available commands · offline ability · privacy posture | runtime capability registry | ◑ (capabilities partial) |
| **Product / domain knowledge** | what AUBS is · how privacy works · pricing/packs · "is my data safe" · model info | AUBS knowledge cards (runtime-owned canned truth) | ☐ |
| **Persona facts** | who the assistant is *being* · its boundaries · its values | persona system (§3) | ☐ |
| **open-ended language** | — | the model | ✅ (the only model-originated row) |

**Rule unchanged:** if it's in the registry, the gate answers it; the model is never consulted.
Reality facts (date/time) are the highest-value next add — the model *will* hallucinate them
(it answered "January 1st, 2023"); the runtime always knows.

---

## 3. The Persona System — personality as OWNED runtime state (the centerpiece)

Today the persona is a free-text instruction ("talk like Trump") the model improvises on — thin
and inconsistent. Runtime-first inverts it: **the runtime owns the persona; the model only
performs it.** Persona governs *style/voice*; governed facts govern *truth*. They compose.

### 3.1 Persona as structured state
A persona is typed runtime state, app- or user-declared, never invented by the model:
```jsonc
Persona {
  id, name,                       // "trump", display "Trump"
  archetype,                      // e.g. "bold-confident-populist"
  voice: { tone, cadence, formality, energy },
  speech_patterns: [ ... ],       // characteristic phrasings/structures
  signature_phrases: [ ... ],     // catchphrases (used sparingly, deterministically seedable)
  values: [ ... ],                // what it cares about / champions
  boundaries: [ ... ],            // never-do: no slurs, no real-person defamation, stay safe
  refuse_style,                   // how it declines, in-voice
  fallback_register               // neutral voice when persona must yield (safety/governed facts)
}
```

### 3.2 How the persona runs (deterministic where possible)
- **Inject, don't hope:** the runtime assembles the persona into Tier-1 of the context (§4) — a
  compiled system instruction from the structured fields, not a raw user string. Same persona
  in → same framing out.
- **Governed facts answer in-voice (optional, deterministic):** "What's your name?" with the
  Trump persona can deterministically render *"I'm Trump — the best, believe me."* The *fact*
  (name) stays runtime-owned and model-0×; the *styling* is a deterministic persona template, not
  a model call. (Default: plain governed answer; persona-styled governed answers are a tier-up.)
- **Persona guard (post-generation):** like `identityGuard`, a deterministic guard enforces the
  persona contract on model output — never breaks character into "as an AI language model," never
  crosses `boundaries`, keeps the declared register. Strips/rewrites violations.
- **Safety & truth outrank persona, always:** a persona can never override a Constraint, a
  governed fact, or the safety gate. Persona yields to `fallback_register` when it must.

### 3.3 Persona library + swap
Multiple personas as swappable runtime state (`trump`, `professional`, `best-friend`, `coach`,
app-declared brand personas). Switching persona changes voice instantly with **zero model
retraining** — the architecture carries it. This is a product surface (and a monetizable one:
persona packs, like the theme packs already in Settings).

### 3.5 The Persona Activation Engine — anyone, anything
The deepest statement of the thesis, applied to personality: **the model is the knowledge store;
the architecture is the activation layer.** The LLM already *contains* who Donald Trump is — his
cadence, vocabulary, rhythm. It contains the pirate, the 1950s radio host, the gentle grandmother,
the sardonic professor. What it lacks is the *decision* to become one, the *structure* to hold it,
and the *governance* to keep it honest. The runtime does not need to know how the subject talks —
it knows how to **activate** any subject and keep the truth underneath from moving.

So a persona request is not limited to a built-in library. ANY free-text request — a real person,
a fictional character, a role, or a pure tone — is parsed deterministically into a structured
**activation** (`parseActivation` → `{ subject, mode }`) the runtime owns, then compiled
(`compilePersona`) into an instruction that *leans on the model's knowledge of the subject*:
- **impression** (a named figure, e.g. "Donald Trump") and **character** (a role, e.g. "a grizzled
  pirate captain") → *"perform the voice and manner of X; draw on what you know about how X speaks
  — cadence, vocabulary, signature phrasing, rhetorical habits, energy — and commit to it fully."*
- **register** (a pure tone/trait, e.g. "very sarcastic", "warm and brief") → *"adopt this style
  and tone; let it shape word choice, rhythm, and energy."*

**Honesty is carried by construction, two ways.** (1) Embodiment instructions for a subject always
include the explicit clause: *"This is a performance of STYLE, not a change of identity: you remain
<name>. If asked who you really are, answer honestly — never claim to literally be <subject> or a
human."* (2) More fundamentally, identity *questions* never reach the persona at all — the
governed-fact layer (§2–§4) intercepts "who are you / what are you / who made you" *before* the
model (model 0×) and answers from runtime-owned truth. So you get the subject's **voice** on
open-ended talk and AUBS's **facts** on identity questions. **Style and truth compose; neither can
overwrite the other.** Swap the model and the activation still works — only the rendered voice
changes, because the activation lives in the runtime.

### 3.6 Persona comprehension (persona ⟂ knowledge)
The architecture should *understand* the words a persona is made of, not hope the model does. When a
persona is set, the runtime extracts its descriptive words and **pulls their meaning from the owned
dictionary** (Pack #2), folding the glosses into the compiled instruction: "be cheerful" → *cheerful
— full of good spirits; merry*; "you're a vampire" → *vampire — a blood-sucking reanimated body*.
The honest split holds: for a **real person** ("Donald Trump") the dictionary is **not** consulted
(it would only mis-define "trump" the noun) — the model supplies the person; for **traits and
characters** the dictionary comprehends them. Only words the dictionary actually knows are attached
(nothing invented), capped to keep the prompt lean. Implemented as `personaDescriptors` +
`comprehendPersona(persona, define)` with `define` injected from the definitions pack — persona stays
dependency-free and fully testable. In the app it's cached per-persona and the prompt is rebuilt once
the (lazy) dictionary is ready. Tests: `run-persona` (comprehension block).

### 3.4 Why this is the right place for it
Persona-in-the-model = inconsistent, unprovable, leaks into reasoning, dies on a model swap.
Persona-in-the-runtime = consistent, inspectable, swappable, model-agnostic, and **governed**
(boundaries enforced deterministically). Same thesis as identity: the runtime owns *who it is*;
the model only supplies eloquence.

---

## 4. Context Assembly — what the model sees when it IS called (Splendor tier pattern)

When the turn reaches the model, the runtime hands it a fully-assembled, ordered context — the
model never reaches for state, it is handed it:
1. **Tier 1 — Identity + Persona** (compiled, never decays): who it is, who it's being, boundaries.
2. **Tier 1.5 — Constitutional anchors**: safety, truth, the creed; non-negotiable.
3. **Tier 2 — Reality context**: date/time/location/device (so it never hallucinates "the date").
4. **Tier 3 — Relevant memory**: typed, provenance-tagged, only what's pertinent + permitted.
5. **Tier 4 — Working context**: the recent turns.
The model receives assembled state inside a validated grant (Execution Contract). Port the
Splendor `tier-assembler` pattern into AUBS. ◑

---

## 5. Reality Context — own date/time/place/device (next build, easy + high-value)

The runtime always knows these; the model must never answer them.
- `date`, `time`, `day_of_week`, `timezone`, relative terms ("today", "tomorrow", "this year").
- `online`/`offline`, `device`, `locale`, `units` (metric/imperial), battery/network if available.
- Governed answers: "What's the date?" → from the device clock, model 0×. ("January 1st, 2023"
  hallucination → impossible.)
- Also injected into Tier-2 of context (§4) so model turns are time-aware. ☐

---

## 6. Deterministic Responders — answer the common stuff without the model

Expand `routeQuery` into a broad deterministic responder set (model 0×): greetings, thanks,
goodbyes, "how are you", math (✅), unit/temperature/currency conversion, simple date math,
command words ("clear", "help", "what can you do"), yes/no confirmations. Each in-persona-styled
where it adds warmth, plain where it adds clarity. The more here, the fewer model calls. ◑

---

## 7. Memory-First Answering — if we already know, don't ask the model

> **DOCTRINE (constitutional ordering, not a feature).** The order is fixed and one-directional:
> **Runtime Truth → Memory Recall → Governed Facts → LLM.** Never *LLM → maybe memory*. The runtime
> is the authoritative source for user-specific knowledge; the model is consulted only for what the
> runtime genuinely does not own. This ordering is what makes AUBS able to say "I know who you are,
> and I know it without asking the model." Once it is rock-solid, widening deterministic responders
> is an optimization, not a dependency.

When the user's question maps to a stored, permitted memory fact, answer it **deterministically
from memory** (model 0×, self-verifiable, provenance-tagged) instead of sending it to the model.
"What do you know about me?" / "where do I live?" → recalled from owned memory, not improvised.

**Shipped ✅** (`core/facts/registry.js` → `recall(q, entries)`, wired into the governed-fact gate on
BOTH live paths — inline `window.send` and the constitutional pipeline). It: (1) broadens recall
detection beyond the spine's set ("do you remember my…", "what's my…", "remind me…"); (2)
**disambiguates** the match so "favorite color" can never return "favorite food"; (3) lists
everything for "what do you know about me"; (4) is **honest** on a real miss ("I don't know that
about you yet") instead of letting the model invent a personal fact; and (5) **falls through** on an
*ambiguous* miss so the model still handles it (never a dead-end). On the pipeline path each recall
is a `governed_fact` Trust Record (model 0×). Flag-gated by `FLAG_GOVERNED_FACTS` (OFF →
byte-identical). Tests: `run-memory-recall` (15/15) + end-to-end in `run-constitution-chat`.

### 7.1 Supersession + forget (adversarial hardening)
Memory-first is only trustworthy if stored knowledge stays *current* and *removable*. Two failure
modes were closed (Architect Mode Priority 1 — "spend a merge trying to destroy it"):
- **Supersession** — "I live in Denver" then "I moved to Seattle" must answer **Seattle**, not the
  stale Denver. `SPINE.reconcileMemories` classifies each fact's *slot* (`factSlot`); a new value in
  a **single-value** slot (name/location/job/building/`favorite:<thing>`) **replaces** the old one,
  while **multi-value** slots (`likes`/`has`, e.g. "I have two dogs" + "a sister") accumulate. Recall
  is additionally **newest-wins** and listings **collapse to the newest per slot** — defense in depth.
- **Forget** — "forget my favorite color" / "forget everything" removes the targeted fact(s)
  (`isForgetCommand` → slot/keyword match) and answers deterministically (model 0×); afterward the
  attribute honestly returns "I don't know," never the deleted value.
`extractFacts` also learned the *move* ("moved to / now live in X") and *possession* ("I have N …")
shapes. All flag-gated with `FLAG_GOVERNED_FACTS`; OFF keeps the original append+dedup capture.
Proof: `run-memory-adversarial` (17/17) runs the exact human scripts — cross-slot isolation,
supersession, multi-value, forget (single + all), no over-capture, honest on the unknown.

---

## 6b. The Knowledge Layer — make the runtime massive, *honestly*

The goal: the architecture should *carry* knowledge, not rent all of it from the model. Word lists,
dictionaries, encyclopedias, gazetteers — owned corpora that let the runtime answer directly, with
the model called rarely or never. "The model helps; the architecture carries."

The danger, and the rule that makes it safe: **owning a corpus does not make it *true* — it makes it
*cited*.** So every owned corpus is a **Knowledge Pack** that declares its **proof class**, and a
pack may never answer above its class (the same no-silent-upgrade law the Architecture Independence
Test protects).

### Two trust classes (never blur them)
- **Class 1 — closed-world, self-verifiable.** Membership/lookup questions the runtime can answer
  with certainty, model 0×. *"Is `xylophone` a word?"* → the lexicon answers definitively. Same
  trust tier as identity/date/memory. Proof strength: **self-verifiable (✓)**.
- **Class 2 — open-world, grounded/cited.** Reference knowledge (encyclopedia, world facts). Even
  stored locally, the runtime owns a **source**, not the truth — the corpus can be wrong, dated, or
  biased, and synthesis may still need the model. Proof strength: **grounded / runtime-attested (~)**,
  always rendered as *"according to &lt;source&gt;,"* **never self-verifiable**.

### Pack contract
A Knowledge Pack is owned runtime state with: `{ id, name, version, proof_class, count/size, source,
license, load() }`. It exposes deterministic query functions and returns a proof object
`{ class, source, model_called:false }` with every answer. Packs sit at stack layer 6b — after
deterministic responders, before memory and the model — and each renders its own Glass Box line
(*"Answered from the AUBS lexicon — 370,105 words — model 0×"*). All flag-gated (`FLAG_KNOWLEDGE`);
OFF → byte-identical.

### Scaling reality (planned honestly)
Small packs (a ~4 MB word list) ship as an app asset on the AUBS origin, lazy-loaded and
service-worker-cached → offline after first use, **no third-party egress** (it's an app asset, not a
network call out). **Encyclopedias are gigabytes** and cannot all precache into a phone PWA: large
packs will be indexed / downloaded-on-demand / server-hosted. A pack must `log()` any coverage limit
(a partial or sampled corpus) — silent truncation reads as "I know everything" when it doesn't.

### Pack #1 — Lexicon (Class 1) ✅
`core/knowledge/lexicon.js` + `core/knowledge/registry.js`, data `assets/lexicon/words_alpha.txt`
(dwyl/english-words, Unlicense, 370,105 words, normalized to LF). Answers *"is X a word?"* (with a
deterministic did-you-mean from the set), *"how many words do you know?"* — self-verifiable, model 0×.
This pack establishes the **rail** (loader · proof-class tagging · responder · Glass Box · flag · CI)
so every later corpus is "just another pack" on a trustworthy track. Tests: `run-knowledge-lexicon`.

### Pack #2 — Definitions (Class 2, grounded/CITED) ✅
`core/knowledge/definitions.js`, data `assets/definitions/webster.tsv` (Webster's Unabridged
Dictionary 1913, **public domain**, 85,680 entries, compacted to primary glosses). Answers
*"what does X mean?" / "define X"* — but at the **honest** strength: every answer is **cited**
(*"According to Webster's Dictionary (1913), X means: …"*) and carries proof class **grounded**,
never self-verifiable. An unknown word returns an honest cited absence, **not** an invented
definition. This is the first **Class-2** pack — it proves the cited-source rail the same way the
lexicon proved the self-verifiable one. Conversational deixis ("what does **it** mean") is resolved
by the **runtime** from the last word asked about, not by the model. Tests: `run-knowledge-definitions`.

### Pack #3 — Conversion service (Class 1, self-verifiable) ✅
`core/knowledge/conversions.js` — not a corpus but a **computation** the runtime owns: length, mass,
volume, temperature (affine), time, speed, and digital-storage conversions. "5 miles in km" →
**8.04672 km**, exact, model 0×, no data asset, no citation, no hallucination. Incompatible
dimensions or non-units fall through (null). This is the cleanest expression of the design filter —
*can the runtime own this reliably enough that the model no longer needs to?* For unit conversion,
emphatically yes. Tests: `run-knowledge-conversions`.

### Pack #4 — Time service (Class 1, self-verifiable) ✅
`core/knowledge/time.js` — the device clock + platform timezone database are authoritative for the
current instant, so the runtime answers with certainty, model 0×. Basic local date/time stays in the
reality-context governed facts; this service adds **time in another city/timezone** ("what time is it
in Tokyo" → composed deterministically, DST applied by the platform), **relative dates**
("tomorrow"/"yesterday"), and the **local timezone** ("what timezone am I in"). `now` is injectable
for deterministic tests. The reality facts now **defer** the "…in &lt;place&gt;" and
"…tomorrow/yesterday" forms to this service (no collision). Unknown places fall through (null).
Tests: `run-knowledge-time`.

> **Framing (Architect Mode).** These are not "packs of facts" — they are **runtime services** in a
> **knowledge hierarchy**: Class 1 exact/self-verifiable (words · conversions · math · dates) →
> Class 2 grounded/cited (definitions · encyclopedia summaries) → Class 3 retrieved (private
> server) → Class 4 governed external (web · models). The model isn't getting bigger; the operating
> system is.

### Pack #5 — Calculation service (Class 1, self-verifiable) ✅
`core/knowledge/calc.js` — arithmetic is exact, so the runtime computes it, model 0×, never sending
"108273628+3747629" to a language model that will guess (the on-device repro: a big sum hit the 0.5B
and came back as a garbled identity line). A **safe** evaluator (tokenizer → shunting-yard → RPN;
**no eval/Function**) handles + - * / % ^, parentheses, unary minus, and "&lt;x&gt;% of &lt;y&gt;",
pulling the arithmetic out of a noisy question ("whats 5+5=y" → 5+5). Non-math falls through (null).
Tests: `run-knowledge-calc`.

---

## 8. Output Guards — the runtime validates what the model says

Post-generation, deterministic, no model in the loop. Generalize `identityGuard` into a guard
suite: **identity** (no wrong name / invented acronym) ✅ · **persona** (stays in character,
honors boundaries) ☐ · **governed-fact injection** (the model may never override a runtime fact —
if it states a governed fact, it must match the registry, else rewrite) ☐ · **grounding**
(factual claims flagged unverified if not restorable) ✅ · **safety** (final harm pass) ◑.

---

## 9. Why this scales it into something massive

Every layer moved into the runtime makes AUBS:
- **More correct** — runtime facts can't be hallucinated (date, identity, memory).
- **Cheaper & faster** — model-0× turns cost nothing and return instantly.
- **More private** — model-0× means nothing even *could* leave; sealed-door is the default.
- **More consistent** — same persona/identity/facts every time, every model.
- **Model-agnostic** — swap the LLM for eloquence; correctness never moves.
- **Monetizable** — persona packs, capability packs, domain knowledge packs: all runtime state.
- **Provable** — every governed answer is a self-verifiable Trust Record claim.

The product is the runtime. The model is a rented voice.

### Pluggable model engines (local & remote)
The model is not just a swappable *weight set* — it's a swappable *engine*. `core/providers/endpoint.js`
lets the runtime talk to any OpenAI-compatible model server: the **built-in WebLLM** (in-browser, capped
by the Adreno WebGPU binding limit), a model **you downloaded and run on your phone** (Ollama /
llama.cpp-server / LM Studio at `localhost` — on-device, nothing leaves the phone), or **your AUBS
server** later (network egress, surfaced honestly). `?engine=<baseURL>` connects; `classify(base)`
distinguishes on-device (localhost) from network so the Glass Box stays truthful; the governed runtime
(facts, services, Trust OS, persona) is identical regardless of which engine answers. The one in-browser
caveat is reachability: a PWA calling `localhost` must clear the browser's CORS + Private-Network-Access
checks — verified per device, not assumed. Tests: `run-endpoint`.

---

## 10. Build order (grounded)

1. **Reality Context governed facts** (date/time/locale) ☐ — easy, kills the date hallucination, on-thesis.
2. **Persona System v1** ☐ — structured persona state + compiled injection + persona guard. The "personality stuff."
3. **Speaker-label consistency** ☐ — assistant name shown consistently (the AUBS↔Trump flip).
4. **Memory-first answering** ✅ — owned memory wired into the pre-model path (registry `recall`):
   stored personal facts answered model 0×, disambiguated, honest on a miss, with a Trust Record.
5. **Deterministic responders expansion** ◑ — more intents handled model-0×.
6. **Context assembler port** (Splendor tiers) ◑ — scaffold the model turns.
7. **Output guard suite** (persona + fact-injection) ☐.
8. **Domain knowledge cards** ☐ — runtime-owned AUBS/product answers.
9. **Persona library + packs** ☐ — product surface.

Everything flag-gated, byte-identical off, each landing as a governed-fact/registry/guard
addition with tests + a Trust Record claim. Track **% model-0×** as it climbs.

---

## 11. The honest boundary — what stays the model's job

Open-ended generation: stories, essays, brainstorming, rephrasing, summarizing free text,
conversational nuance, creative language. The runtime *frames* these (persona, reality, memory,
constraints) and *validates* the output, but the words are the model's. That's the one row in the
registry the model owns — and it's where a bigger model earns its keep. Everything else, the
runtime carries.

*Trust shouldn't require faith. Truth · Safety · We Got Your Back.*
