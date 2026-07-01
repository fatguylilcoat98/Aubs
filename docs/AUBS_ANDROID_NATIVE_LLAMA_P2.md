# AUBS Android Native Bridge — Phase 2 (llama.cpp / GGUF, model-agnostic)

> AUBS — The Good Neighbor Guard
> Built by Christopher Hughes · Sacramento, CA
> Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
> Truth · Safety · We Got Your Back

**Status:** Phase 2 — real on-device inference. Replaces the Phase 1 stub with **llama.cpp**
running a **sideloaded GGUF**. First target: **Qwen2.5-3B-Instruct Q4_K_M**. CPU-first (NEON),
Vulkan behind an off-by-default flag. No cloud, no secrets, no bundled model (you `adb push`
the `.gguf`). The provider seam, governance, and ledger are unchanged from Phase 1.

The organizing principle Chris asked for: **the model interface is abstracted behind a
provider.** The chat template is model-specific and isolated in ONE swappable place; the rest of
AUBS (CLASPION, VeriCore, memory, orchestration, governance, the constitutional pipeline, the
ledger) stays **model-agnostic**. Swapping in Llama, Gemma, Phi, or a future GGUF = a **new
adapter**, not a rewrite.

---

## 1. Purpose

Phase 1 proved AUBS can detect and govern a native runtime. Phase 2 makes that runtime actually
think — real llama.cpp inference over a 3B GGUF — while keeping the model swappable and the
pipeline model-agnostic.

## 2. Architecture — where "model-specific" begins and ends

```
JS (AUBS, model-agnostic pipeline)                         │  Native (generic runtime)
                                                           │
core/constitution/chat.js  buildChatEnv()                  │
   └─ threads this turn's messages to the native provider  │
core/kernel/native-bridge.js  (local-native provider)      │
   ├─ resolve adapter by model_id (the loaded GGUF)  ◄──── the ONE model-specific decision
   ├─ core/model/adapters.js :: format(messages)           │
   │     → { prompt, stop }   (Qwen=ChatML, Llama=hdr ids) │
   ├─ build governed request { prompt, stop, max_tokens*,  │
   │     temperature, messages, model_id, contract }       │
   └─ window.AUBSNative.generate(request) ─────────────────┼─▶ AubsNativePlugin.generate()
                                                           │      └─ LlamaBridge.nativeGenerate()
   ◄──────────────── { text, finish } ────────────────────┼─◀ JNI aubs_llama.cpp
   ├─ adapter.clean(text)  (strip template artifacts)      │      tokenize→decode→sample→detok
   └─ normalized { ok, output_text, model_id, provider_id }│      (NO template — raw prompt in)
                                                           │
* max_tokens comes from the Execution Contract — the runtime, not the model, sets the ceiling.
```

**Everything model-specific lives in `core/model/adapters.js`.** The native runtime is generic:
it runs whatever prompt string it is handed. That is the whole point — a new model family only
needs a new adapter (a chat template + stop tokens + optional output cleaning), and nothing else
in AUBS changes.

### The governed path is unchanged

Every native turn still flows: **Intent → CAC → Plan → GEL → Provider Eligibility → Execution
Contract → Drift Shield → provider.generate() → Grounding → DecisionRecord → Ledger → Replay →
Level-1 explanation.** The native plugin is only a provider; it holds no authority, and it never
runs without a valid Execution Contract (the pipeline refuses, `policy_denied`, first).

## 3. The model-adapter abstraction (how to swap models)

`core/model/adapters.js` ships **Qwen2.5 (ChatML)**, **Llama-3**, **Phi-3**, and a **generic**
fallback. An adapter is:

```js
{ id, family,
  matches(model_id) -> bool,               // claim GGUFs by name
  format(messages, opts) -> { prompt, stop },   // the model-specific chat template
  clean(text) -> string }                  // strip template artifacts the model echoes
```

To add, say, **Gemma**:

```js
window.AUBS_MODEL_ADAPTERS.register({
  id: "gemma", family: "gemma",
  matches: (m) => /gemma/i.test(String(m)),
  format: (messages) => {
    let out = "";
    messages.forEach(m => { const role = m.role === "assistant" ? "model" : "user";
      out += "<start_of_turn>" + role + "\n" + m.content + "<end_of_turn>\n"; });
    return { prompt: out + "<start_of_turn>model\n", stop: ["<end_of_turn>"] };
  },
  clean: (t) => t
});
```

`register()` inserts before the generic catch-all, so the new adapter wins for its GGUFs. **No
native code, no pipeline change.** `adb push` a `gemma-*.gguf`, and it's picked up by `model_id`.

## 4. Native build (Android Studio / NDK / CMake)

The Java/C++/CMake sources live in `capacitor-shell/native/`. The generated Gradle project and
`node_modules/` are git-ignored — Chris generates them locally.

### 4.1 Vendor llama.cpp (pinned)

```bash
cd capacitor-shell
npm install
npm run copy-web
npx cap add android          # generates capacitor-shell/android/

# vendor llama.cpp as a submodule at the CMake path, pinned to a known tag
cd android/app/src/main
mkdir -p cpp && cd cpp
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp && git checkout b4000    # PIN — see the API note in aubs_llama.cpp
```

