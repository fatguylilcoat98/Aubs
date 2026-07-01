/* ============================================================================
   AUBS Android shell — native bridge PLUGIN (Phase 2: real llama.cpp/GGUF)

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   The NATIVE half of the bridge — a Capacitor plugin the WebView reaches as
   window.Capacitor.Plugins.AubsNative. Phase 2 runs REAL on-device inference via llama.cpp
   over a sideloaded GGUF. It is GENERIC: generate() receives an already-formatted prompt
   (the AUBS model adapter templated it in JS) and returns raw text. No template, no roles,
   no model-family logic lives here — so swapping models is a new JS adapter, not a native edit.

   The plugin holds NO authority: every call still originates from the governed pipeline
   (CAC → GEL → Execution Contract → eligibility → Drift Shield → ledger). It reads no
   secrets, opens no network, and bundles no model (the .gguf is sideloaded via adb).

   Model file (manual sideload):
     adb push qwen2.5-3b-instruct-q4_k_m.gguf /sdcard/Android/data/com.thegoodneighborguard.aubs/files/models/
   The plugin loads the first .gguf it finds in that app-scoped models dir.

   Location in the generated project (after `npx cap add android`):
     android/app/src/main/java/com/thegoodneighborguard/aubs/AubsNativePlugin.java
   ========================================================================== */
package com.thegoodneighborguard.aubs;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AubsNative")
public class AubsNativePlugin extends Plugin {
    private static final String TAG = "AubsNative";
    private static final int N_CTX = 4096;
    private static final boolean USE_GPU = false;   // Phase 2 v1: CPU-first (NEON). Flip only on a proven device.

    // llama.cpp inference is blocking → run off the main thread so the WebView stays responsive.
    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private long handle = 0;          // opaque llama.cpp handle (0 = not loaded)
    private String modelId = "native-stub";

    /** The app-scoped models dir where the sideloaded GGUF lives. */
    private File modelsDir() {
        File dir = new File(getContext().getExternalFilesDir(null), "models");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** First .gguf in the models dir, or null if none has been pushed yet. */
    private File findModel() {
        File[] files = modelsDir().listFiles();
        if (files != null) for (File f : files) if (f.getName().toLowerCase().endsWith(".gguf")) return f;
        return null;
    }

    /** Lazily load the model on first use. Returns true if a model is loaded. */
    private synchronized boolean ensureLoaded() {
        if (handle != 0) return true;
        File model = findModel();
        if (model == null) return false;
        int threads = Math.max(2, Runtime.getRuntime().availableProcessors() - 2);
        long h = LlamaBridge.nativeLoad(model.getAbsolutePath(), N_CTX, threads, USE_GPU);
        if (h == 0) { Log.e(TAG, "nativeLoad failed for " + model.getName()); return false; }
        handle = h;
        modelId = model.getName();   // provenance: the exact GGUF filename
        Log.i(TAG, "loaded " + modelId + " (threads=" + threads + ", gpu=" + USE_GPU + ")");
        return true;
    }

    /** Is a model present + loadable right now? */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", handle != 0 || findModel() != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void health(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", handle != 0 || findModel() != null);
        call.resolve(ret);
    }

    /** Provenance metadata: runtime + the loaded GGUF filename (drives the AUBS model adapter). */
    @PluginMethod
    public void info(PluginCall call) {
        File m = findModel();
        JSObject ret = new JSObject();
        ret.put("runtime", "llama.cpp");
        ret.put("model_id", handle != 0 ? modelId : (m != null ? m.getName() : "native-none"));
        call.resolve(ret);
    }

    /**
     * One completion. request = { prompt, stop[], max_tokens, temperature, ... } — ALREADY
     * templated by the AUBS adapter. We run raw llama.cpp on request.prompt and return
     * { text, finish }. On any error / missing model we call.reject(...) → the seam turns it
     * into an honest CAC Failure (fail closed); it NEVER invents an answer.
     */
    @PluginMethod
    public void generate(PluginCall call) {
        final String prompt = call.getString("prompt", "");
        final int maxTokens = call.getInt("max_tokens", 256);
        final float temperature = call.getFloat("temperature", 0.7f).floatValue();
        final ArrayList<String> stops = new ArrayList<>();
        try {
            com.getcapacitor.JSArray arr = call.getArray("stop");
            if (arr != null) for (int i = 0; i < arr.length(); i++) stops.add(arr.getString(i));
        } catch (Exception ignore) {}

        pool.execute(() -> {
            try {
                if (!ensureLoaded()) { call.reject("no GGUF model found — sideload one into the app's models/ dir"); return; }
                if (prompt == null || prompt.isEmpty()) { call.reject("empty prompt"); return; }
                String text = LlamaBridge.nativeGenerate(handle, prompt, maxTokens, temperature, stops.toArray(new String[0]));
                if (text == null) { call.reject("native generate returned null"); return; }
                JSObject ret = new JSObject();
                ret.put("text", text);
                ret.put("finish", "stop");
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject(t.getMessage() != null ? t.getMessage() : "native generate failed");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        pool.execute(() -> { if (handle != 0) { LlamaBridge.nativeFree(handle); handle = 0; } });
    }
}
