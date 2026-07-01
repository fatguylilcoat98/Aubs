/* ============================================================================
   AUBS Android shell — JNI shim over llama.cpp (Phase 2)

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   GENERIC raw completion. It takes an ALREADY-FORMATTED prompt (the AUBS JS model adapter
   applied the chat template) and does the model-agnostic work: tokenize → decode → sample →
   detokenize, stopping at n_predict, end-of-generation, or a stop substring. It knows nothing
   about roles or model families — so a new model is a new JS adapter, never a change here.

   API NOTE — llama.cpp evolves. This targets the model-based tokenize/detokenize API + the
   sampler-chain API. Pin the vendored submodule to the tag named in AUBS_ANDROID_NATIVE_LLAMA_P2.md.
   If you check out a much newer llama.cpp, a few symbols may have been renamed (noted inline):
     llama_load_model_from_file → llama_model_load_from_file
     llama_new_context_with_model → llama_init_from_model
     llama_tokenize/llama_token_to_piece(model,…) → (…, llama_model_get_vocab(model), …)
     llama_kv_cache_clear → llama_kv_self_clear
   Adjust in THIS one file only; nothing else in AUBS depends on the native API.
   ========================================================================== */
#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include "llama.h"

#define LOG_TAG "aubs_llama"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)

struct aubs_ctx {
    llama_model   *model = nullptr;
    llama_context *ctx   = nullptr;
    int            n_threads = 4;
};

static std::string jstr(JNIEnv *env, jstring s) {
    if (!s) return {};
    const char *c = env->GetStringUTFChars(s, nullptr);
    std::string out(c ? c : "");
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_thegoodneighborguard_aubs_LlamaBridge_nativeLoad(
        JNIEnv *env, jclass, jstring modelPath, jint nCtx, jint nThreads, jboolean useGpu) {
    static bool backend_ready = false;
    if (!backend_ready) { llama_backend_init(); backend_ready = true; }

    std::string path = jstr(env, modelPath);

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = useGpu ? 99 : 0;            // CPU-first v1: 0 layers offloaded

    llama_model *model = llama_load_model_from_file(path.c_str(), mparams);
    if (!model) { LOGE("load failed: %s", path.c_str()); return 0; }

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx         = (uint32_t) nCtx;
    cparams.n_threads     = nThreads;
    cparams.n_threads_batch = nThreads;

    llama_context *ctx = llama_new_context_with_model(model, cparams);
    if (!ctx) { LOGE("ctx failed"); llama_free_model(model); return 0; }

    auto *a = new aubs_ctx();
    a->model = model; a->ctx = ctx; a->n_threads = nThreads;
    LOGI("loaded (n_ctx=%d, threads=%d, gpu=%d)", nCtx, nThreads, (int) useGpu);
    return reinterpret_cast<jlong>(a);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_thegoodneighborguard_aubs_LlamaBridge_nativeGenerate(
        JNIEnv *env, jclass, jlong handle, jstring promptJ, jint nPredict, jfloat temperature, jobjectArray stopsJ) {
    auto *a = reinterpret_cast<aubs_ctx *>(handle);
    if (!a || !a->ctx || !a->model) return env->NewStringUTF("");

    std::string prompt = jstr(env, promptJ);

    // stop substrings
    std::vector<std::string> stops;
    if (stopsJ) {
        jsize n = env->GetArrayLength(stopsJ);
        for (jsize i = 0; i < n; i++) {
            auto s = (jstring) env->GetObjectArrayElement(stopsJ, i);
            std::string v = jstr(env, s);
            if (!v.empty()) stops.push_back(v);
            if (s) env->DeleteLocalRef(s);
        }
    }

    // Fresh generation: clear any prior KV state (each turn re-sends the full templated prompt).
    llama_kv_cache_clear(a->ctx);   // newer llama.cpp: llama_kv_self_clear(a->ctx)

    // ── tokenize the prompt (model-based API) ──
    int n_prompt = -llama_tokenize(a->model, prompt.c_str(), (int) prompt.size(), nullptr, 0, true, true);
    std::vector<llama_token> tokens(n_prompt);
    if (llama_tokenize(a->model, prompt.c_str(), (int) prompt.size(), tokens.data(), n_prompt, true, true) < 0) {
        return env->NewStringUTF("");
    }

    // ── evaluate the prompt ──
    llama_batch batch = llama_batch_get_one(tokens.data(), (int) tokens.size());
    if (llama_decode(a->ctx, batch) != 0) { LOGE("decode(prompt) failed"); return env->NewStringUTF(""); }

    // ── sampler chain (built per-call with the requested temperature) ──
    llama_sampler *smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.95f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(temperature <= 0.0f ? 0.7f : temperature));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    std::string out;
    char piece[256];
    for (int i = 0; i < nPredict; i++) {
        llama_token id = llama_sampler_sample(smpl, a->ctx, -1);
        if (llama_token_is_eog(a->model, id)) break;

        int np = llama_token_to_piece(a->model, id, piece, sizeof(piece), 0, true);
        if (np > 0) out.append(piece, np);

        // stop-substring check (the JS adapter also cleans, but stop here saves tokens)
        bool stop = false;
        for (auto &s : stops) { if (!s.empty() && out.size() >= s.size() && out.rfind(s) != std::string::npos) { out.erase(out.rfind(s)); stop = true; break; } }
        if (stop) break;

        llama_sampler_accept(smpl, id);
        llama_token next = id;
        llama_batch nb = llama_batch_get_one(&next, 1);
        if (llama_decode(a->ctx, nb) != 0) break;
    }

    llama_sampler_free(smpl);
    return env->NewStringUTF(out.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_thegoodneighborguard_aubs_LlamaBridge_nativeFree(JNIEnv *, jclass, jlong handle) {
    auto *a = reinterpret_cast<aubs_ctx *>(handle);
    if (!a) return;
    if (a->ctx)   llama_free(a->ctx);
    if (a->model) llama_free_model(a->model);
    delete a;
}
