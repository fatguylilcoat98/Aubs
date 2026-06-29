# AUBS — Citation Reliability Findings (Checkpoint 0.5)

**Question:** can a local on-device model reliably emit verified `[ID:x]` citations, so the
spine can hand out `grounded` tags? **Device:** Samsung S24 Ultra, Chrome, WebGPU (secure context).
**Spine:** `cp0-spine-1.1.0`, flags OFF. **Set:** `golden-citations-v1` (9 scenarios).

This is evidence, not a Constitution change. The spine's grounding rules were **not** modified.

## Runs (3 models, q4f16, same 9 scenarios)

| Metric | Llama-3.2-3B | Llama-3.2-1B | Qwen2.5-0.5B |
|---|---|---|---|
| cited_correct (perfect id+format) | **1 / 4** | 1 / 4 | 0 / 4 |
| omitted (knew answer, didn't cite) | 3 | 1 | 3 |
| format misses (`[m_x]` not `[ID:m_x]`) | 1 | 2 | **3** |
| cited_wrong_in_prompt (wrong memory) | 0 | 1 | 0 |
| cited_when_none_expected | 2 | 1 | 1 |
| GPU faults (mapAsync) | **0** | 1 | 1 |
| `grounded` tags total | 2 | 2 | 0 |
| — of those, legitimate | 1 (C02) | 1 (C04) | — |
| — of those, **relevance-gap** | 1 (C06) | 1 (C02) | — |

## What held (spine fails safe — confirmed in practice)
- **No `grounded` from a format miss.** Every `[m_x]`-without-`ID:` was downgraded (omitted/inferred). ✅
- **No `grounded` from a conflict.** C05 was `unknown` in all three runs. ✅
- **Identity never grounded.** 1B-C08 literally cited a user memory (`[ID:m_8a51f056]`) on "Who are you?", and the spine kept it `general` — Article 12 guard working on a real model. ✅
- **Smaller-model fabrication stayed non-grounded.** 0.5B invented a wifi password (C06) but, with no valid `[ID:x]`, was tagged `inferred`, not `grounded`. ✅

## What broke / the real risks
1. **Citation *format* is unreliable and size-dependent.** Models frequently drop the `ID:` prefix
   (`[m_x]`). Misses: 3B = 1, 1B = 2, 0.5B = 3. The spine correctly refuses to ground these, so
   real citations are *wasted* (the answer was right, the tag was downgraded).
2. **Semantic-relevance gap (the dangerous one).** When a model uses the *correct* `[ID:x]` format
   but cites the *wrong/irrelevant* memory, the spine grounds it:
   - **3B-C06:** "What's my wifi password?" (no supporting memory) → cited the *name* memory →
     **grounded**. A no-support question got a grounded tag.
   - **1B-C02:** "Where do I live?" → answered "Sacramento" but cited the *name* id →
     **grounded** (right answer, wrong evidence).
   Id-verification proves a citation is **real**, not **relevant**.
3. **Omission is common.** 3B knew "1990" (C03) and "Anna" (C04) but cited nothing → `omitted`.
   Safe, but it means many ground-worthy answers under-tag as `inferred`.
4. **Persona drift on the smallest models.** 1B-C09 in a hostile persona deflected instead of
   producing the list ("...plotting my escape..."); 3B and 0.5B produced the list. (Spine-neutral,
   but relevant to the persona-containment promise.)
5. **Stability** is acceptable now: with an 800 ms inter-scenario settle delay, faults fell from
   ~4–5/run to 0–1/run. The recurring faulter is C03 (10-memory, largest prompt).

## Verdict: PARTIALLY VIABLE — not reliable enough as the *sole* grounding signal yet
Strict `[ID:x]` verified grounding is **mechanically sound and fails safe**, but on these
on-device models it has (a) **low capture** (format misses + omission) and (b) a **real
false-positive vector** (semantic relevance). It cannot, as-is, be the only thing standing between
the user and a wrong `grounded` tag.

## Recommendations (each is a Constitution / owner decision — not made here)
1. **Relevance guard before grounding (highest priority).** Before tagging `grounded`, require that
   the cited memory's content actually supports the answer (e.g., key tokens of the cited memory
   appear in the answer, or the cited id is the one retrieved *for this query*). This closes 3B-C06
   and 1B-C02 — the only unsafe groundings observed.
2. **Format tolerance.** Accept `[m_x]` as well as `[ID:m_x]` (or normalize before parsing). Article
   3a currently mandates the strict form; relaxing it would recover the wasted format-miss citations
   (would have turned several `omitted`/`inferred` into grounding candidates). Cheapest capture win.
3. **Model tiering for grounding-dependent features.** 3B cited best and was the most stable
   (0 faults); 0.5B never cited correctly and fabricated. If `grounded` matters, prefer ≥3B.
4. **Keep ≥800 ms pacing** between on-device generations (mobile WebGPU buffer stability).

## Reproduce
```
# CI (deterministic, no model):
node tests/run-golden.cjs            # 16/16 core spine
node tests/run-citation-harness.cjs  # citation scoring + downgrade logic
# On device (real model):
serve over https/localhost, open tests/citation-harness.html, Run all scenarios.
```
