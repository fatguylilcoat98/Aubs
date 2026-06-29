<!-- Step-6 deliverable. Real-device performance from founder use. Headless numbers from
     FOUNDER_ACCEPTANCE.md are the BASELINE (constitutional overhead only, instant fake model);
     this report fills the DEVICE column from actual phone sessions. No invented timings. -->

# AUBS — Performance Report (Founder Validation)

**Status:** ⏳ **AWAITING DEVICE DATA** — populated from real on‑device sessions (`FOUNDER_TEST_LOG.md`).

## Baseline (already measured, headless; constitutional overhead only)
| Metric | Headless baseline | Note |
|---|---|---|
| Constitutional overhead / turn | **0.67 ms** | governance is not the bottleneck |
| Ledger append (sign + chain) | **0.32 ms / record** | |
| Verify integrity | **~15 ms / 50 records (O(n))** | grows with chain length |
| DecisionRecord size | **~1.04 KB** | hashes, not raw text |

## Device measurements (fill from real sessions)
| Metric | Device value | How measured | Session refs |
|---|---|---|---|
| Time‑to‑first‑token (typical) | | wall‑clock or `?trace=1` `latency_ms` | |
| Total response time (typical) | | | |
| Longest acceptable‑feeling wait | | | |
| Cold app load (first open) | | | |
| Warm load (return visit, SW cached) | | | |
| Offline launch + chat | | | |
| Ledger verify time at end of validation | | Verify integrity button | |
| IndexedDB growth over the run | | Settings ledger count → est. MB | |

## Observations / bottlenecks (real)
- __ (rank what actually made the app *feel* slow in use; tie each to Session #/Turn #)

## Notes
- Response time is **inference‑bound** (the on‑device model), not constitutional overhead (<1 ms). Perf findings here should target the model/runtime/load path, not the governance layer.
