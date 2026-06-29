# Constitutional Amendment — Verified Grounding v2 (Article 3a)

**Branch:** `claude/aubs-grounding-v2` (base: `claude/aubs-planner-m12`)
**Status:** implemented behind `FLAG_SPINE_GROUNDING_V2` (default **OFF**). Flag-off behavior is
byte-identical to ratified Article 3a. Candidate for council ratification — **not yet law**.
**Targets:** `spine/spine.js` (`relevanceCheck`, `tagAnswer`, new `groundingStrength` /
`extractQueryObject`, `makeProvenance`), `tests/run-citation-harness.cjs`, new
`tests/run-grounding-v2.cjs`.

This was reviewed **truth-first, not document-first**. The spec is largely correct and was
implemented as proposed, with two deliberate deviations and one factual correction, all below.

---

## 1. Parts implemented exactly as the spec proposed

- **Layer 2 — object disambiguation** (`extractQueryObject` + the `disambiguate` path in
  `relevanceCheck`): a coarse slot match (`likes`) additionally requires the memory to contain the
  query's object noun. `favorite color` no longer grounds against `favorite food is pizza`
  (`object-miss:likes:color`). Deterministic, model-free — verbatim to the spec's snippet.
- **Layer 3 — `groundingStrength`** (`value_verified` / `topic_relevant` / null), including the
  negation-guarded substring check — verbatim to the spec.
- **Conservative policy (recommended):** only `value_verified` displays as `grounded`;
  `topic_relevant` downgrades to `inferred`. The tier is recorded either way.
- **DecisionRecord shape (§4):** `tagAnswer` (v2) returns `grounding_strength`, `grounded_on`, and
  `relevance_basis`; `makeProvenance` carries `grounding_strength`. Glass Box can now distinguish a
  weak topic match from a value-verified one.
- **Rollout (§6):** landed behind `FLAG_SPINE_GROUNDING_V2`, default OFF, flag-off byte-identical —
  exactly as `verifyGrounding` is gated today.
- **Test obligations (§5):** same-slot cross-citation, topic-relevant-but-value-absent, the negation
  trap, and the no-query case are all covered in `run-grounding-v2.cjs` (16/16), and the existing
  8/8 `run-grounding-verify` + 16/16 `run-golden` + router/safety are unchanged.

## 2. Parts that changed, and why

- **Layer 1 — fail-closed default, scoped to the flag (not global).** The spec's snippet changes
  `requireRelevance` to default `true` in the *shared* `tagAnswer` path. Doing that would alter the
  **ratified** flag-off behavior and break the "flag-off byte-identical" invariant. **Better
  deterministic implementation:** I split `tagAnswer` into a v2 branch (default `requireRelevance:
  true` → no query never grounds) and the untouched ratified `else` branch (`requireRelevance ===
  true`, opt-in). Same constitutional guarantee (fail-closed under v2), zero change to ratified law.
- **`relevanceCheck` gained an opt-in third arg instead of new behavior.** Object disambiguation is
  `opts.disambiguate === true`, off by default. Every existing caller (the ratified `tagAnswer`,
  `verifyGrounding`, `run-grounding-verify`) is byte-identical; only the v2 path passes
  `disambiguate: true`. This is why the 8/8 grounding-verify suite did not move.

## 3. Constitutional concerns discovered (truth-first)

1. **The spec's "Hole A affects the live path" is incorrect.** The live chat path already passes the
   user query into `tagAnswer` (`aubs-app.html`), so ratified condition 5 already enforces relevance
   live. Hole A was a **harness gap + a fail-*open* default**, not a live hole. Proof: passing the
   query in the harness (one line, **no v2**) made the "id verified, semantic fit NOT checked" notes
   for C02/C03/C04/C06 **disappear** — the ratified relevance check downgrades those wrong/none
   citations to `inferred` on its own, because in the golden set the wrong memories are a *different
   topic*. So **Layer 1 alone does not require v2** for the golden cases; its real value is the
   fail-closed default + a harness that actually exercises relevance.
2. **v2's irreplaceable contribution is Layers 2–3, which the golden set never exercised.** The
   residual holes are *same-slot* cross-grounding and *overlap-only* grounding. The new adversarial
   suite constructs these explicitly and shows flag-OFF reproduces the hole while flag-ON closes it.
3. **Conservative policy is stricter than ratified 3a — a real recall trade.** A correct answer that
   *paraphrases* a value (no literal substring) downgrades `grounded → inferred` under v2.
   `value_verified` is literal-substring only — **deliberately no embeddings/similarity**, which
   would violate determinism, replayability, and "no learned components deciding grounding." Honest
   explainability is preserved (`topic_relevant` is recorded), but enabling v2 will reduce the count
   of `grounded` answers from real paraphrasing models. The council should weigh precision↑ vs recall↓.
4. **`extractQueryObject` disambiguates only the `likes` slot today** (the one coarse slot with the
   hole; the others are specific). Any future coarse slot must register an extractor or the same-slot
   hole reopens for it — a standing maintenance obligation.
5. **The live app is intentionally NOT wired to the flag.** On-device behavior is byte-identical and
   v2 is not yet exercisable on the phone. The ratification step adds a `?gv2=1` wiring and records
   `grounding_strength` in `logProvenanceFor` / the ledger DecisionRecord.

## 4. Should this be ratified into Article 3a?

**Ratify the mechanism; gate default-ON on device evidence.**
- Layers 1–2 (query-gated + object disambiguation) are pure precision gains with no recall cost —
  ratify readily.
- Layer 3 conservative (value-verified-only `grounded`) is correct and honest, but trades recall for
  precision against real paraphrasing models. Recommend: update the article text to *"id verified
  **AND** value-verified relevance,"* keep the flag, and default it **ON** only after a device pass
  confirms the precision gain outweighs the recall loss. This implementation makes that pass
  possible: because every grounding decision is deterministic and the tier is recorded, **M7 replay
  can re-judge any historical grounding under v1 vs v2** — proven by the `run-grounding-v2` replay
  assertion. That is the Amendment Lifecycle doing exactly what it was specced to do.

Invariants preserved: **deterministic · replayable · fail-closed · no learned components · honest
explainability · no regressions.**

---

## Files
**Modified** — `spine/spine.js` (flag + `extractQueryObject` + `disambiguate` path + v2 `tagAnswer`
branch + `groundingStrength` + `grounding_strength` in `makeProvenance` + exports),
`tests/run-citation-harness.cjs` (now passes the query — the spec's ask, and the source of finding
#1). **New** — `tests/run-grounding-v2.cjs` (16/16), `docs/AUBS_VERIFIED_GROUNDING_V2.md`.
**Untouched** — `aubs-app.html`, `sw.js` (live app byte-identical; flag default OFF).

## Tests
`run-grounding-v2.cjs` **16/16** + full regression green (**22 suites**): golden 16/16, citation
28/28, grounding-verify 8/8, relevance-spike 9/9, router/safety/feel ✓, plus the M3–M12 constitutional
suites. Real-browser proof still passes (the app loads the amended spine; flag-off → identical).
