# AUBS Provider Adapter Framework + Drift Shield — Milestone 5

**Branch:** `claude/aubs-provider-adapters-m5` (base: `claude/aubs-kernel-wrap-m4`)
**Status:** isolated boundary layer. No app changes, no cloud calls, no API keys. The live
governed-local phone path is unchanged.

AUBS already has the Ledger (proves what happened), CAC (defines it), GEL (decides it), the
Kernel (controls execution), and kernel-wrapped local chat (proves it on device). M5 adds the
**stable provider boundary** so that — later — local, cloud, server, and tool providers can plug
in without becoming special cases. This milestone defines the boundary only; it does **not** add
routing or any real provider.

---

## What a provider is
A provider is an adapter that can execute a CAC `Plan` step (today: a `model_call`) and return a
**normalized** result. It has a serializable descriptor (`provider_id`, `provider_type`,
`capabilities`) plus two runtime methods:

```
{
  provider_id,                       // unique string
  provider_type,                     // "local" | "cloud" | "server" | "tool" | "future"
  enabled,                           // optional boolean (default true)
  capabilities,                      // machine-readable record (below)
  healthCheck(),                     // -> Promise<{ ok: boolean, ... }>
  execute(plan, context)             // -> Promise<normalized response>  (same shape as M3/M4 adapters)
}
```

`execute()` returns the **same normalized shape** the M3/M4 kernel adapters use:
```
success:  { ok:true,  output_text, model_id, provider_id }
failure:  { ok:false, failure_type, message, recoverable }
```

## Why providers are treated as untrusted dependencies
Not because they are malicious — because they **fail, change APIs, change pricing/policy,
rate-limit, return malformed output, go unavailable, and behave differently than expected.** If
provider-specific behavior leaked into the kernel, every quirk would become a special case and the
contract would rot. So: **the kernel speaks CAC; adapters translate; the Drift Shield is the
membrane.** A provider that violates the contract becomes unavailable rather than corrupting the run.

## Provider capabilities (machine-readable)
A small record GEL/router can inspect (validated strictly by the Drift Shield):

| key | meaning |
|---|---|
| `supports_local` / `supports_cloud` | execution surfaces |
| `max_egress` | `none` / `redacted` / `full` — the most data that may leave |
| `data_classes_allowed` | subset of `public` / `personal` / `sensitive` |
| `requires_network` | does it need the network at all |
| `supports_streaming` / `supports_json` / `supports_tools` | I/O features |
| `zero_retention_claimed` / `baa_eligible` | compliance posture (claimed) |
| `region` | data region (e.g. `device`, `us`) |
| `cost_class` | `free` / `low` / `medium` / `high` |
| `latency_class` | `low` / `medium` / `high` |

`provider.schema.json` is the canonical descriptor schema. **Type↔capability consistency** is also
enforced (e.g. a `local` provider may not `requires_network`, claim `supports_cloud`, or have
`max_egress > none`; a `cloud` provider must require the network).

## Registry behavior (`registry.js`)
- `register(provider)` — runs the Drift Shield contract check; **rejects** invalid providers and
  **rejects duplicate** `provider_id`. Only validated providers are stored.
- `get(id)` / `has(id)` / `ids()` / `list()` — `ids()`/`list()` are **deterministic, sorted by
  `provider_id`**, independent of registration order.
- `describe()` — data-only view (no functions) for GEL/router to inspect.
- `staticEligibleFor(plan, intent)` — deterministic capability/constraint eligibility (no health).
- `eligibleFor(plan, intent)` — capability **+ live health** (disabled/unhealthy excluded). Async.
- `runGuarded(id, plan, ctx)` — execute a chosen provider **behind the Drift Shield** (the only
  sanctioned execution path).

### Eligibility rules (deterministic, no routing)
- a **local-only** plan can use only `local` providers;
- a **no-egress** plan cannot use cloud / network providers;
- a plan that leaves the device needs a provider whose `max_egress` covers the demand;
- **sensitive** data requires the provider to allow that data class;
- **disabled or unhealthy** providers are not eligible.

## Drift Shield behavior (`drift-shield.js`) — fails closed
- `validateProvider(provider)` — contract check at registration (shape, methods, capability +
  type consistency).
- `validateResponse(resp)` — runtime check of the normalized response: a success **must** carry
  `output_text` + `model_id` + `provider_id`; a failure **must** carry a known `failure_type` +
  `message` + `recoverable`. Missing metadata or an unexpected shape is **drift**.
- `runGuarded(provider, plan, ctx)` — runs `execute()` behind the shield. **Any** drift — a throw,
  a malformed response, a missing method — becomes an explicit `provider_drift` failure. The kernel
  never sees a bad shape.
- `checkHealth(provider)` — a throw or a non-`{ok:true}` result ⇒ unhealthy (fail-closed).

## Fake providers (`fake-providers.js`) — no network, ever
`fakeLocalOkProvider` (succeeds), `fakeLocalFailProvider` (explicit failure),
`fakeCloudOkProvider` (canned success, **no network**), `fakeCloudMalformedProvider` (drift —
missing metadata), `fakeUnhealthyProvider` (health fails), `fakeThrowingProvider` (execute throws).
A test statically asserts **no network primitives** (`fetch`, `XMLHttpRequest`, `WebSocket`, http
modules) exist anywhere in `core/providers/`.

## Kernel compatibility (M3/M4 ↔ M5)
The provider `execute(plan, ctx)` **is** the kernel adapter `run(plan, ctx)` — two views of one
contract. Helpers prove it both ways:
- `providerToKernelAdapter(provider)` → `{ id, run }` that plugs straight into
  `kernel.executeIntent({ local: <adapter> })` (tested: a provider produces a valid CAC Result and
  a verifiable ledger record through the kernel).
- `adapterToProvider(adapter, descriptor)` → wraps the existing M4 local adapter as a provider with
  `defaultLocalCapabilities()` (nothing leaves the device). M4 is not touched; its adapter simply
  *fits*.

## Current non-goals
No real OpenAI / Anthropic / Gemini / xAI integration; no real cloud execution; no API keys; no
enterprise deployment; no router selection redesign; no change to the default provider; provider
routing is **not** live. This milestone defines the boundary — nothing more.

## How this supports future routing
With a stable contract + capabilities + registry + shield in place, a later milestone can let GEL
(and a deterministic router) pick among **eligible, healthy** providers for a plan — e.g. keep
`sensitive` data on a `local`/`baa_eligible` provider, prefer `low` `cost_class`/`latency_class`,
and fall back when a provider drifts or goes unhealthy — all without provider quirks reaching the
kernel. A real provider is added by writing one adapter that satisfies this contract; the shield
and registry already guard it.

---

## Files
**New** — `core/providers/{provider.schema.json, capabilities.js, drift-shield.js, registry.js,
fake-providers.js, index.js}`, `tests/run-providers.cjs` (28/28), `docs/AUBS_PROVIDERS_M5.md`.
**Modified** — none. `aubs-app.html`, `sw.js`, and the kernel/CAC/GEL/ledger sources are untouched.

## Tests
`run-providers.cjs` **28/28** + full regression green: golden 16/16, citation 28/28, relevance 9/9,
grounding 8/8, memory 18/18, router 20/20, feel ✓, safety ✓, ledger 13/13, cac 22/22, gel 19/19,
kernel 23/23, kernel-chat 24/24.
