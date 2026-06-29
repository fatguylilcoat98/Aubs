<!-- Step-6 deliverable. One row per defect DISCOVERED THROUGH REAL USE. No speculative bugs.
     Every entry must trace to a real Founder Session #/Turn #. Fixes follow the Step-5 protocol. -->

# AUBS — Bug Register (Founder Validation)

**Status:** ⏳ **AWAITING SESSION DATA** — no bugs recorded yet. Bugs are added **only** when found through real device use (`FOUNDER_TEST_LOG.md`), never speculatively.

## Open / fixed bugs
| ID | Session # | Turn # | Severity | Symptom (observed) | Repro | Root cause (verified) | Proposed fix | Risk | Regression test | Status |
|----|-----------|--------|----------|--------------------|-------|-----------------------|--------------|------|-----------------|--------|
| — | — | — | — | _none recorded_ | — | — | — | — | — | — |

**Severity key:** 🔴 blocks use · 🟠 degrades a real task · 🟡 annoyance · ⚪ cosmetic.

## Fix rule (Step 5)
A bug is fixed only after its **root cause is verified in code** (not guessed). The fix is the
**smallest** change that holds the existing posture: behind the current flags, **flag‑OFF stays
byte‑identical**, and it ships with a **regression test** that proves it stays fixed. Each fix PR
cites the Session #/Turn # that surfaced it.
