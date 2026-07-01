/* ============================================================================
   AUBS Android shell — native bridge FACADE (Phase 1)

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   This is the JS-visible half of the native bridge. It runs ONLY inside the Android
   (Capacitor) shell — the native MainActivity injects it into every page load. It is
   NEVER shipped to GitHub Pages and NEVER referenced by aubs-app.html, so the browser
   PWA keeps `window.AUBSNative` undefined and selects local-webllm exactly as before.

   What it does: when the Capacitor plugin `AubsNative` is present, it installs
   `window.AUBSNative` — the object shape the MERGED provider seam
   (core/kernel/native-bridge.js) already detects and governs:

       window.AUBSNative.available() -> boolean          (sync)
       window.AUBSNative.health()    -> Promise<{ ok }>
       window.AUBSNative.info()      -> { runtime, model_id }   (sync)
       window.AUBSNative.generate(request) -> Promise<normalized provider response>

   The seam treats the bridge as an UNTRUSTED provider: it re-stamps provider_id and
   decides ok/failure itself. This facade only forwards; it grants no authority. The
   native call still flows through CAC → GEL → Execution Contract → eligibility → the
   Drift Shield → the ledger. Nothing here bypasses the constitutional pipeline.
   ========================================================================== */
(function () {
  "use strict";

  // Only activate inside a Capacitor WebView that actually registered the AubsNative plugin.
  // In a plain browser (GitHub Pages) Capacitor is absent → we install NOTHING → the seam's
  // detectNativeBridge() finds no window.AUBSNative → local-webllm stays the floor.
  var cap = (typeof window !== "undefined") ? window.Capacitor : null;
  var plugin = cap && cap.Plugins ? cap.Plugins.AubsNative : null;
  if (!plugin) return;

  // Sync caches: the seam calls available()/info() synchronously, but plugin calls are async.
  // The plugin object EXISTING means the native runtime is loaded, so default available=true.
  // We refresh the caches in the background from the plugin's real answers.
  var cache = { available: true, info: { runtime: "capacitor-native-stub", model_id: "native-stub" } };

  function refresh() {
    try {
      if (typeof plugin.available === "function") {
        Promise.resolve(plugin.available()).then(function (r) {
          // Capacitor wraps returns as objects; accept {available} or a bare boolean.
          if (r && typeof r === "object" && "available" in r) cache.available = r.available === true;
          else cache.available = r === true;
        }).catch(function () { /* keep last known */ });
      }
      if (typeof plugin.info === "function") {
        Promise.resolve(plugin.info()).then(function (i) {
          if (i && typeof i === "object") cache.info = { runtime: i.runtime || cache.info.runtime, model_id: i.model_id || cache.info.model_id };
        }).catch(function () { /* keep default */ });
      }
    } catch (e) { /* stay with defaults */ }
  }
  refresh();

  window.AUBSNative = {
    // sync — is the native runtime present & usable right now?
    available: function () { return cache.available === true; },

    // async health probe for the provider registry (fail-closed on error)
    health: function () {
      if (typeof plugin.health !== "function") return Promise.resolve({ ok: cache.available === true });
      return Promise.resolve(plugin.health())
        .then(function (h) { return { ok: !!(h && h.ok === true) }; })
        .catch(function () { return { ok: false }; });
    },

    // sync provenance metadata surfaced in the ledger / Glass Box
    info: function () { return { runtime: cache.info.runtime, model_id: cache.info.model_id }; },

    // async completion. Phase 2: the AUBS seam already applied the model-specific chat template
    // and passes a GENERIC request { prompt, stop, max_tokens, temperature, messages, model_id,
    // adapter_id, contract }. We forward it verbatim to the native runtime, which runs raw
    // completion on request.prompt (it applies NO template of its own). Returns { text, finish }.
    // A throw or malformed response is normalized to an honest failure by the seam (fail closed).
    generate: function (request) {
      return Promise.resolve(plugin.generate(request || {}));
    }
  };
})();
