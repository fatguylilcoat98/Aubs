# AUBS `local-native` Provider — Native On-Device Inference Seam

> AUBS — The Good Neighbor Guard
> Built by Christopher Hughes · Sacramento, CA
> Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
> Truth · Safety · We Got Your Back

**Status:** Phase 3 — repo-side seam only. This PR ships the provider seam, the bridge
interface, registration, selection preference, provenance, and tests. It does **not** ship a
native runtime, a Capacitor project, or an Android APK. Native is an **add**, never a
requirement; with no native bridge present the app behaves exactly as it does today.

The architecture carries correctness; the model carries eloquence. `local-native` swaps the
**language stage** for a faster on-device engine without touching a single governance rule.

---

## 1. Why the in-browser WebLLM path (`local-webllm`) is limited

`local-webllm` runs the model in the browser over **WebGPU**. It is the offline **floor**: it
always works, needs no install, and nothing leaves the device. But on a phone it hits a hard
wall that is **not** about RAM or CPU — it is about a WebGPU limit:

- **The storage-buffer binding cap.** WebGPU exposes `maxStorageBufferBindingSize`. On the
  Galaxy S24 Ultra's Adreno GPU (and most mobile GPUs) this is **~128 MB**. The model's
  `lm_head` / embedding matrix is a single storage buffer of size `vocab × hidden × dtype`.
  For anything past ~0.5B parameters at usable precision, that one buffer exceeds ~128 MB and
  the pipeline **cannot bind it** — so the browser is forced down to a **0.5B** model.
- **Even 0.5B is slow in-browser.** Measured on-device: a single short reply took **~4 minutes**
  (not seconds). WebGPU compute on mobile, plus `mapAsync` readback stalls, makes token
  throughput roughly ~0.2 tok/s in practice.

The ceiling is the **browser's WebGPU sandbox**, not the phone. The phone has the RAM and the
NPU/GPU to run a 3B model — the browser just can't reach them. That is exactly the gap a native
runtime closes.

## 2. Why native GGUF solves the phone-model problem

A **native** runtime links directly against the device's CPU (NEON) and, later, GPU (Vulkan),
with no WebGPU binding cap and no browser readback tax:

- **No 128 MB binding ceiling** → run **3B–8B** GGUF models, not just 0.5B.
- **Quantized GGUF** (`Q4_K_M`, `Q5_K_M`, …) fits a 3B model in ~2–3 GB and runs at
  **conversational speed** on modern phones.
- **Same privacy posture.** GGUF inference is 100% on-device. Nothing leaves. `local-native`
  keeps `provider_type: "local"`, `supports_cloud: false`, `max_egress: "none"` — identical to
  WebLLM. The door stays locked.

Native does not change *what is true* — the runtime still owns identity, memory, facts, and
provenance, and still answers deterministically **model 0×** before any LLM is consulted. Native
only makes the **language stage** fast enough to be pleasant.

## 3. Recommended v1 runtime — `llama.cpp`, CPU-first

**Pick `llama.cpp` + GGUF.** It is the most portable, best-supported on-device engine, ships
Android/NDK build support, and speaks the quantization formats the ecosystem publishes.

- **v1: CPU-first (NEON).** Ship CPU inference first. It is the most reliable path across the
  fragmented Android GPU landscape and needs zero per-device tuning. On a Snapdragon 8-class SoC
  a 3B `Q4_K_M` model is comfortably interactive on CPU.
- **v1 flag, off by default: Vulkan.** Build `llama.cpp` with `GGML_VULKAN=ON` and expose a
  **runtime flag** (`useGpu`) that is **off by default**. Turn it on per-device only after it is
  proven faster and stable on that device. Never make GPU a hard dependency — CPU stays the floor
  under the floor.
- **Recommended v1 model:** a 3B instruct model at `Q4_K_M` (e.g. a Qwen2.5-3B-Instruct or
  Llama-3.2-3B-Instruct GGUF). Big enough to be useful, small enough to load on a mid-RAM phone.

Alternatives considered: MLC/TVM native (more build complexity, overlaps the WebLLM stack we are
trying to escape), ONNX Runtime Mobile (good, but GGUF's quantization + tooling ecosystem wins
for v1). We can add a second native runtime later behind the **same** `local-native` seam.

