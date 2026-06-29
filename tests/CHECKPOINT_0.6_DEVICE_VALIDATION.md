# Checkpoint 0.6 — Device Validation (relevance guard, live app)

The relevance guard is now wired into the **live app** grounding path (`aubs-app.html`), not just
the harness. A response is tagged `grounded` only if a cited memory is valid AND **relevant** to the
question. These steps let Chris confirm it on a real device.

Prereqs: secure context (https or `localhost`; on a phone over LAN-IP HTTP use the Chrome
`unsafely-treat-insecure-origin-as-secure` flag or `adb reverse`). WebGPU model (q4f16 recommended).

## A. Live app (`aubs-app.html`)
1. Open the app, load **Fast** (q4f16).
2. Teach it facts — type these as normal messages:
   - "My name is Chris."
   - "I live in Sacramento."
   - "I build AI software."
3. Ask each prompt below. Tap **"Why?"** under the reply (or read the console `[AUBS Glass Box]`)
   to see the tag and what was sent/cited.

| # | Prompt | Expected tag | What it proves |
|---|--------|-------------|----------------|
| 1 | "What's my name?" | **grounded** if it cites the name memory (`[ID:x]` or `[m_x]`); `inferred` if it cites nothing | relevant citation grounds |
| 2 | "Where do I live?" | **grounded** only if it cites the *location* memory; **`inferred` if it cites the name memory** | relevance guard blocks wrong-memory grounding |
| 3 | "What's my wifi password?" | **never `grounded`** (`inferred`/`unknown`) | no wifi memory exists → any citation is irrelevant (the findings false-grounding case) |
| 4 | "Who are you?" | **`general`** | identity never grounds, even if it cites a user memory (Art. 12) |

**Pass criteria:** the tag is honest for the answer. A `grounded` tag must only appear when the
cited memory actually answers the question. Items 2–4 must **never** show `grounded` for an
irrelevant/identity citation. (Whether item 1 grounds depends on the model emitting a citation; the
guarantee is about *not* grounding the wrong thing.)

## B. Harness (`tests/citation-harness.html`) — quantified
1. Serve over https/localhost, open the harness, pick a model, **Run all scenarios**.
2. The harness now passes the query + accepts `[m_x]` (Checkpoint 0.6). In the **Tag** column:
   - C01 "name", C04 "sister" → may be `grounded` (relevant).
   - C02 "where do I live?" citing the name memory, C06 "wifi password" → **`inferred`** (relevance
     blocks them — previously these false-grounded).
3. **Copy results / Download .md** and send them back.

## What to report
For each prompt: the model's answer, IDs cited, the tag, and pass/fail. Flag any case where an
**irrelevant** citation produced `grounded` (should be impossible now) or where a clearly **relevant**
citation was wrongly downgraded (the guard being too strict — see design doc's strict-case list).

## CI checks (no device)
```
node tests/run-golden.cjs            # 16/16
node tests/run-citation-harness.cjs  # 28/28 (0.5 semantics)
node tests/run-relevance-spike.cjs   # 9/9 + format-tolerance measurement
```
