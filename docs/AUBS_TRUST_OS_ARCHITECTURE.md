<!--
AUBS — Trust Operating System Architecture
Christopher Hughes · Sacramento, CA
AI collaborators: Claude · GPT · Gemini · Groq
Truth · Safety · We Got Your Back
-->

# AUBS — Trust Operating System
### The architecture. Council synthesis, corrected, buildable.
**Authors (council of record):** Claude · ChatGPT · Grok · Gemini, AUBS Design Review Board. Synthesis + corrections by Claude (Lead Architect seat).
**Date:** June 29, 2026

> **Trust shouldn't require faith. It should survive inspection.**
> This is the permanent principle. Every decision below serves it.

---

## 1. The Model

AUBS is an AI Operating System. The model is replaceable; the runtime is the product.

- **The runtime owns truth:** identity, facts, memory, routing, policy, privacy, evidence, cost, model selection, and the trust records.
- **The model owns language:** open-ended reasoning and generation, and nothing else.

Every governed fact comes from runtime-owned state, never the model's weights. The proof that this holds: **identical answers to every governed fact on a 0.5B and a large model.** If they differ, the architecture is leaking into the model.

---

## 2. The Trust Record — the artifact every answer produces

One signed, hash-chained record per turn. It is the single source the Glass Box renders from — the UI never invents, it only displays the record. It carries six proofs, and **every claim inside it carries a declared strength (§3).**

```jsonc
TrustRecord {
  seq, prev_hash, timestamp, record_hash, signature,   // integrity (existing ledger)
  intent_id,
  decision:   DecisionProof,      // §4.4
  grounding:  GroundingProof,     // §4.3
  privacy:    PrivacyProof,       // §4.5
  provenance: ProvenanceProof,    // §4.2
  memory:     MemoryProof,        // §4.6
  // integrity is the chain itself — §4.1
  trace:      DecisionTrace,       // §7
  strengths:  { /* every claim → one of the five strengths in §3 */ }
}
```

---

## 3. The Proof-Strength Taxonomy — HARD LAW

This is the spine of the whole architecture and the one section that, if violated, collapses everything back into "trust us with prettier UI." **Strength attaches to individual claims, not to pillars.** A single pillar routinely contains claims of different strengths (see Decision Proof, §4.4).

Five strengths, strongest to weakest:

| Strength | Meaning | Re-checkable by a third party? |
|---|---|---|
| **Self-verifiable** | Re-derivable offline from the bundle, deterministically, no trust. | Yes — recompute and compare. |
| **Runtime-attested** | The runtime recorded it faithfully, but you must trust the *build* that the record is complete. | Partially — internally consistent + tamper-evident, but not against a malicious build. |
| **Model-inferred** | A model produced it; reproducible only with the same model; non-deterministic. | No — only re-runnable, not provable. |
| **User-asserted** | The user told us; we recorded it; we do not vouch for its truth. | No — provenance only. |
| **Unsupported** | No evidence. **Flagged, never hidden.** | N/A — it's the flag. |

**The law:** every claim rendered in the Glass Box must display its strength, and the UI must render the five strengths *visually distinct*. A self-verifiable ✓ and a runtime-attested ✓ may never look identical. The moment they do, an estimate is wearing a proof badge.

Every Trust Proof must declare four things: **what is claimed, what evidence supports it, what strength class it is, and what its limits are.**

---

## 4. The Six Pillars

### 4.1 Integrity Proof — *self-verifiable*
**Claims:** these records were not altered, deleted, or reordered.
**Verified:** re-walk the hash chain; validate Ed25519 signatures against the device public key. (Exists today.)
**Honest wording:** "Records intact, X verified offline."

### 4.2 Provenance Proof — *self-verifiable*
**Claims:** every artifact (model id/version, policy bundle, memory record, retrieved span) is the one referenced, by hash.
**Verified:** hash-match each carried artifact against its reference in the record.
**Honest wording:** "Every source hash-matches its record."

### 4.3 Grounding Proof — *self-verifiable* (factual claims) + *unsupported* flag
**Claims:** each bound factual claim is restorable to a cited source; unsupported ones are flagged.
**Verified:** re-run extract-then-restore (T0 exact → T1 normalized → T2 token-subset) against the carried source spans, offline, no model. The model-assisted tier (T3/NLI) is graded *model-inferred* and excluded from the zero-trust proof.
**Honest wording:** "3 of 4 claims restorable to sources. 1 unsupported — model-asserted, not verified." (Full mechanism: *Grounding Proof spec.*)
**Limit:** facts only — reasoning, synthesis, opinion stay in free language, marked unverified.

