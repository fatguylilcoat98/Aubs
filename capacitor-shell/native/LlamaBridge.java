/* ============================================================================
   AUBS Android shell — LlamaBridge (Phase 2): thin JNI surface over llama.cpp

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   GENERIC by design. These native methods know nothing about chat templates, roles, or
   model families — they take an ALREADY-FORMATTED prompt (the AUBS model adapter did the
   templating in JS) and run raw llama.cpp completion. That is what keeps AUBS model-agnostic:
   a new model family needs a new JS adapter, never a change here.

   Location in the generated project (after `npx cap add android`):
     android/app/src/main/java/com/thegoodneighborguard/aubs/LlamaBridge.java
   The native lib is built by CMake (cpp/CMakeLists.txt) → libaubs_llama.so.
   ========================================================================== */
package com.thegoodneighborguard.aubs;

public final class LlamaBridge {
    static {
        System.loadLibrary("aubs_llama");   // built from cpp/aubs_llama.cpp via CMake
    }

    private LlamaBridge() {}

    /** Load a GGUF model. Returns an opaque handle (>0) or 0 on failure. CPU-first; useGpu is a
     *  Phase-2 flag (default off) that only matters if the lib was built with Vulkan. */
    public static native long nativeLoad(String modelPath, int nCtx, int nThreads, boolean useGpu);

    /** Run one completion on an already-formatted prompt. Stops at nPredict tokens, end-of-gen,
     *  or the first `stops` substring. Returns the generated text (no template applied). */
    public static native String nativeGenerate(long handle, String prompt, int nPredict, float temperature, String[] stops);

    /** Free the model/context behind a handle. */
    public static native void nativeFree(long handle);
}
