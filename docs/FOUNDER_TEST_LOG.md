<!-- Founder Device Validation — the LIVE capture instrument. This is filled in BY THE FOUNDER
     from real on-device usage. Nothing here is auto-generated or simulated. The four Step-6
     reports (FOUNDER_DEVICE_REPORT, BUG_REGISTER, UX_IMPROVEMENTS, PERFORMANCE_REPORT) are
     produced FROM this log once real sessions accumulate — never from invented data. -->

# AUBS — Founder Test Log (Real‑World Validation)

> **Honesty note.** This log is filled in by the **founder using the app on a real device**.
> The agent does **not** manufacture sessions, response times, or observations — per the
> validation rules ("Do not manufacture tests. Live with it."). The agent's role is to (a)
> maintain this instrument, (b) turn real entries into the four Step‑6 reports, and (c) fix
> **only** problems discovered through actual use, each referencing a real Session # / Turn #.

## Setup (do once)
1. **Pages → main.** Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.** The committed `CNAME` keeps `aubs.thegoodneighborguard.com`. (The agent can't change Pages settings via API — this is a manual repo‑settings step.)
2. **Confirm the live build** after deploy: open the app, open Settings; footer should read **`Build cp0-constitution-chat-m14 · governed-local · spine …`**. Service worker should be **`aubs-shell-v21`** (a single hard refresh claims the new worker).
3. **Founder testing URL:** `https://aubs.thegoodneighborguard.com/aubs-app.html?spine=1`
   - `?spine=1` turns on constitutional mode **for this session only**. **No code default is flipped** — everyone else still gets the plain offline app.
   - To return to baseline at any time: `?spine=0` (clears the flag), or just omit it.
4. **Ledger check (per session):** with `?spine=1` active, Settings shows a **Provenance ledger** row → tap **Verify integrity**. Expect **"✓ Ledger intact — N records verified offline."** Record the result each session.

## What to capture per session (the columns below)
- **Session #** · **Date** · **Device** (model / OS / browser) · **Duration** · **Turns**
- **Avg response time** — *if measurable*. Under pure `?spine=1` this is wall‑clock/eyeball. If you want exact per‑turn `latency_ms`, add `?spine=1&trace=1` for a session (still default‑OFF, per‑session only) — the Glass Box trace shows timing. Note which method you used.
- **Ledger verification** — the Verify‑integrity result (✓ count, or ✗ + what it said)
- **Failures** — anything that broke, hung, crashed, or returned no answer (note the **Turn #**)
- **UX observations** — friction, confusion, delight, anything that felt off or good
- **Bugs** — concrete, reproducible defects (note the **Turn #** + repro)
- **Improvement ideas** — wishes, polish, "it'd be nice if…"

## Targets (live with it — don't rush or manufacture)
- **≥ 50 conversations**, **≥ 500 turns** total, across real use:
  coding · brainstorming · personal questions · planning · follow‑up conversations ·
  interruptions · long chats · **offline usage** · **app restart** · **leaving and returning later**.
- Spread it over days. Authentic, customer‑like use beats a scripted burst.

---

## Session log

> Add one row per conversation. Keep it light — a phrase per cell is fine. Flag anything
> worth a fix with **[BUG]** or **[UX]** and the Turn #, so it maps cleanly into the registers.

| # | Date | Device | Dur | Turns | Avg resp | Ledger verify | Failures | UX notes | Bugs | Ideas |
|---|------|--------|-----|-------|----------|---------------|----------|----------|------|-------|
| 1 |  |  |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |  |  |
| … |  |  |  |  |  |  |  |  |  |  |

### Running totals (update as you go)
- Conversations: **0 / 50**
- Turns: **0 / 500**
- Sessions with a clean ledger verify: **0**
- Sessions with a failure: **0**
- Offline sessions: **0** · App‑restart sessions: **0** · Leave‑and‑return sessions: **0**

---

## Free‑form session notes (optional, for anything the table can't hold)
Use this for transcripts, screenshots‑in‑words, or a paragraph about how a session felt.
Paste rough notes here and the agent will fold them into the right report.

### Session 1 —
-

### Session 2 —
-

---

## Fix protocol (Step 5 — no speculative fixes)
A problem is only fixed if it was **discovered through actual use**. Every fix PR must reference:
- **Founder Session #** and **Turn #** where it surfaced
- **Root cause** (verified in code, not guessed)
- **Proposed fix** (smallest change behind the existing flag posture; flag‑OFF stays byte‑identical)
- **Risk** (Low / Med / High)
- **Regression tests** (the automated check that proves it stays fixed)

## Step‑6 deliverables (produced from THIS log when validation is complete)
`FOUNDER_DEVICE_REPORT.md` · `BUG_REGISTER.md` · `UX_IMPROVEMENTS.md` · `PERFORMANCE_REPORT.md`
→ then a readiness call: **READY FOR EARLY EXTERNAL TESTERS** or **ADDITIONAL FOUNDER ITERATION REQUIRED**.
