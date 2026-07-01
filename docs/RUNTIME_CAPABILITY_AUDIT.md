<!-- Architectural audit. Evidence-backed, read-only — NO code changed, NO implementation.
     Answers why AnythingLLM runs Qwen3-1.7B / Llama-3.2-3B on the same phone where AUBS is
     limited to ~0.5B-class models. All file:line citations are against this repo at the time
     of writing (main @ post-Safety-Path-Hardening). -->

# AUBS — Runtime Capability Audit

**Question.** On the same phone, AnythingLLM runs Qwen3‑1.7B and Llama‑3.2‑3B GGUF models, but AUBS struggles with smaller browser models. Why — and what's the right path forward?

## Key conclusion (read this first)

> **AUBS is not limited by the phone hardware alone. AUBS is limited by the browser / WebLLM runtime and the mobile WebGPU buffer‑binding limits.**
>
> **AnythingLLM can run Qwen3‑1.7B / Llama‑3.2‑3B because it uses native GGUF / llama.cpp‑style inference** — running on the CPU/native GPU with access to full device RAM, with no per‑binding cap.
>
> **AUBS currently uses WebLLM / MLC‑compiled artifacts and cannot load GGUF directly** in the browser.

The same phone has the RAM and compute to run 1.7B–3B models (AnythingLLM proves it). AUBS can't reach them today because of **two stacked, partly runtime‑imposed walls**: (1) the model **format/packaging** (WebLLM loads only MLC‑compiled artifacts, never GGUF), and (2) the browser's **WebGPU single‑binding memory cap** (~128MB on Adreno), which large‑vocabulary models overflow regardless of total model size. Neither wall is "the phone is too weak."

---

## 1. What inference runtime does AUBS use?