## 4. Capacitor wrapper plan (smallest viable native shell)

AUBS is a PWA. The smallest way to give that PWA a native inference call is a **Capacitor**
shell: the existing web app runs unchanged inside a `WebView`, and a **Capacitor plugin** exposes
`llama.cpp` to JavaScript. No rewrite, no second app.

```
┌──────────────────────────── Android APK (Capacitor shell) ────────────────────────────┐
│  WebView: the EXISTING AUBS PWA (aubs-app.html + core/*)                               │
│     └─ constitution/chat.js → buildChatEnv() → registerNativeProvider(...)             │
│            │  detects the bridge, registers local-native                               │
│            ▼                                                                            │
│     window.AUBSNative   ◄─── Capacitor plugin JS facade (implements the bridge)        │
│            │  @capacitor/core bridge                                                    │
│            ▼                                                                            │
│  Native plugin (Kotlin/Java)  ──JNI──▶  llama.cpp (C/C++, NDK, GGUF)                    │
│                                             └─ CPU (NEON) v1 · Vulkan flag later        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Plan of record:

1. `npm i @capacitor/core @capacitor/android`, `npx cap init`, `npx cap add android`. The web
   assets are the current PWA — no app code changes.
2. Author a Capacitor plugin `AubsNative` (Kotlin) that loads a GGUF model and runs a completion
   via JNI to `llama.cpp`.
3. In the shell's web bootstrap, install the plugin's JS facade as **`window.AUBSNative`** shaped
   to §5. `core/kernel/native-bridge.js` **already detects `window.AUBSNative`** — so once the
   facade exists, `local-native` registers itself with **no further app changes**.
4. Ship the model file with the APK asset bundle (or download-on-first-run into app storage).

The PWA on `aubs.thegoodneighborguard.com` (GitHub Pages) has **no** `window.AUBSNative`, so it
keeps using `local-webllm` exactly as before. Only the Capacitor build gets native.

## 5. The bridge / plugin interface

`core/kernel/native-bridge.js` defines the seam. A native bridge is any object with a
`generate()` function; everything else is optional. The Capacitor plugin's JS facade implements
this and is installed as `window.AUBSNative` (or injected via
`runConstitutionalChat({ nativeBridge })`).

```ts
interface AubsNativeBridge {
  // REQUIRED — run one completion natively. ctx carries { intent, execution_contract, ... }.
  // Return the model's text; a throw or empty text becomes an explicit, honest failure.
  generate(ctx: object): Promise<{ text: string; finish?: string }>;

  // OPTIONAL — is the native runtime loaded and usable right now? Default: present ⇒ available.
  available?(): boolean;

  // OPTIONAL — health probe for the provider registry. Default: healthy when available.
  health?(): Promise<{ ok: boolean }>;

