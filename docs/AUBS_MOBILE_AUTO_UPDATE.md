# AUBS Mobile Auto-Update (Capacitor shell loads live Pages code)

> AUBS — The Good Neighbor Guard
> Built by Christopher Hughes · Sacramento, CA
> Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
> Truth · Safety · We Got Your Back

## Goal

The installed Android APK keeps the native GGUF bridge and the sideloaded model in app
storage, but loads the AUBS **web app from the live GitHub Pages URL** — so a merge to `main`
(→ Pages deploy) shows up in the app on next open. **No laptop rebuild, no model re-download.**
A rebuild is only needed when the **native** Java/C++/plugin code changes.

## How it works

Three pieces, all in `capacitor-shell/`:

1. **`capacitor.config.json` → `server.allowNavigation: ["aubs.thegoodneighborguard.com"]`.**
   This lets the in-app WebView navigate to the Pages origin *inside* the app (instead of
   kicking it out to an external browser), and keeps Capacitor's native bridge
   (`window.Capacitor.Plugins.AubsNative`) available on that page. We do **not** set
   `server.url` — that would force remote-only with no offline fallback.

2. **`www/index.html` — the auto-update switch (remote-first, offline-fallback).**
   On launch it probes the live URL and:
   - reachable → `location.replace("https://aubs.thegoodneighborguard.com/aubs-app.html?spine=1")` (latest code)
   - unreachable / offline (3 s timeout) → `location.replace("aubs-app.html?spine=1")` (the **bundled** copy)
   - `?local=1` or `localStorage.aubs_shell_local="1"` → force the bundled/offline copy.

3. **`MainActivity.java` — injects `window.AUBSNative` on *every* page load**, including the
   live Pages page. So the native GGUF bridge works whether the app runs the bundled copy or
   the remote live code. (The live `aubs-app.html` already loads `core/kernel/native-bridge.js`,
   which detects the injected `window.AUBSNative` and registers the `local-native` provider.)

The governed pipeline is unchanged: the live page runs the same CAC → GEL → Execution Contract
→ eligibility → Drift Shield → ledger path. HTTPS only (no cleartext), no new permissions, no
secrets. The **bundled/offline build path is preserved** — `copy-web.sh` still copies the PWA
into `www/`, and `aubs-app.html` there remains the fallback.

## Files changed

| File | Change |
|---|---|
| `capacitor-shell/capacitor.config.json` | Add `server.allowNavigation` for the Pages host (keeps `webDir` bundle) |
| `capacitor-shell/www/index.html` | Remote-first loader with offline fallback + `?local=1` override |
| `capacitor-shell/native/MainActivity.java` | Comment confirming the facade injects on the remote page too (already per-page) |
| `docs/AUBS_MOBILE_AUTO_UPDATE.md` | This doc |

## How the APK loads remote Pages code

WebView opens the bundled `index.html` → it probes `https://aubs.thegoodneighborguard.com` →
on success it navigates the **same in-app WebView** to `…/aubs-app.html?spine=1`. Because that
host is in `allowNavigation`, the page loads in-app (not an external browser), Capacitor's
bridge stays live, and `MainActivity.onPageFinished` re-injects `window.AUBSNative`.

## Does the native bridge still work on the remote page?

Yes. `window.AUBSNative` is injected by `MainActivity` on **every** `onPageFinished`, and the
`AubsNative` Capacitor plugin is reachable on any `allowNavigation` origin. The live
`aubs-app.html` detects it and registers `local-native`; provider selection prefers it over
WebLLM exactly as before. The sideloaded GGUF in app storage is used unchanged — nothing is
re-downloaded.

## Build / install once

```bash
cd capacitor-shell
npm install
npm run copy-web            # bundle the offline fallback copy
npx cap add android         # if not already generated
# copy native sources in (see AUBS_ANDROID_NATIVE_LLAMA_P2.md), then:
npx cap sync android
npx cap open android        # Run ▶ onto the phone
# sideload the model once (unchanged):
adb push qwen2.5-3b-instruct-q4_k_m.gguf \
  /sdcard/Android/data/com.thegoodneighborguard.aubs/files/models/
```

## How future updates work

1. Merge a web/app change to `main` → GitHub Pages redeploys (~1 min).
2. **Reopen the APK** → it loads the latest `aubs-app.html` from Pages. Done.
3. No rebuild, no `cap sync`, no adb, no model re-download.

A **laptop rebuild is only needed** when native code changes: `MainActivity.java`,
`AubsNativePlugin.java`, `LlamaBridge.java`, or the C++/CMake under `native/cpp/`.

## Limitations when offline

- **First launch offline** → the probe fails and the app loads the **bundled** copy
  (`aubs-app.html` from the last `copy-web` at build time), which may be older than Pages. To
  refresh the bundle, run `npm run copy-web && npx cap sync android` and reinstall.
- The bundled copy is only as new as the last build. To always have a current offline copy,
  rebuild periodically (or rely on the live path when online).
- On-device inference itself is fully offline once the page is loaded and the GGUF is present —
  only the *code fetch* needs the network, and only when you want the latest.
- Force the offline copy anytime with `?local=1` (or `localStorage.aubs_shell_local="1"`).

## Non-goals honored

Bundled/offline path preserved · model storage unchanged · governance unchanged · HTTPS only,
no cleartext, no new permissions, no secrets.