> **API pin.** `cpp/aubs_llama.cpp` targets the model-based tokenize/detokenize API + the
> sampler-chain API (tag ~`b4000`). A much newer checkout may rename a few symbols; the shim
> lists each rename inline and it is the ONLY file to touch if you bump the pin.

### 4.2 Drop in the AUBS native sources

```bash
# from capacitor-shell/
cp native/AubsNativePlugin.java android/app/src/main/java/com/thegoodneighborguard/aubs/
cp native/MainActivity.java     android/app/src/main/java/com/thegoodneighborguard/aubs/
cp native/LlamaBridge.java      android/app/src/main/java/com/thegoodneighborguard/aubs/
cp native/cpp/CMakeLists.txt    android/app/src/main/cpp/
cp native/cpp/aubs_llama.cpp    android/app/src/main/cpp/
```

### 4.3 Wire CMake into the app Gradle

In `android/app/build.gradle`, inside `android { }`:

```gradle
android {
    ndkVersion "26.3.11579264"
    defaultConfig {
        externalNativeBuild { cmake { arguments "-DANDROID_STL=c++_shared" } }
        ndk { abiFilters "arm64-v8a" }          // add "x86_64" for the emulator
    }
    externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" ; version "3.22.1" } }
}
```

### 4.4 SDK/NDK setup

- Android Studio (Hedgehog+), Node 18+, JDK 17.
- SDK Platform 34 + Build-Tools 34.x.
- **SDK Tools → NDK (Side by side) `26.x` + CMake `3.22+`** (now required — Phase 2 has JNI).
- Vulkan is **off** by default (`AUBS_USE_VULKAN=OFF` in CMake, `USE_GPU=false` in the plugin).
  Enable only after it's proven on a device.

### 4.5 Build

```bash
npx cap sync android
npx cap open android      # Gradle sync, then Run ▶
```

## 5. Sideload the model (adb push)

No model is bundled. Push the GGUF into the app-scoped models dir the plugin reads:

```bash
adb push qwen2.5-3b-instruct-q4_k_m.gguf \
  /sdcard/Android/data/com.thegoodneighborguard.aubs/files/models/
```

The plugin loads the first `*.gguf` it finds there, lazily on the first turn. If none is present,
`available()`/`health()` report false → `local-native` is ineligible → AUBS uses `local-webllm`
(the floor). No crash, honest fallback.

## 6. Test `?spine=1`

The shell hands off to `aubs-app.html?spine=1`, so the constitutional pipeline is on.

1. `adb push` the Qwen GGUF (step 5), launch **AUBS**, send a message.
2. Expect a **real Qwen answer** (not the Phase 1 stub), generated on-device.
3. Open the Glass Box / "Why?": attribution **`local-native`**, `model_id` =
   `qwen2.5-3b-instruct-q4_k_m.gguf`.
4. Airplane mode: it still answers (100% on-device); the egress ledger shows nothing left.

## 7. Expected provenance

```jsonc
{
  "provider": "local-native",
  "model_id": "qwen2.5-3b-instruct-q4_k_m.gguf",   // the loaded GGUF (drives the adapter)
  "execution_type": "model",
  "explanation": { "provider_id": "local-native", "provider_type": "local", "left_device": false }
}
```

## 8. Acceptance criteria (real phone)

- [ ] Native answers a real Qwen2.5-3B completion on-device (not the stub).
- [ ] Glass Box / ledger show `local-native` + the GGUF `model_id`.
- [ ] A **3B** model loads and runs (the WebGPU 128 MB binding ceiling is gone).
- [ ] Short reply in **≤ ~10 s** vs the ~4-min WebGPU baseline.
- [ ] Airplane mode still answers; egress ledger shows nothing left the device.
- [ ] `deny` / `local_only` policy still governs the native turn (no bypass).
- [ ] `max_tokens` from the Execution Contract bounds native output.
- [ ] No GGUF present → clean fallback to `local-webllm`, no crash.
- [ ] Swapping in a Llama/Phi GGUF works with only its adapter (already shipped) — no rebuild.
- [ ] Full JS suite + browser proof stay green.

## 9. Non-goals (unchanged)

No OpenAI, no private-server inference, no removing WebLLM, native not default outside the
Android shell, no large GGUF committed to the repo, no weakened safety, no skipped pipeline.

## 10. What's device-verified vs. code-complete here

- **Verified in CI (Node, simulated runtime):** the model-adapter templates (Qwen/Llama/Phi +
  generic), adapter resolution by `model_id`, the governed request (prompt + stop + contract
  `max_tokens`), provider selection/fallback, provenance `model_id` = GGUF, throw → CAC Failure,
  malformed → fail closed. See `tests/run-model-adapters.cjs`, `tests/run-native-llama.cjs`,
  `tests/run-android-native-bridge.cjs`, `tests/run-native-provider.cjs`.
- **Code-complete, builds on Chris's machine (no Android SDK in CI):** the JNI shim
  (`cpp/aubs_llama.cpp`), `CMakeLists.txt`, `LlamaBridge.java`, and the real
  `AubsNativePlugin.generate()`. These compile against the pinned llama.cpp tag; the shim flags
  the few symbols that drift across llama.cpp versions.
