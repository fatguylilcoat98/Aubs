# AUBS Kernel-Wrapped Local Chat — Milestone 4

**Branch:** `claude/aubs-kernel-wrap-m4` (base: `claude/aubs-kernel-m3`)
**Status:** the first time the constitutional runtime touches the living app — entirely behind a default-OFF flag.

Milestone 4 is the **bridge**. M0 proved the ledger, M1 defined CAC, M2 built GEL, M3 built the
isolated kernel. M4 routes the **real** offline chat turn through the kernel — without replacing,
weakening, or changing the working loop.

```
user message
  → safety gate (unchanged, always first)
  → router (unchanged, FLAG_ROUTER)
  → [FLAG_KERNEL_CHAT] CAC Intent → Plan → GEL decision
        → allow  → the SAME on-device WebLLM completion (via a real adapter)
        → deny / require_reauth → blocked, model never called
  → CAC Result / Failure → signed DecisionRecord → Level 1 explanation
  → normal chat bubble + "Why?"
```

---

## Sacred rule held
With `FLAG_KERNEL_CHAT` **off** (the default), none of the kernel code runs and AUBS behaves
exactly as it does today. The existing model loop is **byte-identical** — the kernel path is an
additive `if (kernelChatOn()) { … } else { <existing loop, unchanged> }` branch. The kernel's
adapter calls **into** the working loop; it never replaces it, and no model is loaded twice.

---

## 1. How `FLAG_KERNEL_CHAT` is enabled
Per-session, consistent with the existing flag system:
- URL: `?kernel=1` (turn on, persists in `localStorage.aubs_kernel`), `?kernel=0` (turn off + clear).
- or set `localStorage.aubs_kernel = "1"`.
- `kernelChatOn()` also requires the kernel globals to be present, so a missing script can never
  half-enable it.

## 2. The real local adapter (`core/kernel/chat-bridge.js`)
`makeRealLocalAdapter(generate, model_id)` builds an M3-interface adapter whose `run(plan, ctx)`
calls an **injected** `generate()`:
- In the app, `generate()` is the existing WebLLM completion **with the existing recovery**
  (`engine.chat.completions.create({messages: sent, …})`, `recoverEngine()` on a WebGPU fault).
  It uses the **same** `sent` messages the non-kernel path builds — so the model output is identical.
- In tests, `generate()` is a deterministic fake (ok / empty / throw).
- It returns `{ ok, output_text, model_id, provider_id:"local" }` or `{ ok:false, failure_type:"model_error" }`;
  a thrown engine error is caught and becomes a CAC Failure.

`runKernelChat({ text, generate, model_id, bundle?, ledgerStore, signingKey })` drives
`executeIntent` and returns the full outcome plus a UI view (`res.ui`: `text`, `ok`, `blocked`,
`explanation`, `execution_type`, `record_seq`).

## 3. How GEL blocks execution
The kernel evaluates the plan through GEL **before** any adapter call. On the device's default
bundle, a local turn (`egress:none`, `personal`) matches only `default-allow-local` → **allow**, so
normal chat runs. If a policy returns `deny` / `require_reauth` / `modify`, the adapter is **never
called** (proven: spy `generate` invoked 0 times), the UI shows an honest blocked message, and a
`policy_denied` Failure + DecisionRecord are produced.

## 4. How DecisionRecords are written
Every terminal path (allow-success, model failure, policy block) appends one signed,
hash-chained `DecisionRecord` into the **same** IndexedDB ledger the "Verify integrity" button
reads. Kernel mode initialises that ledger via the existing `ensureLedger()` (now gated on
`ledgerWanted() = FLAG_LEDGER || FLAG_KERNEL_CHAT`), reusing the persisted Ed25519 device key.
`execution_type` is `model` for executed turns, `blocked` for denials; `provider` is always `local`.

## 5. How "Why?" changes in kernel mode
A kernel turn attaches `attachKernelWhy`, whose label is the **Level 1 explanation derived from
recorded state** (never from model output):
- `Answered locally. Nothing left this device.`
- `Blocked by policy. Nothing left this device.`
- `Execution failed before an answer. Nothing left this device.`
Tapping it toasts the decision + DecisionRecord seq and logs the full record. (Non-kernel turns
keep the existing spine Glass Box "Why?".)

## 6. Failure handling
- Engine fault → CAC Failure (`model_error`), honest on-device error shown, record written, the
  **non-kernel path is not silently used** (errors surface).
- GEL deny → no adapter call, blocked message, record written.
- A bridge-level exception shows a "Kernel path error" with the GPU diagnostic — never a silent fallback.

---

## Files
**New**
- `core/kernel/chat-bridge.js` — real adapter + `runKernelChat` + `uiView` (the testable bridge).
- `core/browser-assets.js` — **generated** inline of the CAC schemas + GEL bundle/schema as browser
  globals (`window.AUBS_CAC_SCHEMAS`, `AUBS_GEL_BUNDLE_SCHEMA`, `AUBS_GEL_DEFAULT_BUNDLE`).
- `tools/gen-browser-assets.cjs` — regenerates the above from the canonical JSON (single source of truth).
- `tests/run-kernel-chat.cjs` — 24/24.
- `docs/AUBS_KERNEL_M4.md`.

**Modified**
- `aubs-app.html` — load the kernel stack as inert classic scripts; parse `FLAG_KERNEL_CHAT`;
  `ledgerWanted()`; the additive kernel branch in `send()`; `runModelTurnThroughKernel` +
  `attachKernelWhy`; build tag → `cp0-kernel-wrap-m4`.
- `core/gel/index.js` — browser export now exposes `defaultBundle` + `bundleHash`.
- `sw.js` — cache `v18 → v19`; precache the kernel stack so kernel mode + offline verify work offline.

## Tests
`run-kernel-chat.cjs` **24/24**, full regression green: golden 16/16, citation 28/28, relevance 9/9,
grounding 8/8, memory 18/18, router 20/20, feel ✓, safety ✓, ledger 13/13, cac 22/22, gel 19/19,
kernel 23/23. Plus a **real-browser proof** (headless Chromium over 127.0.0.1, a secure context like
the phone's HTTPS): the exact `core/*.js` the phone loads wire up, Ed25519 signs, an allowed turn
returns model text + "answered locally", a denied turn never calls the model, and the ledger verifies.

---

## Required manual device test
1. Open the app normally (no query string). Confirm chat works as today (flag OFF = unchanged).
2. Open the app with **`?kernel=1`**.
3. Send a normal message (e.g. "what's the capital of France?"). Confirm the answer appears normally.
4. Tap **"Why?"** under the answer. Confirm it reads **"Answered locally. Nothing left this device."**
5. Open **Settings (☰)**. The provenance-ledger row is now visible.
6. Tap **"Verify integrity"**. Confirm the toast says the ledger is intact and verified **offline**.
7. (Optional) Turn it back off with `?kernel=0`; confirm the app is exactly as in step 1.

## 10. Ready for device testing?
**Yes.** Logic is proven by 24 bridge tests + the full regression + a real-browser run of the phone's
own stack. The flag is default-OFF, the offline loop is untouched, and the only thing that exercises
the kernel is opening the app with `?kernel=1`. To put it on the phone, point GitHub Pages at
`claude/aubs-kernel-wrap-m4`, then load with `?kernel=1`. The road is unchanged; the bridge is built
beside it and holds.
