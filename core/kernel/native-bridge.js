/* ============================================================================
   AUBS Kernel — native provider seam (local-native): the bridge to an on-device
   native inference runtime (llama.cpp / GGUF), governed exactly like WebLLM.

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   WHY THIS EXISTS
   The in-browser WebLLM path (local-webllm) is the offline FLOOR: it always works,
   nothing leaves the device, but WebGPU's storage-buffer binding cap (~128 MB on
   Adreno) forces a tiny model and a very slow response. A NATIVE runtime (llama.cpp
   over GGUF, CPU-first, Vulkan/NEON later) breaks that ceiling — but only inside a
   native shell (Capacitor). So `local-native` is a SECOND local provider that AUBS
   uses when — and only when — a native bridge is actually present.

   THE SEAM (this file)
   This is the repo-side seam ONLY. It does NOT ship a runtime, an APK, or a plugin.
   It defines:
     - the native BRIDGE interface a native plugin must implement,
     - a detector that finds an injected / globally-installed bridge,
     - a governed `local-native` PROVIDER (M5 contract) built from that bridge,
     - a registration helper that registers the provider ONLY when a bridge exists.

   In a plain browser NONE of the bridge exists → nothing is registered → the runtime
   falls back to local-webllm automatically. Native is never required; it is an ADD.

   THE BRIDGE INTERFACE (implemented later by the Capacitor plugin)
     generate(ctx) -> Promise<{ text, finish }>   REQUIRED  (the native completion)
     available()   -> boolean                      OPTIONAL  (default: present ⇒ available)
     health()      -> Promise<{ ok:boolean }>      OPTIONAL  (default: healthy when available)
     info()        -> { runtime, model_id }        OPTIONAL  (provenance metadata)

   The provider it produces returns the SAME normalized shape the Drift Shield validates
   ({ ok, output_text, model_id, provider_id }); a throw or empty output becomes an
   explicit, honest failure — never invented text. provider_id is "local-native", kept
   DISTINCT from "local-webllm" so provenance/ledger shows which runtime actually answered.

   Environment-agnostic: module.exports (Node) or window.AUBS_NATIVE_BRIDGE.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PROV = isNode ? require("../providers") : (typeof window !== "undefined" ? window.AUBS_PROVIDERS : null);

  // The provider_id is deliberately distinct from local-webllm — provenance must be able to
  // say WHICH local runtime answered (native GGUF vs in-browser WebGPU).
  var NATIVE_PROVIDER_ID = "local-native";

  // ── Bridge detection ────────────────────────────────────────────────────────────────
  // A native bridge is any object exposing a generate() function. Everything else is optional.
  function isNativeBridge(bridge) {
    return !!(bridge && typeof bridge === "object" && typeof bridge.generate === "function");
  }
  // Availability is a runtime signal (the plugin may load the model lazily). If the bridge
  // exposes available(), honour it (fail-closed on a throw); otherwise present ⇒ available.
  function bridgeAvailable(bridge) {
    if (!isNativeBridge(bridge)) return false;
    if (typeof bridge.available === "function") { try { return bridge.available() === true; } catch (e) { return false; } }
    return true;
  }
  // Find a bridge: an explicitly-injected one wins; otherwise a globally-installed one
  // (window/globalThis.AUBSNative — where a Capacitor plugin would register itself).
  // In a plain browser this returns null → the provider is never registered.
  function detectNativeBridge(explicit) {
    if (isNativeBridge(explicit)) return explicit;
    var g = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : null);
    if (g && isNativeBridge(g.AUBSNative)) return g.AUBSNative;
    return null;
  }
  // Optional provenance model id the bridge advertises (e.g. "qwen2.5-3b-instruct-q4_k_m.gguf").
  function nativeModelId(bridge) {
    try { var i = (typeof bridge.info === "function") ? bridge.info() : null; return (i && i.model_id) || null; }
    catch (e) { return null; }
  }

  // ── Adapter (M3/M4 shape) over the native completion ─────────────────────────────────
  // Mirrors the local-webllm adapter exactly, but stamps provider_id="local-native".
  function makeNativeAdapter(bridge, model_id) {
    return {
      id: NATIVE_PROVIDER_ID,
      run: function (plan, ctx) {
        return Promise.resolve()
          .then(function () { return bridge.generate(ctx); })
          .then(function (out) {
            var text = (out && typeof out.text === "string") ? out.text : "";
            if (!text) return { ok: false, failure_type: "model_error", message: "the native on-device model returned no text", recoverable: true, finish: out && out.finish };
            return { ok: true, output_text: text, model_id: model_id || nativeModelId(bridge) || "local-native-model", provider_id: NATIVE_PROVIDER_ID, finish: out && out.finish };
          })
          .catch(function (e) { return { ok: false, failure_type: "model_error", message: (e && e.message) ? e.message : String(e), recoverable: true }; });
      }
    };
  }

  // ── Provider (M5 contract) ───────────────────────────────────────────────────────────
  // Same conservative LOCAL capability posture as WebLLM: on-device only, nothing leaves,
  // max_egress=none. Health tracks the bridge (health() if provided, else availability).
  function makeNativeProvider(bridge, opts) {
    opts = opts || {};
    var adapter = makeNativeAdapter(bridge, opts.model_id);
    var healthCheck = function () {
      if (typeof bridge.health === "function") {
        return Promise.resolve().then(function () { return bridge.health(); })
          .then(function (h) { return { ok: !!(h && h.ok === true) }; })
          .catch(function () { return { ok: false }; });
      }
      return Promise.resolve({ ok: bridgeAvailable(bridge) });
    };
    return PROV.adapterToProvider(adapter, {
      provider_id: NATIVE_PROVIDER_ID, provider_type: "local",
      capabilities: PROV.defaultLocalCapabilities(),   // supports_local, supports_cloud:false, max_egress:none
      healthCheck: healthCheck
    });
  }

  // ── Registration (the seam's single entry point) ─────────────────────────────────────
  // Register the native provider into a registry ONLY when a usable bridge is present.
  // Returns a small, honest report. When absent (plain browser / no plugin) NOTHING is
  // registered — WebLLM remains the floor, default behaviour is unchanged.
  function registerNativeProvider(registry, bridge, opts) {
    if (!registry || typeof registry.register !== "function") return { registered: false, reason: "no_registry" };
    var b = detectNativeBridge(bridge);
    if (!b) return { registered: false, reason: "no_native_bridge" };
    if (!bridgeAvailable(b)) return { registered: false, reason: "native_bridge_unavailable" };
    var reg = registry.register(makeNativeProvider(b, opts));
    return reg.ok
      ? { registered: true, provider_id: NATIVE_PROVIDER_ID }
      : { registered: false, reason: reg.error || "register_failed", issues: reg.issues || [] };
  }

  var API = {
    NATIVE_PROVIDER_ID: NATIVE_PROVIDER_ID,
    isNativeBridge: isNativeBridge, bridgeAvailable: bridgeAvailable, detectNativeBridge: detectNativeBridge,
    makeNativeAdapter: makeNativeAdapter, makeNativeProvider: makeNativeProvider, registerNativeProvider: registerNativeProvider
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_NATIVE_BRIDGE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_NATIVE_BRIDGE = API;
})();
