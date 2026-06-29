<!--
AUBS — Architecture Completion Matrix (living checklist)
Truth · Safety · We Got Your Back
-->

# AUBS — Architecture Completion Matrix
### A living checklist, not a design doc. Updated as wiring proceeds.
**Date:** June 29, 2026

> A subsystem is **DONE only when all four are green.** This is the development process's own
> trust proof: the code exists, the runtime uses it, the tests verify it, and a human watched
> it work on the real device. A2 taught us the last one is not implied by the third.

## The four statuses

| Status | Meaning |
|---|---|
| **Implemented** | The code exists. |
| **Integrated** | The **live runtime path actually calls it** (even if flag-gated off). Off-to-the-side modules are NOT integrated. |
| **Verified** | Tests prove it behaves correctly. |
| **Observed** | A human saw it work on a **real device**. First-class — never inferred from green tests. |

A fifth fact that matters for "what's executing": **Default** — is the flag ON by default? Almost
everything here is intentionally OFF (byte-identical), so *integrated* ≠ *running for users yet*.

---

## The honest headline

- **Implemented:** ~all designed subsystems have code.
- **Executing in the live runtime *by default*: ~0%** — every flag is OFF.
- **Integrated at all (callable in the live path when flag ON):** only the governed-fact
  ownership layer (A1/A2). The entire Trust OS (Layers 1–9) is **not wired** — it runs only in
  its own harness.
- **Observed on a real device: 0%.** The A2 device test is still pending; nothing has been
  watched working on hardware yet.

That's a good place to be — "code exists, needs integration" beats "UI exists, nothing built" —
but it must be stated plainly.

---

## Matrix — Runtime-ownership layer (merged to `main`)

| Component | Implemented | Integrated | Verified | Observed | Default | Notes |
|---|:--:|:--:|:--:|:--:|:--:|---|
| Governed-fact registry + classifier + gate | ✅ | ✅ | ✅ | ❌ | OFF | wired into pipeline 4a + `aubs-app.html` send; `FLAG_GOVERNED_FACTS`. **Was wrongly marked device-tested — it is not.** |
| Provenance metadata (owner/source/model_called/reason) | ✅ | ✅ | ✅ | ❌ | OFF | in the pipeline record |
| Identity governance (resolve/route/guard) | ✅ | ✅ | ✅ | ❌ | OFF | `FLAG_IDENTITY_V2` |
| Integrity ledger (hash-chain + Ed25519) | ✅ | ✅ | ✅ | ⏳ | ON-ish | the one piece already live in normal operation |
| Device-bundle signing (`bundle.js`) | ✅ | ❌ | ✅ | ❌ | n/a | module only; Gate-0 wiring not done |

## Matrix — Trust OS (Layers 1–9, off to the side in `core/trust/*`)

| Component | Implemented | Integrated | Verified | Observed | Notes |
|---|:--:|:--:|:--:|:--:|---|
| Trusted Egress Gateway + egress ledger | ✅ | ❌ | ✅ | ❌ | live transport/`sw.js` not yet behind it (lint tracks the debt) |
| Egress lint (build gate) | ✅ | ✅* | ✅ | n/a | *runs as a test today; the gate itself is active |
| Proof-strength taxonomy (HARD LAW) | ✅ | ❌ | ✅ | ❌ | the spine of the model |
| Trust Record schema | ✅ | ❌ | ✅ | ❌ | **Was marked ⚠️ integrated — it is not wired; ❌.** |
| Integrity Proof (wrapper) | ✅ | ⚠️ | ✅ | ❌ | underlying ledger is live; the *proof presentation* is not wired |
| Provenance Proof (content-hash) | ✅ | ❌ | ✅ | ❌ | |
| Grounding Proof (T0/T1/T2) | ✅ | ❌ | ✅ | ❌ | |
| Privacy Proof (sealed-door first) | ✅ | ❌ | ✅ | ❌ | reads the gateway, which isn't wired yet |
| Memory Proof + typed reconciliation | ✅ | ⚠️ | ✅ | ❌ | memory **store** is typed + live; the *proof* + reconciliation are not wired |
| Check-order + Reasoning-Permission gate | ✅ | ❌ | ✅ | ❌ | live pipeline has its own order; the reasoning gate is not in it yet |
| Decision Proof (split) + Decision Trace | ✅ | ⚠️ | ✅ | ❌ | live `path` trace exists; strength-tagged Decision Trace + Decision Proof not wired |
| Portable verifier | ✅ | ❌ | ✅ | ❌ | no export/verify surface wired |
| Glass Box (Easy/Detailed) | ✅ | ❌ | ✅ | ❌ | renders from a record; not on the live UI |

Legend: ✅ done · ⚠️ partial (mechanism live, Trust-OS form not wired) · ❌ not yet · ⏳ in progress · n/a not applicable.

---

## What "Observed" requires (so it's never hand-waved)

A human, on a real device, watched the subsystem behave correctly — e.g. for Governed Facts:
the nine-prompt conversation answered from the runtime (no model spin-up on governed turns,
correct name, immutable creator, acronym canonical), with the flags ON. Until that happens,
Observed stays ❌ no matter how green the tests are.

**First "Observed" owed:** the A2 governed-fact device test. It is the oldest open item and
gates marking *anything* in the merged layer truly done.

---

## How this updates

This file is the source of truth for status. Each wiring PR flips one ⚠️/❌ → ✅ and says which
of the four it moved. A subsystem is announced "done" only when its row is four-green.

*Trust shouldn't require faith. Neither should a status report.*
