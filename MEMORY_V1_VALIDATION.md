# AUBS — Memory v1 Real-Device Validation Checklist

**Scope:** `aubs-app.html` (shipping PWA) — Memory v1 (persistent conversation history + auto-captured memories).
**Branch:** `claude/aubs-pwa-audit-j2gsct` · **Commit:** `a3648ab` · **PR:** #1 (keep as draft until this passes).
**Status of code:** Architecture-reviewed and approved. This document covers only the empirical, device-specific checks that cannot run in CI.

This is a test plan, not app code. Do **not** treat any item here as a feature to build.

---

## How to use this document
- Run each item, then mark **☐ Pass / ☐ Fail** and add a note (device, build, anything surprising).
- "Expected" is the pass criterion. If actual ≠ expected, mark **Fail** and capture details.
- Fill in one **Device run** column per device you test (Chrome desktop is the minimum; Android/iOS if available).
- A run is **complete** only when every "No regressions" item also passes.

## Setup / prerequisites
- Serve over **HTTPS or `http://localhost`** (WebLLM + service worker require a secure context).
- Use a **WebGPU-capable browser** (Chrome/Edge desktop, or a recent Android Chrome; iOS support varies).
- Start from a **clean state** for the first pass: DevTools → Application → Storage → *Clear site data* (removes any prior `aubs_history` / `aubs_memories` / `aubs_settings`).
- Have DevTools → Application → Local Storage and Console open to observe `aubs_history`, `aubs_memories`, `aubs_settings`.

## Device matrix
| # | Device / browser | Tester | Date | Build/commit |
|---|------------------|--------|------|--------------|
| D1 | Chrome desktop (WebGPU) — **required** | | | `a3648ab` |
| D2 | Android Chrome (if available) | | | `a3648ab` |
| D3 | iOS Safari/PWA (if available) | | | `a3648ab` |

---

## Already verified in CI (headless Chromium) — no device needed
These passed in automated testing against the real module and are listed for traceability, **not** for re-testing on device:
- [x] Extraction: "My name is Chris and I live in Sacramento" → `User's name is Chris` + `User lives in Sacramento`
- [x] Extraction: "I build AI products" → `User builds AI products`; "I work at Anthropic" → `User works at Anthropic`
- [x] Deduplication: same fact said 3× → stored once
- [x] Memory Recall injected into system prompt, after Identity Core, with bullets + "saved privately on their device" phrasing
- [x] History + memories persist across page reload; thread re-renders in order
- [x] Clear memories / clear history work; personality + appearance untouched
- [x] localStorage contains only the three designated keys; 0 console errors
- [x] No test-only code in the shipping file (`?memtest` hook removed in `a3648ab`)

The items below are the ones that **require a real device / real model** and are still open.

---

## A. Installation & basic flow (PWA lifecycle)
> Why device-only: install + full app close/reopen exercise the OS PWA container and service-worker cache, which headless CI cannot reproduce.

- [ ] **A1 — Install.** Trigger "Install app" / "Add to Home Screen" and install.
  **Expected:** App installs; AUBS icon appears on home screen/app list. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **A2 — Launch standalone.** Open AUBS from the home screen (not the browser tab).
  **Expected:** Opens in standalone window (no browser chrome); landing → model picker. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **A3 — Load a model.** Pick Fast, let it download/initialize.
  **Expected:** Progress bar completes; chat screen opens; greeting bubble shown. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **A4 — Have a 5+ turn conversation.** Exchange at least 5 user/AI turns.
  **Expected:** Each turn appears; no freezes; `aubs_history` grows in Local Storage. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **A5 — Full close & reopen.** Fully close the app (swipe away / quit — **not** minimize), reopen from home screen, re-select the same model.
  **Expected:** The full prior conversation is restored in the thread, in chronological order, both roles present. · ☐ Pass ☐ Fail
  Notes: ________________________________________________

## B. Memory extraction & recall (requires real model inference)
> Why device-only: confirms the **model actually uses** the injected memories — CI verified the prompt contains them, not that the model reads them.

- [ ] **B1 — State facts.** Turn 1: type *"My name is Chris and I live in Sacramento."*
  **Expected:** `aubs_memories` gains `User's name is Chris` and `User lives in Sacramento`. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **B2 — Recall name.** A couple turns later, ask *"What's my name?"*
  **Expected:** AI answers "Chris" (drawn from memory, not the current turn). · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **B3 — Recall location.** Ask *"Where do I live?"*
  **Expected:** AI answers "Sacramento". · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **B4 — Capture a new fact.** Say *"I build AI products."*
  **Expected:** `aubs_memories` gains `User builds AI products`. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **B5 — Recall the new fact.** Ask *"What do I do?"*
  **Expected:** AI mentions building AI products. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **B6 — Memory survives restart.** Fully close, reopen, reload model, ask *"What's my name?"*
  **Expected:** AI still recalls "Chris" — memories persisted across sessions. · ☐ Pass ☐ Fail
  Notes: ________________________________________________

