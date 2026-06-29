# AUBS First Governed External Provider (OpenAI Reference) — Milestone 8

**Branch:** `claude/aubs-openai-reference-m8` (base: `claude/aubs-decision-replay-m7`)
**Status:** additive. Default behavior unchanged; the governed-local path is the default; cloud
execution is OFF unless explicitly enabled. The live phone app is untouched.

M8 introduces the **first real external provider** — not because AUBS needs OpenAI, but to **prove**
a real provider can live under the constitutional runtime without weakening it.

> The first cloud provider is not a feature. It is a proof. If one external provider can obey the
> constitution, every future provider can. If the first one requires exceptions, the architecture is
> wrong. No exceptions — the constitution wins.

## Why only one provider, and why OpenAI
This is the **reference implementation**. Every future provider — Anthropic, Gemini, xAI, Meta,
Mistral, DeepSeek, a Qwen server, enterprise endpoints — is added by writing one adapter that
satisfies the same M5 Provider Contract. OpenAI is just a concrete, well-known shape to prove the
pattern. The kernel learns nothing OpenAI-specific.

## The kernel remains authoritative
**The provider obeys the kernel; the kernel never obeys the provider.** The adapter is **translation
only**: CAC Plan/Intent → one synchronous chat completion → normalized response. It cannot bypass any
stage. Every cloud request passes the full pipeline, in order:

```
Provider Contract → Registry → Drift Shield → GEL → Eligibility → Kernel → Ledger → (Replay)
```

If any stage fails, **no request reaches OpenAI** — proven by spy transports whose call-count stays 0
on deny / re-auth / ineligible / sensitive-data paths.

## Intentionally narrow (M8 scope)
Simple text completion, synchronous, **no** streaming, tools, images, or function-calling. The HTTP
**transport is injectable** (`config.transport`); the default uses `fetch`. Tests inject deterministic
fakes for success and every failure mode, so the suite **never touches the network**.

## Explicit opt-in (default OFF)
Cloud execution requires **both**: the provider **registered** AND the **flag enabled**.
`registerOpenAI(registry, { flagEnabled, apiKey, ... })` registers **only** when `flagEnabled === true`
**and** an API key is configured; otherwise it returns `{ skipped:true }` and the registry is
untouched — **the provider is invisible**. `FLAG_OPENAI_DEFAULT` is `false`. (In an app, the flag
would be wired like the others, e.g. `?openai=1`; M8 does not wire the app, so on-device behavior is
unchanged.)

## Conservative, privacy-first capabilities
OpenAI is declared `provider_type: "cloud"`, `requires_network: true`, `max_egress: "full"`, and
`data_classes_allowed: ["public"]` only. So **personal/sensitive data is never eligible to leave the
device to OpenAI** unless policy explicitly broadens it — eligibility rejects it before any call
(`data_class_not_allowed`). The default policy bundle also requires **re-authentication** for full
egress, so even public data does not silently leave the device.

## Outbound payload recording (no secrets)
Every governed execution records, in the DecisionRecord explanation: `provider_id`, `provider_type`,
`payload_classification`, `egress_level`, `model_name`, a **local** `request_id`, and
`response_metadata` (`http_status`, `finish_reason`, token `usage`). The API key, `Authorization`
header, and raw secrets are held only in the adapter closure and **never** appear in any record
(asserted: no `sk-…` / `Bearer` / `authorization` anywhere in the record).

## Honest explanation (from recorded state)
`explanation.providerDetail(record)` renders the cloud "Why?" **entirely from the record**, never from
model output:
```
Answered using openai gpt-5.
Reason: Local execution was not selected.
Payload classification: Public.
Data left device: Prompt only.
Memory sent: None.
Policy: Allowed.
```

## Failure modes — all become CAC Failures, never crashes
| condition | CAC failure_type | recoverable |
|---|---|---|
| missing API key (adapter) | `internal_error` | no |
| 401 / 403 (bad key) | `model_error` | no |
| 429 (rate limited) | `model_error` | yes |
| 5xx (server error) | `model_error` | yes |
| network timeout | `timeout` | yes |
| network error | `model_error` | yes |
| malformed JSON shape / non-JSON body | `validation_error` | no |
| provider drift (bad normalized shape) | caught by the Drift Shield → `provider_drift` → kernel maps to `validation_error` | — |

A throw never escapes the adapter; the kernel never crashes.

## Replay (no network)
A cloud DecisionRecord **verifies** and **replays** with no contact to OpenAI: replay re-derives
governance/eligibility from the recorded evidence. It detects **provider removal**, **capability
changes**, and **policy changes** deterministically, exactly as for local decisions (M7).

## How future providers follow this pattern
Implement one adapter satisfying the M5 contract (`provider_id`, `provider_type`, `capabilities`,
`healthCheck`, `execute`), keep secrets in the closure, return the normalized response shape (or a
normalized failure), and register it behind its own opt-in flag. Eligibility, GEL, the Drift Shield,
the ledger, and replay already govern it — no kernel changes, no exceptions.

---

## Files
**New** — `core/providers/openai-adapter.js`, `tests/run-openai-reference.cjs` (27/27),
`docs/AUBS_OPENAI_REFERENCE_M8.md`.
**Modified** — `core/kernel/execute.js` (record outbound metadata; capture provider response
metadata), `core/kernel/explanation.js` (`providerDetail` honest "Why?"), `core/kernel/plan-builder.js`
(the plan's model_call egress now honors the Intent's declared `max_egress` so cloud plans are
governable; local intents stay `none` → unchanged), `core/providers/index.js`, `tests/run-providers.cjs`
(network-guard now exempts the one sanctioned adapter). **Untouched** — `aubs-app.html`, `sw.js`.

## Tests
`run-openai-reference.cjs` **27/27** + full regression green (17 suites total): golden 16/16,
citation 28/28, relevance 9/9, grounding 8/8, memory 18/18, router 20/20, feel ✓, safety ✓, ledger
13/13, cac 22/22, gel 19/19, kernel 23/23, kernel-chat 24/24, providers 28/28, provider-eligibility
24/24, replay 20/20. Real-browser proof still passes — the on-device M4 path is unaffected.
