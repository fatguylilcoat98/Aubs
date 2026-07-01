# AUBS Android Native Bridge — Phase 1 (Capacitor Shell + Native Provider Stub)

> AUBS — The Good Neighbor Guard
> Built by Christopher Hughes · Sacramento, CA
> Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
> Truth · Safety · We Got Your Back

**Status:** Phase 1 — shell + bridge only. The native `generate()` returns a deterministic
stub (`"Native bridge connected."`). No llama.cpp, no GGUF, no model bundle, no cloud, no
secrets. The purpose is to prove AUBS can **detect and govern a native runtime** from inside
the app. Real inference is Phase 2 and drops into the exact same seam.

---

## 1. Purpose

The merged `local-native` provider seam (PR #54) lets AUBS use a faster on-device runtime
**when a native bridge exists** — but nothing yet provides that bridge. This phase builds the
**Android (Capacitor) shell** and a **native plugin stub** that exposes the bridge to the
WebView as `window.AUBSNative`, so we can prove end-to-end:

- In a plain browser / GitHub Pages → no bridge → AUBS selects `local-webllm` (unchanged).
- Inside the Android shell → `window.AUBSNative` exists → AUBS detects it, `local-native`
  becomes eligible and is **preferred** over `local-webllm`, and the ledger records
  `provider_id: "local-native"`.

Native is **only a provider**. It never gains authority and never bypasses the constitutional
pipeline.

## 2. Architecture

```
┌───────────────────────────── Android APK (Capacitor shell) ─────────────────────────────┐
│                                                                                          │
│  WebView                                                                                 │
│  ├─ www/index.html  ──loads──▶  aubs-native-facade.js   (installs window.AUBSNative)     │
│  │                    └─ then location.replace("aubs-app.html?spine=1")                   │
│  │                                                                                        │
│  ├─ aubs-app.html  (the EXISTING PWA, byte-identical to Pages)                            │
│  │     └─ core/constitution/chat.js → buildChatEnv()                                      │
│  │            └─ core/kernel/native-bridge.js :: registerNativeProvider(window.AUBSNative)│
│  │                   detects the bridge → registers the local-native PROVIDER             │
│  │                                                                                        │
│  └─ MainActivity re-injects the window.AUBSNative alias on EVERY page load                │
│         (survives the index→app navigation)                                               │
│                                                                                          │
│  window.AUBSNative  ──▶  Capacitor.Plugins.AubsNative  ──▶  AubsNativePlugin (Java)       │
│                                                              └─ Phase 1: returns the stub │
│                                                              └─ Phase 2: JNI → llama.cpp  │
└──────────────────────────────────────────────────────────────────────────────────────────┘

Governed path for EVERY native turn (unchanged, never bypassed):
  Intent → CAC → Plan → GEL → Provider Eligibility → Execution Contract → Drift Shield →
  provider.generate() → Grounding → DecisionRecord → Ledger → Replay → Level-1 explanation
```

### Files in this PR

| File | Role |
|---|---|
| `capacitor-shell/capacitor.config.json` | Capacitor config: appId `com.thegoodneighborguard.aubs`, `webDir: www` |
| `capacitor-shell/package.json` | Capacitor deps (`@capacitor/core`, `@capacitor/android`, cli) + scripts |
| `capacitor-shell/copy-web.sh` | Copies the PWA into `www/` (allow-list; never `.git`/`tests`/`node_modules`) |
| `capacitor-shell/www/index.html` | Shell entry: loads the facade, hands off to `aubs-app.html?spine=1` |
| `capacitor-shell/www/aubs-native-facade.js` | Installs `window.AUBSNative` from the Capacitor plugin (shell-only, never on Pages) |
| `capacitor-shell/native/AubsNativePlugin.java` | Capacitor plugin stub: `available/health/info/generate` |
| `capacitor-shell/native/MainActivity.java` | Registers the plugin + re-injects the `window.AUBSNative` alias per page load |
| `capacitor-shell/.gitignore` | Ignores the generated `android/`, `node_modules/`, copied `www/*` |
| `core/kernel/native-bridge.js` | Adapter now accepts the facade's normalized `generate()` shape (bridge stays untrusted) |
| `tests/run-android-native-bridge.cjs` | 18 assertions proving the governed bridge path (simulated, no APK) |

## 3. How the bridge works

The bridge has two halves that meet at one global, `window.AUBSNative`:

- **Native half — `AubsNativePlugin.java`.** A Capacitor plugin (`@CapacitorPlugin(name="AubsNative")`)
  exposing four methods. Phase 1 `generate()` resolves the deterministic stub:
  ```json
  { "ok": true, "output_text": "Native bridge connected.", "model_id": "native-stub",
    "provider_id": "local-native", "finish": "stop" }
  ```
- **JS half — the facade.** `aubs-native-facade.js` (and the identical inline alias injected by
  `MainActivity`) maps `Capacitor.Plugins.AubsNative` to the exact object the merged seam
  detects:
  ```js
  window.AUBSNative.available()          // sync boolean
  window.AUBSNative.health()             // Promise<{ ok }>
  window.AUBSNative.info()               // sync { runtime, model_id }
  window.AUBSNative.generate(ctx)        // Promise<normalized provider response>
  ```
  `ctx` carries `{ intent, execution_contract, ... }` from the pipeline; the facade forwards
  `{ messages, contract, options }` to the plugin.

**The bridge is untrusted.** `core/kernel/native-bridge.js` re-stamps `provider_id: "local-native"`
itself, decides `ok`/failure itself, and runs the plugin behind the **Drift Shield**. A throw
becomes an honest CAC Failure; a malformed response fails closed (`provider_drift`). A native
plugin can neither spoof its identity nor force a bad answer past governance. It also never runs
without a valid **Execution Contract** (the pipeline refuses, `policy_denied`, before the plugin
is called).

## 4. Why WebLLM remains the fallback

`local-webllm` (in-browser WebGPU) is the **offline floor** and is never removed:

- With no native bridge (every plain browser, including `aubs.thegoodneighborguard.com` on
  GitHub Pages), `registerNativeProvider` adds nothing → `local-webllm` is the sole local
  provider and is selected. Default behaviour is byte-for-byte unchanged.
- Inside the shell, if the native provider ever fails eligibility or health, selection falls
  back to `local-webllm`. Native is preferred **only among already-eligible providers**;
  preference never overrides policy, `local_only`, or health.

## 5. Build in Android Studio

> Nothing here is built or committed by CI — Chris runs it locally. The generated `android/`
> Gradle project and `node_modules/` are git-ignored on purpose (Phase 1 keeps the repo lean).

From the repo root:

```bash
cd capacitor-shell

# 1. Install the Capacitor CLI + core (one time).
npm install

# 2. Copy the PWA into the Capacitor webDir (www/). Re-run whenever the app changes.
npm run copy-web

# 3. Generate the native Android project (creates capacitor-shell/android/).
npx cap add android

# 4. Drop the two skeleton files into the generated project, replacing the defaults:
#      native/AubsNativePlugin.java →
#        android/app/src/main/java/com/thegoodneighborguard/aubs/AubsNativePlugin.java
#      native/MainActivity.java     →
#        android/app/src/main/java/com/thegoodneighborguard/aubs/MainActivity.java
cp native/AubsNativePlugin.java android/app/src/main/java/com/thegoodneighborguard/aubs/
cp native/MainActivity.java     android/app/src/main/java/com/thegoodneighborguard/aubs/

# 5. Sync web assets + native config, then open Android Studio.
npx cap sync android
npx cap open android
```

In Android Studio: let Gradle sync, then **Run ▶** onto a device/emulator (build the debug APK).

## 6. Required Android Studio / SDK / NDK setup

- **Android Studio** (Hedgehog or newer).
- **Node.js 18+** and npm (for the Capacitor CLI).
- **JDK 17** (bundled with recent Android Studio).
- **Android SDK Platform** API 34 (Android 14) + **Build-Tools** 34.x, via the SDK Manager.
- **Gradle** — the wrapper is generated by `cap add android`; Android Studio manages it.
- **NDK + CMake** — **not needed for Phase 1** (pure Java stub, no JNI). Install them for
  **Phase 2** (llama.cpp): SDK Manager → SDK Tools → check **NDK (Side by side)** (`26.x`) and
  **CMake** (`3.22+`); set `ANDROID_NDK_HOME`.
- No signing config required for a debug build; no secrets, no API keys, no network permissions
  added.

## 7. Install on the phone

1. Enable **Developer options** → **USB debugging** on the Galaxy (Settings → About phone → tap
   Build number 7×; then Settings → Developer options → USB debugging).
2. Connect by USB, authorize the computer.
3. In Android Studio pick the device and **Run ▶** — it builds and installs the debug APK.
4. Or from the terminal: `cd capacitor-shell/android && ./gradlew installDebug`.

## 8. Test `?spine=1`

The shell already hands off to `aubs-app.html?spine=1`, so the constitutional pipeline is on
and the native provider is exercised. To verify:

1. Launch **AUBS** on the phone (the shell app).
2. Send any message.
3. Expect the reply **"Native bridge connected."** (the Phase 1 stub) instead of a WebLLM answer.
4. Open the Glass Box / "Why?" under the answer — it should attribute the turn to
   **`local-native`**.

(In a desktop browser you can confirm the *fallback*: open `aubs-app.html?spine=1` with no
native bridge → you get the normal WebLLM path and `local-webllm` provenance.)

## 9. Expected provenance output

For a native turn, the single signed, hash-chained DecisionRecord in the ledger carries:

```jsonc
{
  "provider": "local-native",            // top-level provider
  "model_id": "native-stub",             // Phase 1 stub id (Phase 2: the GGUF filename)
  "execution_type": "model",
  "explanation": {
    "provider_id": "local-native",       // why/Glass Box attribution
    "provider_type": "local",
    "left_device": false                 // nothing left the device
  }
}
```

"Verify integrity" re-checks the hash chain + signature offline and still passes. A native
**failure** (throw / malformed) still writes a record with `provider: "local-native"` and an
honest failure — never an invented answer.

## 10. Phase 2 plan — llama.cpp / GGUF

The seam does not change; only the plugin body does.

1. **Vendor llama.cpp** as a submodule under the plugin's native dir; build `libllama` with the
   NDK/CMake for `arm64-v8a` (add `x86_64` for the emulator). **CPU-first (NEON)**; keep
   `GGML_VULKAN` off behind a runtime `useGpu` flag, default off.
2. **JNI shim** exposing `loadModel(path, params)` and `complete(promptTokens, opts)`.
3. **Replace `AubsNativePlugin.generate()`** to run real inference over `request.messages`,
   honouring `request.contract.output_constraints` (e.g. `max_tokens`); on error `call.reject(...)`
   (the seam turns it into a CAC Failure). Update `info().model_id` to the loaded GGUF filename.
4. **Ship a model** — bundle a 3B `Q4_K_M` GGUF as an APK asset, or download-on-first-run into
   app storage (no large model committed to the repo).
5. **Acceptance (real phone):** native shown in provenance; a 3B model loads (proving the WebGPU
   ~128 MB binding ceiling is gone); a short reply in **≤ ~10 s** (vs the ~4-min WebGPU baseline);
   airplane mode still answers with nothing leaving the device; `deny`/`local_only` still governs;
   fallback to `local-webllm` works; full suite + browser proof stay green.