  // OPTIONAL — provenance metadata surfaced in the ledger/Glass Box.
  info?(): { runtime: string; model_id: string };
}
```

What the seam guarantees around that interface:

- **Contract.** The produced provider returns the normalized Drift-Shield shape
  (`{ ok, output_text, model_id, provider_id }`), `provider_id` is always **`local-native`**,
  distinct from `local-webllm`.
- **Governed like everything else.** The native provider is `provider_type: "local"`, caps
  `{ supports_local: true, supports_cloud: false, requires_network: false, max_egress: "none" }`.
  It runs **only** via `registry.runGuarded` → the Drift Shield, inside the per-turn Execution
  Contract, through the full constitutional pipeline. There is **no** native fast-path that skips
  governance.
- **Registered only when present.** `registerNativeProvider(registry, bridge?)` registers the
  provider **only** when a usable bridge is detected. Absent bridge → `{ registered: false,
  reason: "no_native_bridge" }` and nothing is added.

### Selection & fallback

Selection is deterministic (`core/providers/eligibility.js`):

1. A provider must first be **eligible** — governed-allowed, contract-valid, within the intent's
   constraints (`local_only`, data class, egress), and healthy. Preference **never** makes an
   ineligible provider run and **never** bypasses policy.
2. Among the eligible set, an explicit preference orders `local-native` ahead of `local-webllm`
   (then lowest `provider_id`). So when **both** are eligible, `local-native` is selected.
3. If `local-native` is unavailable/unhealthy/absent, `local-webllm` remains the **fallback**.

With no native provider registered, the ordering reduces to the historical rule (lowest
`provider_id`) — selection is byte-for-byte unchanged.

### Provenance

Because the native provider returns `provider_id: "local-native"`, the pipeline sets
`state.selected_provider = "local-native"`, and the hash-chained, signed DecisionRecord in the
ledger records `provider: "local-native"` with `explanation.provider_id: "local-native"`. The
Glass Box can therefore say **which** on-device runtime answered — native GGUF vs in-browser
WebGPU — truthfully.

## 6. Build steps — Android Studio / NDK (for the follow-up PR)

Not required in this PR; documented so the native build is a straight line later.

1. **Toolchain.** Install Android Studio, the Android SDK, and the **NDK** (`ndk;26.x`) +
   CMake via the SDK Manager. Set `ANDROID_NDK_HOME`.
2. **Vendor llama.cpp.** Add `llama.cpp` as a submodule under the plugin's `android/` native dir.
3. **CMake.** Build `libllama` for the Android ABIs you ship (`arm64-v8a` first; add `x86_64` for
   the emulator). CPU/NEON v1: leave `GGML_VULKAN` **off**. GPU later: a second build with
   `-DGGML_VULKAN=ON`, gated behind the runtime `useGpu` flag.
4. **JNI bridge.** A small C shim exposes `loadModel(path, params)` and
   `complete(promptTokens, opts)` to Kotlin.
5. **Kotlin plugin.** Implement the Capacitor `AubsNative` plugin: `@PluginMethod generate(...)`
   marshals messages → `llama.cpp` → returns `{ text, finish }`. Add `available()`, `health()`,
   `info()`.
6. **JS facade.** Register the plugin's JS as `window.AUBSNative` in the shell bootstrap, shaped
   to §5. Nothing else in the app changes — `native-bridge.js` detects it.
7. **Model asset.** Bundle the GGUF in the APK (or download-on-first-run into app storage) and
   pass its path to `loadModel`.
8. **`npx cap sync android`**, open in Android Studio, build the APK.

## 7. Acceptance criteria for real-phone testing

The follow-up native PR is done when, on a real device (target: Galaxy S24 Ultra):

- [ ] **Native registers.** With the Capacitor build installed, the Glass Box / provenance shows
      the answer came from **`local-native`** (not `local-webllm`).
- [ ] **Speed.** A short reply from a **3B `Q4_K_M`** model returns in **≤ ~10 s** (vs the ~4 min
      WebGPU baseline) — the whole reason this exists.
- [ ] **Model size.** A **3B** model loads and runs (proving the 128 MB WebGPU binding ceiling is
      gone).
- [ ] **Privacy preserved.** Airplane mode: native answers still work; the egress ledger shows
      **nothing left the device**; `max_egress` stays `none`.
- [ ] **Governance intact.** A `deny` / `local_only` policy still blocks/constrains the native
      turn exactly as it does WebLLM — native cannot bypass the pipeline, the Drift Shield, or the
      Execution Contract.
- [ ] **Provenance distinct.** Every native turn writes exactly one signed, hash-chained
      DecisionRecord with `provider: "local-native"`, and offline "Verify integrity" still passes.
- [ ] **Fallback works.** Uninstall/disable the native model → the app falls back to
      `local-webllm` with no error; the PWA on GitHub Pages is unaffected throughout.
- [ ] **Full suite + browser proof green**, unchanged, on the native branch.

---

### Files in this seam (Phase 3)

| File | Role |
|---|---|
| `core/kernel/native-bridge.js` | Bridge interface, detector, `local-native` provider factory, `registerNativeProvider` |
| `core/providers/eligibility.js` | Deterministic selection preference (`local-native` ➤ `local-webllm`) |
| `core/constitution/chat.js` | Registers `local-native` in `buildChatEnv` **only** when a bridge is present; declares it on the `local_chat` skill only when registered |
| `tests/run-native-provider.cjs` | Proves eligibility/selection/fallback/policy/provenance — no runtime, no APK, no network |
| `aubs-app.html`, `sw.js` | Load + precache `native-bridge.js` (inert with no bridge) |