**WebLLM** (MLC‑LLM's in‑browser runtime), `@mlc-ai/web-llm@0.2.84`, loaded from the `esm.run` CDN, running entirely on the device **WebGPU** backend. Fully client‑side; no server inference in the live path.

- `aubs-app.html:411` — `import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.84";`
- `aubs-app.html:837` — `engine = await webllm.CreateMLCEngine(chosenModel, {…})`
- Inference: `engine.chat.completions.create({ messages, stream:false, temperature:0.7, max_tokens:256 })`
- The only network‑capable provider is the isolated OpenAI reference adapter behind `FLAG_OPENAI` (default OFF) — not used by the on‑device loop.

## 2. What exact model format does it require?

**MLC‑compiled artifacts**, not raw model files. Every model id is `…-q4f16_1-MLC` / `…-q4f32_1-MLC`.

- `aubs-app.html:770‑773` — e.g. `"Qwen2.5-0.5B-Instruct-q4f16_1-MLC"`, `"Llama-3.2-3B-Instruct-q4f16_1-MLC"`.

An MLC model = a **model‑library `.wasm`** (TVM‑compiled WebGPU kernels) + a **tokenizer** + **sharded quantized weight params** (`q4f16_1` = 4‑bit weights / f16 activations). This is a fundamentally different artifact from a single GGUF file.

## 3. Can AUBS load GGUF directly in the browser? → No.

WebLLM has **no GGUF loader**. GGUF is llama.cpp's container; WebLLM consumes only models **pre‑compiled through Apache TVM Unity into the MLC format**. No code path in AUBS — or in WebLLM 0.2.84 — parses GGUF. To run a model in AUBS you must MLC‑compile and host it; you cannot point it at a `.gguf`.

## 4. What models does the current WebLLM path support?

Only ids in `webllm.prebuiltAppConfig.model_list` (`aubs-app.html:779`) — the MLC prebuilt zoo (Qwen2.5, SmolLM2, Llama‑3.2, Qwen2.5‑1.5B, Phi‑3, …) in q4f16/q4f32. AUBS then **restricts further by device**:

- `aubs-app.html:769‑773` — Fast tier = 0.5B class; Smart tier lists 1.5B/1.7B/3B.
- `aubs-app.html:808‑820` — on a phone GPU, `resolve()` forces `PHONE_SAFE` (**0.5B‑class only**: `Qwen2.5-0.5B`, `SmolLM2-360M`) *regardless of tier* ("Smart can't crash you"). Effective on‑phone catalog ≈ 0.5B.

## 5. Browser memory / WebGPU limitations (the core constraint)

- **WebGPU is mandatory** — no `navigator.gpu` → app disables itself (`aubs-app.html:823‑827`).
- **The single‑binding memory cap is the wall.** `detectF16()` reads `maxStorageBufferBindingSize` (`:785`); `bindingTight()` flags GPUs `≤160MB` (`:792‑794`). Adreno (Snapdragon S24) ≈ **128MB**.
- **Large‑vocab models overflow that cap.** Explicit in code (`:775‑778`, `:805‑808`): "Large‑vocab models (Llama‑3.2 128k, Qwen2.5 152k) overflow it and trigger the mapAsync buffer fault." The **embedding / lm_head buffer scales with vocab size**; at 128k–152k tokens it exceeds a single 128MB WebGPU binding and crashes — even when the whole model is modest.
- **f16 gating** (`:784`); **no `context_window_size` override** because one "deterministically faulted the first inference on this Adreno GPU (KV‑cache mismatch)" (`:801‑804`).
- General browser ceilings on top: ~4GB wasm heap; GPU readback via `mapAsync`; one‑decode‑per‑readback workaround (`:935‑937`).

## 6. Where is the bottleneck?

| Factor | Verdict | Evidence |
|---|---|---|
| **Model packaging / format** | 🔴 Primary | GGUF can't load; must be MLC‑compiled (`:770‑773`; no GGUF path) |
| **WebGPU memory (single‑binding cap)** | 🔴 Primary | `≤160MB` tight cap; large‑vocab embedding/lm_head overflow → mapAsync fault (`:775‑778`, `:792‑794`, `:805‑808`) |
| **Quantization** | 🟠 Secondary | limited to prebuilt q4f16/q4f32 (`:770‑773`) |
| **WebGPU support** | 🟠 Conditional | required; absent → no AI (`:823‑827`) |
| **Context length** | 🟡 Minor | pragmatic caps to avoid KV faults (`:801‑804`, `max_tokens:256`) |
| **App code** | 🟢 Not the problem | selection/recovery logic is sound; it works *around* the limits |
| **Prompt format** | 🟢 Not the problem | chat template handled by WebLLM; unrelated to load failures |

**Sharp conclusion:** two stacked walls — *format/packaging* and the *mobile WebGPU single‑binding cap*. The second is the harder one and is **partly format‑independent**: even if you MLC‑compiled Llama‑3.2‑3B or Qwen3‑1.7B, their large‑vocab embedding buffers would still fault on the Adreno 128MB binding limit. AUBS's own code concedes this by pinning the phone to 0.5B‑class. It is **not** "the phone is too weak."

## 7. AUBS vs AnythingLLM — why the same phone runs 1.7B/3B there

| | **AUBS** (browser) | **AnythingLLM** (native) |
|---|---|---|
| Runtime | WebLLM / MLC on **WebGPU** | **llama.cpp** (GGUF) native |
| Model format | MLC‑compiled (.wasm + shards) | **GGUF**, mmap'd from storage |
| Compute | WebGPU compute shaders | CPU (ARM NEON) + optional Vulkan/GPU |
| Memory model | **per‑binding WebGPU cap (~128MB)** + ~4GB wasm heap | **full device RAM** (8–12GB on an S24), mmap, no per‑binding cap |
| Vocab / embedding | large‑vocab buffer overflows a single binding | embedding sits in normal RAM — no binding limit |
| Install | zero‑install, runs in a tab | native app with native libs |

AnythingLLM isn't "better at models" — it runs a **native llama.cpp runtime that bypasses the browser sandbox**: GGUF mmap'd into ordinary RAM, executed on CPU/native‑GPU, so the 128MB WebGPU per‑binding cap that blocks AUBS simply doesn't apply. That is the whole difference. AUBS's trade is reach and zero‑install; the cost is the browser's WebGPU memory model.

## 8. Recommended direction

The architecture already has the seam for this: AUBS's **M5 Provider Framework** (`core/providers/*`) abstracts "a thing that runs a model" behind a governed, drift‑shielded `provider.execute(plan, ctx)` contract, and `adapterToProvider()` wraps any `{id, run}` adapter. **WebLLM is just one provider — a different runtime is a new provider, not a rewrite.** Governance, the ledger, the safety gate, and the constitutional pipeline are unchanged.

1. **Keep WebLLM as the zero‑install browser fallback.** It is the reach play — runs in any WebGPU browser with no install. It stays.
2. **Improve WebLLM model selection using small‑vocab models.** The code already knows the trick (`SMALL_VOCAB` / `PHONE_SAFE`, `:775‑778`, `:808`). Small‑vocab models (SmolLM2‑360M/1.7B, Phi‑3‑mini) fit the binding cap and can beat 0.5B without faulting — better on‑phone quality *without leaving the browser*. Low risk, no new architecture.
3. **Add a native GGUF runtime later as a governed provider.** An Android (WebView/Capacitor/TWA) wrapper hosting a **native GGUF runtime** (llama.cpp or MLC‑native), exposed to the page and registered as a `local-native` provider via the existing M5 framework. This unlocks 1.7B/3B GGUF (AnythingLLM parity) **with the entire constitutional/safety/ledger stack intact** — only the provider changes. Highest‑leverage move.
4. **Treat the native runtime as another AUBS provider, not a rewrite.** It plugs into the same drift shield, eligibility, and governance the browser provider uses. The governed pipeline does not care which provider executed the turn.
5. **Server / private inference remains valid for organizations, but is not the answer to local phone model limits.** Cloud/server contradicts AUBS's "nothing leaves the device" posture for the personal case; the OpenAI adapter already exists behind a default‑OFF flag for explicit opt‑in. Use it for org deployments that *choose* it — never as the default fix for an on‑device capability gap.

**Bottom line.** Don't fight the browser's memory model to force 3B through WebGPU — that wall is real and partly format‑independent. Keep WebLLM as the zero‑install default (tuned toward small‑vocab models), and add a **native GGUF runtime as a new M5 provider** behind the unchanged governance layer. That hybrid reaches AnythingLLM‑class models without sacrificing the constitutional foundation.

---

*Audit only — no code changed, no implementation. Truth · Safety · We Got Your Back.*
