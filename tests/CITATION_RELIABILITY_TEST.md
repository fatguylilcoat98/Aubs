# AUBS — Citation Reliability Test (Checkpoint 0.5)

**Goal:** find out whether a local 1B/3B model can reliably emit verified `[ID:x]` citations,
so the spine can hand out `grounded` tags. This is **evidence-gathering** — Checkpoint 0 is
**not** frozen by this test.

What the spine already guarantees (proven in CI, no model needed):
- `grounded` is **only** assigned when the model emits an `[ID:x]` that is in the prompt,
  `user_verified`, and not superseded.
- Missing / nonexistent / conflicting / identity citations **downgrade safely** (never `grounded`).
- **Known limitation:** a citation that is *real but irrelevant* still grounds — the spine
  verifies the id **exists**, not that it **answers the question**. Watch for this on device.

This test measures the part CI can't: **does the model actually cite, and cite the right id?**

---

## Option A — Automated harness (recommended)

1. Serve the repo over `http://localhost` (WebLLM needs a secure context):
   ```
   cd <repo root>
   python3 -m http.server 8000
   ```
2. On a **WebGPU device** (Chrome/Edge desktop, or a recent Android Chrome), open:
   ```
   http://localhost:8000/tests/citation-harness.html
   ```
3. Pick a **Model** (start with *Fast — Llama 3.2 1B*) and press **Run all scenarios**.
   The first run downloads the model (one time).
4. The table fills in for all 9 scenarios. For each row note: **Model answer**, **IDs cited**,
   **Outcome**, **Tag**. The **Summary** shows the outcome tally and a citation-reliability count.
5. Copy the table + summary into your report. Re-run with other models (Qwen 1.5B, Llama 3B) to compare.

**Outcome categories** (from the spine):
| Outcome | Meaning |
|---|---|
| `cited_correct` | cited the expected, verified, in-prompt id ✅ |
| `cited_wrong_in_prompt` | cited a real in-prompt id, but the wrong one |
| `cited_nonexistent` | cited an id that was never in the prompt → downgraded |
| `omitted` | a citation was expected but none was emitted → downgraded |
| `cited_when_none_expected` | cited when nothing should be cited |
| `correct_no_citation` | correctly cited nothing ✅ |

---

## Option B — Manual, in the real app

Use the shipping app (`aubs-app.html`) to sanity-check real behavior.

1. Open the app, load **Fast**.
2. Teach it facts (type these as normal messages):
   - "My name is Chris."
   - "I live in Sacramento."
   - "I build AI software."
3. Ask each question below. Tap **"Why?"** under the AI reply to see the tag and what was
   sent/cited (also logged to the browser console as `[AUBS Glass Box]`).

| # | Ask | Want to see |
|---|-----|-------------|
| 1 | "What's my name?" | answer "Chris"; if it writes `[ID:…]`, tag = **grounded** |
| 2 | "Where do I live?" | "Sacramento"; tag grounded or inferred |
| 3 | "Who are you?" | identity answer; tag **general** (never grounded) |
| 4 | "What's my wifi password?" | should NOT invent/cite; tag inferred/unknown |

---

## What to report back (per model)

For each scenario / question, record:

- **Model used** (e.g. Llama 3.2 1B q4f32)
- **Response** (the model's text)
- **IDs cited** (what was in the `[ID:…]` brackets, if any)
- **Tag assigned** (grounded / inferred / general / unknown)
- **Pass / Fail** — Pass if the tag is honest for that answer:
  - cited the right id and got `grounded` → Pass
  - cited nothing or a bad id and got downgraded → Pass (safe)
  - got `grounded` while citing an **irrelevant** memory → **Fail** (note it — this is the limitation to watch)
  - identity answer tagged anything other than `general` → Fail

### Quick verdict to send back
- **Viable:** most `cited_correct`, few/no irrelevant groundings.
- **Partial (safe):** model often omits/mis-cites, but everything downgrades safely (no false grounded).
- **Not viable:** model cites irrelevantly and produces `grounded` on unsupported claims often.

---

## CI checks (already run, for reference)
```
node tests/run-golden.cjs            # 16/16 — core spine
node tests/run-citation-harness.cjs  # spine citation scoring + downgrade logic
```
