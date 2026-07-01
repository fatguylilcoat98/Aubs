/* ============================================================================
   AUBS Android shell — native bridge PLUGIN skeleton (Phase 1: deterministic stub)

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   This is the NATIVE half of the bridge — a Capacitor plugin the WebView reaches as
   window.Capacitor.Plugins.AubsNative. Phase 1 returns a DETERMINISTIC STUB from
   generate() ("Native bridge connected.") to prove the governed bridge path end to end.
   Phase 2 replaces the body of generate() with real llama.cpp/GGUF inference over JNI;
   NOTHING else in AUBS changes — the provider seam, eligibility, and ledger already work.

   The plugin holds NO authority: it is only a provider. Every call still originates from
   the governed pipeline (CAC → GEL → Execution Contract → eligibility → Drift Shield →
   ledger). It reads no secrets, opens no network, and bundles no model.

   Location in the generated project (after `npx cap add android`):
     android/app/src/main/java/com/thegoodneighborguard/aubs/AubsNativePlugin.java
   ========================================================================== */
package com.thegoodneighborguard.aubs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AubsNative")
public class AubsNativePlugin extends Plugin {

    // Phase 1 metadata. Phase 2 sets model_id to the loaded GGUF filename.
    private static final String RUNTIME = "capacitor-native-stub";
    private static final String MODEL_ID = "native-stub";

    /** Is the native runtime present and usable right now? Phase 1: always true (stub loaded). */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    /** Health probe for the provider registry. Phase 1: healthy. */
    @PluginMethod
    public void health(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** Provenance metadata surfaced in the ledger / Glass Box. */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("runtime", RUNTIME);
        ret.put("model_id", MODEL_ID);
        call.resolve(ret);
    }

    /**
     * One completion. Phase 1 returns the deterministic stub in the NORMALIZED provider shape
     * the merged seam accepts. The seam re-stamps provider_id itself (a plugin cannot spoof its
     * identity), so returning it here is only a convenience/echo.
     *
     * Phase 2: replace the body with JNI llama.cpp inference over request.messages, honouring
     * request.contract.output_constraints (e.g. max_tokens). On any native error, call
     * call.reject(...) — the seam turns a rejection/throw into an honest CAC Failure (fail closed).
     */
    @PluginMethod
    public void generate(PluginCall call) {
        // request = { messages, contract, options } — read but unused by the Phase 1 stub.
        try {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("output_text", "Native bridge connected.");
            ret.put("model_id", MODEL_ID);
            ret.put("provider_id", "local-native");
            ret.put("finish", "stop");
            call.resolve(ret);
        } catch (Exception e) {
            // Fail closed: a rejection becomes a normalized CAC Failure in the pipeline.
            call.reject(e.getMessage() != null ? e.getMessage() : "native generate failed");
        }
    }
}
