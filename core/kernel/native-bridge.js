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

   THE BRIDGE INTERFACE (implemented by the Capacitor plugin over llama.cpp)
     generate(request) -> Promise<{ text, finish }>   REQUIRED  (a GENERIC completion)
     available()       -> boolean                      OPTIONAL  (default: present ⇒ available)
     health()          -> Promise<{ ok:boolean }>      OPTIONAL  (default: healthy when available)
     info()            -> { runtime, model_id }        OPTIONAL  (provenance metadata)

   The native runtime is MODEL-AGNOSTIC: it receives an already-formatted request
     { prompt, stop, max_tokens, temperature, messages, model_id, contract }
   and runs raw completion (tokenize prompt → generate → detokenize). It applies NO chat
   template of its own — the model-specific template is picked HERE from core/model/adapters
   by model_id, so a new model family is a new ADAPTER, never a native rewrite. (For the
   Phase 1 stub, request is ignored and a canned string is returned — both shapes work.)

   The provider it produces returns the normalized shape the Drift Shield validates
   ({ ok, output_text, model_id, provider_id }); a throw or empty output becomes an
   explicit, honest failure — never invented text. provider_id is "local-native", kept
   DISTINCT from "local-webllm" so provenance/ledger shows which runtime actually answered.

   Environment-agnostic: module.exports (Node) or window.AUBS_NATIVE_BRIDGE.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PROV = isNode ? require("../providers") : (typeof window !== "undefined" ? window.AUBS_PROVIDERS : null);
  // Model adapters own the ONE model-specific thing (the chat template). The seam is otherwise
  // model-agnostic. If the module is absent we degrade to a trivial format so the seam still runs.
  var ADAPTERS = isNode ? require("../model/adapters") : (typeof window !== "undefined" ? window.AUBS_MODEL_ADAPTERS : null);

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

  // The messages to feed the model: the turn's history if the caller threaded it, else a
  // single user turn derived from the CAC intent. Deterministic, no model.
  function resolveMessages(opts, ctx) {
    if (opts && Array.isArray(opts.messages) && opts.messages.length) return opts.messages;
    if (ctx && Array.isArray(ctx.messages) && ctx.messages.length) return ctx.messages;
    var ut = ctx && ctx.intent && (ctx.intent.user_text || ctx.intent.text);
    return ut ? [{ role: "user", content: String(ut) }] : [];
  }
  // The GOVERNED output ceiling: the Execution Contract's max_tokens wins (the runtime, not the
  // model, decides how much it may say). Falls back to a caller option, then a safe default.
  function resolveMaxTokens(opts, ctx) {
    var c = ctx && ctx.execution_contract;
    var oc = c && c.output_constraints;
    if (oc && typeof oc.max_tokens === "number") return oc.max_tokens;
    if (opts && opts.options && typeof opts.options.max_tokens === "number") return opts.options.max_tokens;
    return 256;
  }
  // Trivial fallback formatter if the adapter registry is unavailable (keeps the seam alive).
  function fallbackFormat(messages) {
    var out = "";
    (messages || []).forEach(function (m) { out += ((m && m.role) || "user") + ": " + String((m && m.content) || "") + "\n"; });
    return { prompt: out + "assistant:", stop: [], adapter_id: "none" };
  }

  // ── Adapter (M3/M4 shape) over the native completion ─────────────────────────────────
  // Picks the MODEL-SPECIFIC chat template (by model_id) from core/model/adapters, formats the
  // conversation into a raw prompt, and hands the generic native runtime a MODEL-AGNOSTIC request
  // { prompt, stop, max_tokens, temperature, messages, model_id, contract }. The runtime returns
  // raw text; we clean template artifacts with the SAME adapter, then normalize.
  //
  // The bridge is an UNTRUSTED dependency: the RUNTIME decides ok/failure and OWNS provider_id —
  // a native plugin can never spoof its identity or force a "success" past the Drift Shield.
  // Accepts either return shape: lean { text, finish } or normalized { ok, output_text, ... }.
  // No text, an explicit ok:false, garbage, or a throw ⇒ fail closed.
  function makeNativeAdapter(bridge, opts) {
    opts = opts || {};
    return {
      id: NATIVE_PROVIDER_ID,
      run: function (plan, ctx) {
        // model_id for BOTH adapter selection and provenance is the native model (the loaded
        // GGUF), never the WebLLM id — prefer what the bridge advertises.
        var modelId = nativeModelId(bridge) || opts.model_id || "local-native-model";
        var messages = resolveMessages(opts, ctx);
        var fmt = ADAPTERS && ADAPTERS.format ? ADAPTERS.format(modelId, messages, opts.formatOpts) : fallbackFormat(messages);
        var request = {
          prompt: fmt.prompt,
          stop: fmt.stop || [],
          max_tokens: resolveMaxTokens(opts, ctx),
          temperature: (opts.options && typeof opts.options.temperature === "number") ? opts.options.temperature : 0.7,
          messages: messages,
          model_id: modelId,
          adapter_id: fmt.adapter_id,
          // pass the governed contract through so a native runtime can honour its constraints
          contract: (ctx && ctx.execution_contract) || null
        };
        return Promise.resolve()
          .then(function () { return bridge.generate(request); })
          .then(function (out) {
            var o = (out && typeof out === "object") ? out : {};
            var raw = (typeof o.output_text === "string") ? o.output_text
                    : (typeof o.text === "string") ? o.text : "";
            var text = (ADAPTERS && ADAPTERS.clean) ? ADAPTERS.clean(modelId, raw) : raw;
            var declaredFail = (o.ok === false);
            if (declaredFail || !text) {
              return { ok: false, failure_type: "model_error", message: (typeof o.message === "string" && o.message) || "the native on-device model returned no text", recoverable: true, finish: o.finish };
            }
            return { ok: true, output_text: text, model_id: (typeof o.model_id === "string" && o.model_id) || modelId, provider_id: NATIVE_PROVIDER_ID, finish: o.finish };
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
    var adapter = makeNativeAdapter(bridge, opts);
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
