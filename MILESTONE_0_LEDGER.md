<!--
AUBS — Milestone 0: The Provenance Ledger (the spine)
Christopher Hughes · Sacramento, CA · Truth · Safety · We Got Your Back
-->

# Milestone 0 — The Provenance Ledger

**Goal:** turn AUBS from *"it tells me what happened"* into *"it can prove what happened."*
The beginning of the real Glass Box. **Built entirely behind `FLAG_LEDGER` (default OFF) — with
the flag off, AUBS behaves exactly as before.** The working offline loop was not touched.

## What shipped (scope, nothing more)
1. **DecisionRecord v1** (`dr-1`) — `spine/ledger.js`. Fields: `seq`, `id` (uuid), `timestamp`,
   `intent_id`, `input_hash`, `output_hash`, `model_id`, `policy_version`, `provider`,
   `execution_type`, `memory_refs[]`, `retrieved_doc_refs[]`, `explanation{}`, `prev_hash`,
   `record_hash`, `signature`.
2. **Local append-only ledger** — **IndexedDB**, keyed by `seq`, written with `add()` (not
   `put`) so an existing record can never be overwritten through the API. `prev_hash` links each
   record to the one before; the genesis `prev_hash` is 64 zeros. Storage is injected
   (in-memory for tests, IndexedDB in the browser) so the chain logic is unit-tested without a DB.
3. **Cryptographic integrity** — standard **WebCrypto**, no custom crypto: **SHA-256** for
   `record_hash` over the canonical (key-sorted) record body, **Ed25519** for the signature. The
   device signing key is generated once and persisted in IndexedDB with a **non-extractable
   private key** (it can't be exfiltrated); the public key stays exportable for portable verify.
   *(The spine's old FNV-1a `hashString` is untouched — it still backs non-security ids; the
   ledger uses SHA-256/Ed25519 exclusively. Migrating other call-sites is a later milestone.)*
4. **Offline verifier** — `window.aubsLedger.verify()` and `verifyExport(bundle)`. Walks every
   record and checks: monotonic `seq` (no gaps/reorder), `prev_hash` linkage, `record_hash`
   recompute, and the Ed25519 signature. Runs **entirely on device** — no server, no network. It
   reports every problem and **never silently recovers**.
5. **Tamper tests** — `tests/run-ledger.cjs` (**13/13**): modification, deletion, reorder,
   corrupted signature, broken chain — each detected and `ok:false`; plus append-only enforcement,
   portable export round-trip, and the unsigned-fallback path.
6. **Feature flag** — `FLAG_LEDGER` (spine), enabled per session with `?ledger=1` (or
   `localStorage aubs_ledger=1`). Off by default.

## How it's wired (additive, zero-regression)
- `logProvenanceFor()` still does exactly what it did. **When `FLAG_LEDGER` is on**, it *also*
  appends a signed DecisionRecord — **fire-and-forget and fully wrapped**, so a ledger failure can
  never touch the chat. The existing in-RAM `_traces` / "Why?" path is unchanged (the ledger
  supersedes it conceptually; flipping the default later completes the replacement).
- Settings shows a flag-gated **"Provenance ledger: N records · Verify integrity"** row (hidden
  unless the flag is on) — the on-device *"check for yourself"* demo.

## Verification
- **Tamper suite:** `node tests/run-ledger.cjs` → 13/13. All five tamper classes fail loudly.
- **Real-app wiring (headless):** flag OFF → ledger inert, 0 records, chat normal, no errors. Flag
  ON → 2 DecisionRecords appended, signed (Ed25519 confirmed available in Chromium), verifies
  offline; a record **rewritten directly in IndexedDB** (attacker bypassing the API) is **caught**
  on re-verify; export bundle re-verifies.
- **No regression (flag OFF):** golden 16/16, citation 28/28, relevance 9/9, grounding-verify 8/8,
  extraction 18/18, router 20/20, feel, safety 26/26 — all pass; live identity/chat unchanged.

## Browser note
Ed25519-in-WebCrypto needs a recent engine (Chrome ≥137; the S24's Chrome qualifies). If it's
absent, the ledger falls back to an **unsigned hash chain** — still tamper-evident for
modification/deletion/reorder via the chain — and the verifier flags records `unsigned`.

## Explicitly NOT done (later milestones)
CAC, GEL, router redesign, provider adapters, memory redesign, policy engine, cloud sync, auth.

## Try it
Open `…/aubs-app.html?ledger=1`, chat a few turns, then **Settings → Verify integrity** (or
`await window.aubsLedger.verify()` in the console). Expect `✓ Ledger intact — N records verified
offline`. With `?ledger=0` / default, nothing changes.

**Success criteria — met:** every execution can generate a DecisionRecord ✓; records stored in an
append-only local ledger ✓; integrity cryptographically verifiable ✓; tampering detected ✓;
verification runs entirely offline ✓; existing AUBS works unchanged ✓.
