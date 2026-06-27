# AUBS — Relevance Guard Design & Spike (Checkpoint 0.6)

**Problem (from Checkpoint 0.5):** strict `[ID:x]` verified grounding proves a citation is
*real*, not *relevant*. Small models cited a valid memory id that did not answer the question and
got a false `grounded` tag (e.g. "what's my wifi password?" → cited the *name* memory → grounded).

**This spike:** add a deterministic, model-free relevance guard to the spine grounding path, and
spike whether to accept the `[m_x]` shorthand. No layers. Not merged.

## The grounding rule (Checkpoint 0.6)
A response is tagged `grounded` **only if** a cited id passes ALL of:
1. valid citation format (`[ID:x]`, or `[m_x]` when tolerance is on),
2. the id is in `memory_ids_in_prompt`,
3. the memory is `user_verified`,
4. the memory is not superseded,
5. **the memory is RELEVANT to the query** (new).

Conflicts → `unknown`; identity queries → `general` (Article 12); anything cited but not
groundable → downgraded to `inferred`. Relevance is enforced only when a `query` is supplied
(backward-compatible: existing 0.5 callers that pass no query are unchanged).

## The relevance rule (`relevanceCheck(query, memoryContent)`), deterministic
1. **Query-intent slots** — a recognized query type must cite a memory whose content matches that
   type. Slots: `name, location, birth, sister, wifi/password, job, pet, likes`. If the query
   matches a slot but the cited memory does not match that slot's content pattern → **not relevant**.
2. **Keyword-overlap fallback** — if no slot matches, require at least one non-stopword from the
   query to appear in the memory content. No overlap → **not relevant**.
3. **Conservative default** — anything it cannot link is treated as **not relevant** (downgrade).

## Format tolerance decision: ACCEPT `[m_x]` — but only under the relevance guard
Measured strict (`[ID:x]` only) vs tolerant (`[ID:x]` or `[m_x]`) across the relevance set:

| mode | false groundings | true groundings |
|---|---|---|
| strict | 0 | 1 |
| tolerant | **0** | **2** |

Tolerance added **zero** false groundings and recovered a real one (a correctly-relevant `[m_x]`
citation). **Recommendation: accept `[m_x]`** — but it is only safe *because* relevance is checked;
bare format without the relevance guard would re-introduce false grounding. (This is a proposed
amendment to Article 3a's strict-format rule — an owner/council decision.)

## Test results
- `tests/run-relevance-spike.cjs` — **9/9**:
  R1 correct+relevant→grounded · R2 correct ID + irrelevant→not · R3 wrong in-prompt ID→not ·
  R4a `[m_x]`+relevant→grounded · R4b `[m_x]`+irrelevant→not · R5 conflict→unknown ·
  R6 identity→general · R7 unrelated citation→not · R8 wifi false citation (findings)→not.
- Device harness (`citation-harness.html`) now passes `query` + `tolerantFormat`. Replayed the
  findings: a model citing the *name* memory for "where do I live?" (C02) and "wifi password?"
  (C06) now downgrades to `inferred`; name (C01) and sister (C04) queries still ground.
- **No regressions:** Golden 16/16, citation scoring 28/28 (0.5 semantics preserved — those callers
  pass no query, so the guard is inert for them).

## Where the guard is too strict (honest limits)
Conservative-by-design → it favors *no false grounding* over *recall*, so it will refuse to ground
some legitimately-relevant citations:
- **Out-of-slot phrasings with no literal overlap:** "Where am I?" (no live/located verb) or
  "What's my birthplace?" (synonym of "born") won't match a slot, and pronoun-heavy queries reduce
  to stopwords → `no-content-words`/`no-overlap` → downgraded even when the memory is right.
- **Synonyms / morphology:** keyword overlap is literal (no stemming), so "cities" vs "city",
  "residence" vs "live" miss.
- **Mitigation (future, not in this spike):** expand the slot list, add light stemming/synonyms,
  or a field-type tag on memories. All deterministic; all spine-version bumps.

The trade is deliberate for a first pass: a missed grounding degrades to `inferred` (still honest);
a false grounding breaks the trust promise.

## Not changed
- The live app (`aubs-app.html`) still grounds without the relevance guard. Wiring it in is one line
  (pass `query` to `tagAnswer` in `logProvenanceFor`) and is the recommended Checkpoint 0.6
  graduation step — held back here so the spike stays contained.
- Article 3a (strict format) is unchanged in the Constitution; tolerance is proposed, not adopted.

## Reproduce
```
node tests/run-relevance-spike.cjs   # 9/9 + format-tolerance measurement
node tests/run-golden.cjs            # 16/16 (no regression)
node tests/run-citation-harness.cjs  # 28/28 (0.5 semantics intact)
```