## C. Settings & clearing
- [ ] **C1 — Memory section exists.** Open the menu (☰) → Settings → "Memory" section.
  **Expected:** Section visible between Personality and Appearance. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **C2 — Count is accurate.** Read the count label.
  **Expected:** Shows the real number, e.g. "3 memories stored" (or "No memories yet"). · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **C3 — Clear memories.** Tap "Clear memories", confirm the dialog.
  **Expected:** Count → "No memories yet"; `aubs_memories` empties; toast shown. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **C4 — Recall gone.** Ask *"What do I do?"*
  **Expected:** AI no longer recalls the cleared facts. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **C5 — Clear history.** Tap "Clear history", confirm.
  **Expected:** Thread empties to just the greeting; `aubs_history` key removed. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **C6 — Settings unaffected by clears.** Check assistant name, tone, theme after clearing.
  **Expected:** Personality + appearance settings are unchanged. · ☐ Pass ☐ Fail
  Notes: ________________________________________________

## D. Offline
> Why device-only: confirms the model + memory path work with no network, behind the service worker.

- [ ] **D1 — Go offline.** DevTools → Network → **Offline** (or airplane mode on mobile).
  **Expected:** App still open and usable. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **D2 — Reopen a prior conversation offline.** With the model already downloaded, reload/reopen.
  **Expected:** History restores; app shell loads from cache. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **D3 — Ask a question offline.** Send a message.
  **Expected:** AI responds using memories; **no network errors**; no failed `fetch()` for memory ops. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **D4 — Back online.** Re-enable network.
  **Expected:** No errors; behavior unchanged. · ☐ Pass ☐ Fail
  Notes: ________________________________________________

## E. Edge cases
- [ ] **E1 — Long conversation (50+ turns).** Drive a 50+ turn chat, then close/reopen.
  **Expected:** Loads and scrolls without lag; full history restored; replies stay responsive (context window keeps inference bounded). · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E2 — Repeated fact.** Say *"I live in Sacramento"* three times across the chat.
  **Expected:** Stored exactly once in `aubs_memories`. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E3 — Clear mid-conversation.** Clear memories/history while a chat is active.
  **Expected:** No crash; UI stays responsive. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E4 — Quota warning at ~80%.** Fill storage toward the limit (e.g. set a large custom background photo and/or a very long conversation) until usage ≈ 80%.
  **Expected:** A one-time "Storage is ~80% full…" toast appears; warning doesn't spam (re-arms below 70%). · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E5 — Quota exceeded handling.** Push storage past the limit.
  **Expected:** Graceful "Storage full…" toast; no uncaught exception; app keeps working. · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E6 — iOS PWA (if available).** Install + run A1–A5 and B1–B2 on iOS.
  **Expected:** Basic flow + recall work (note any iOS-specific storage/WebGPU limitations). · ☐ Pass ☐ Fail
  Notes: ________________________________________________
- [ ] **E7 — Android PWA (if available).** Install + run A1–A5 and B1–B2 on Android.
  **Expected:** Basic flow + recall work. · ☐ Pass ☐ Fail
  Notes: ________________________________________________

## F. No regressions (must all pass to close the run)
- [ ] **F1 — Appearance customization** (theme + accent + custom colors) still works. · ☐ Pass ☐ Fail
- [ ] **F2 — Tone selection** still works and affects replies. · ☐ Pass ☐ Fail
- [ ] **F3 — Background upload** still works (and survives reload). · ☐ Pass ☐ Fail
- [ ] **F4 — Model switching (Fast / Smart)** still works. · ☐ Pass ☐ Fail
- [ ] **F5 — Send button + input** stay responsive; the busy-lock prevents double-sends. · ☐ Pass ☐ Fail
- [ ] **F6 — Offline badge** still shows in the chat header. · ☐ Pass ☐ Fail
- [ ] **F7 — Personality save** (assistant name / your name / custom instructions) still works. · ☐ Pass ☐ Fail

---

## Sign-off
| Device run | Pass / Fail / Blocked | Tester | Date | Notes |
|------------|----------------------|--------|------|-------|
| D1 Chrome desktop | | | | |
| D2 Android | | | | |
| D3 iOS | | | | |

**Overall result:** ☐ All required (D1) items pass → Memory v1 cleared for merge consideration · ☐ Failures found (list item IDs): ____________

> Reminder: this checklist does not authorize a merge — merge remains a product/owner decision. It only records whether Memory v1 behaves correctly on real devices.