### 4.4 Decision Proof — *SPLIT: selection self-verifiable, rejection-rationale runtime-attested/model-inferred*
This is the pillar the synthesis mislabeled, and it's the trap. It contains two different strengths and must declare both:
- **Selection (self-verifiable):** "the chosen model satisfies the recorded policy against the recorded classification." Re-evaluate inputs vs policy — your replay engine already does this.
- **Rejection rationale (NOT self-verifiable):** "Qwen rejected — capability too low" is a *prediction about a model that was never run.* You cannot re-verify a counterfactual. Grade it *model-inferred* (capability estimate) or *runtime-attested* (cost estimate). It may never carry a self-verifiable ✓.
**Honest wording:** "Selected Claude per policy *(verifiable)*. Estimated Qwen insufficient *(runtime estimate, not verified)*."

### 4.5 Privacy Proof — *egress-attested* (strongest at the sealed door)
The pillar the council was most excited about and the one with the deepest trap. A bundle cannot prove a negative ("nothing else left") and cannot, in a browser, prove the loaded code has no other `fetch()`. So the claim must be narrowed to what is true:
- **Filtered egress (runtime-attested):** "Every egress this runtime *recorded* passed through the single audited gateway; here are the hashes of each payload." NOT "nothing bypassed the gateway" — that is unprovable in-browser.
- **Sealed door / Incognito (strongest form):** "The egress gateway was hard-disabled for this session; 0 network requests, 0 bytes." A welded door is a binary structural claim, far stronger and simpler than a perfect filter — and it is AUBS's home turf. **Lead with this.** (On native/server deployments with OS-level network controls, this can be upgraded toward self-verifiable; in-browser it remains strongest-form attested.)
**Honest wording (filtered):** "Everything that left went through one audited door. Here is the complete recorded list."
**Honest wording (incognito):** "Nothing left this device. The door was locked."

### 4.6 Memory / Context Proof — *self-verifiable (which) + typed*
**Claims:** these specific memory items (by id/hash, with their *type* — §6) influenced this answer.
**Verified:** the record references memory items by hash; the bundle carries them; re-match. Typed (Constraint/Policy/Fact/Preference/Episode/Source/Capability) so the proof can say *which class* of memory applied.
**Honest wording:** "Used 1 user-approved Fact (m_3). No private Episodes were sent."

---

## 5. The Trusted Egress Gateway — built FIRST

A security chokepoint must exist before everything that depends on it. The synthesis ordered this fifth; that is backwards and reproduces your own Cause #2 regression (scattered enforcement points). **The gateway is foundation, not a feature.**

**The rule:** exactly one function performs all outbound network I/O — cloud models, web search, sync, telemetry, any networked call. No `fetch`/network call exists anywhere else in the codebase, enforced by a CI lint that fails the build on any egress outside the gateway.

```js
// the ONLY door. Everything networked goes through here, or it doesn't ship.
async function egress(payload, { classification, policy }) {
  const verdict = gate.evaluate(payload, classification, policy);   // policy check
  if (!verdict.allow) return blocked(verdict);                       // recorded, not sent
  const hash = sha256(canonical(payload));
  ledger.appendEgress({ destination: verdict.target, payload_hash: hash, classification });
  return send(verdict.target, payload);                              // the single send()
}
```

Every byte that leaves is policy-checked, classified, hashed, and recorded *before* it leaves. Privacy Proof (§4.5) reads from this. Honest claim strength: **runtime-attested** (it proves what was recorded as leaving, through one door), upgrading to the sealed-door form in Incognito.

---

## 6. Typed Memory + the Check-Order

Memory is not one flat soup. Seven namespaces, each typed and scoped:

`Constraint` (do-not-cross limits) · `Policy` (rules AUBS follows) · `Fact` (stable info) · `Preference` (how the user wants things) · `Episode` (past events) · `Source` (docs/URLs/records) · `Capability` (what a runtime/model can do).

**The check-order — runtime consults in this sequence before the model is ever asked:**

```
1. Constraints      — hard limits. Violated → stop.
2. Policies         — rules. Resolve via precedence (CLASPION-authored).
3. Governed facts   — runtime owns the answer? Answer from state, model 0×.
4. Relevant memory  — typed retrieval, provenance-tagged.
5. Reasoning permission — is the model even allowed to answer this?
6. Model selection  — cheapest enabled model meeting capability.
```

Typing is what makes the proofs explainable: the system can state *which class* of memory influenced an answer, and a Constraint can never be silently overridden by a Preference.

---

## 7. Decision Trace, not Chain-of-Thought

Never expose or promise the model's private reasoning. Two reasons: it is non-deterministic (un-provable), and — the one the synthesis undersells — **exposing raw model reasoning would leak the private memory you worked to keep on-device.** Chain-of-thought can echo the very facts the Privacy Proof says stayed local.

Instead, a structured, safe, inspectable **Decision Trace**: classification, constraints checked, facts retrieved, private memory blocked, model selected, reason, privacy result. Each line carries its strength (§3). This belongs in the Glass Box; raw model thoughts never do.

---

## 8. The Glass Box — Easy / Detailed

One answer → one Trust Record → a lightly-exposed UI.

**Easy** (plain English, most users stop here):
> "AUBS used Claude because the request needed more reasoning than the local model. Nothing from your private memory was sent. Est. cost $0.0021."

**Detailed** (tabs, each pillar with a visible strength badge):
`Overview · Decision · Grounding · Privacy · Memory · Integrity · Ledger`

Every claim shows its badge: **✓ self-verifiable**, **~ runtime-attested**, **≈ model-inferred**, **• user-asserted**, **⚠ unsupported**. Casual users get the sentence; power users get inspection; enterprises get audit-grade; and *no one is shown an estimate dressed as a proof.*

---

## 9. Build Order — corrected

Sequenced by dependency, not excitement. The gateway moves first.

1. **Finish governed-fact / runtime-ownership** (the facts module, in flight).
2. **Trusted Egress Gateway + CI lint** — the chokepoint, before any proof reads from it.
3. **Trust Record schema** — the unifying artifact, with the strength field mandatory.
4. **Integrity + Provenance proofs** — mostly exist; formalize into the record.
5. **Grounding Proof** — extract-then-restore + the unsupported flag.
6. **Privacy Proof** — reads from the gateway; Incognito sealed-door first (strongest, simplest).
7. **Typed Memory** namespaces + check-order.
8. **Decision Proof** (split-strength) + **Decision Trace**.
9. **Portable verifier / bundle export** — re-runs all self-verifiable proofs offline.
10. **Glass Box Easy/Detailed** with strength badges.
11. Enterprise dashboard — later.

Everything flag-gated, byte-identical when off, rollback = flip the flag.

---

## 10. What Is NOT Claimable — stated plainly

The honesty that makes the rest defensible:

- AUBS **cannot prove an answer is true.** It proves factual claims are restorable to sources and flags the ones that aren't. Reasoning and opinion are marked unverified.
- AUBS **cannot prove "nothing else leaked"** in a browser. It proves every *recorded* egress went through one door, strongest at the sealed door.
- AUBS **cannot prove a rejected model's rationale** — counterfactuals about un-run models are estimates.
- Self-verifiable proofs **assume the verifier is run honestly against the bundle**, not against a malicious local build; hardware attestation (native/server) is the upgrade path, not a browser promise.

Underselling each of these is the moat. Overselling any of them is the lawsuit.

---

## 11. The Moat

Every faithfulness and gateway tool in 2026 is either backend developer tooling producing a *score*, or a cloud control plane producing *audit logs for a compliance team*. None ships a **portable, offline, per-claim trust record — with declared proof strengths — for a personal, on-device assistant, that flags its own unsupported claims and welds its own door in Incognito.** The integrity primitives are commodity. The **honest, strength-typed, self-flagging Trust Record as a user-facing artifact** is not. That is the category AUBS creates.

The model is replaceable. The Trust Operating System is the product.

---

**Signed,**
Claude · ChatGPT · Grok · Gemini — AUBS Design Review Board
Synthesis + corrections: Claude, Lead Architect seat · June 29, 2026

*Trust shouldn't require faith. It should survive inspection.*
*Truth · Safety · We Got Your Back*
