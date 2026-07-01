/* AUBS native llama.cpp path (Phase 2) — template selection + provenance, end to end.

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   Simulates the GENERIC native runtime (a raw prompt-in/text-out bridge, like the llama.cpp
   plugin) — NO APK, NO native code, NO network. Proves the model interface is abstracted:
     - the native model_id (the loaded GGUF) selects the model-specific chat template
     - a Qwen GGUF → the runtime receives a ChatML prompt; a Llama GGUF → header-id prompt
       (same pipeline, same conversation — only the adapter differs)
     - the governed max_tokens (Execution Contract) reaches the runtime
     - provenance/ledger records model_id = the GGUF filename (not the WebLLM id)
     - the raw completion flows through the full governed pipeline to the answer
   Usage: node tests/run-native-llama.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const T = "2026-07-01T00:00:00Z";
const webllmGen = () => Promise.resolve({ text: "webllm floor", finish: "stop" });

// A generic native runtime: it applies NO template — it just echoes what prompt it was handed,
// exactly like a raw llama.cpp completion would tokenize→generate→detokenize. `gguf` sets the
// advertised model_id so the AUBS adapter layer selects the template.
function rawRuntime(gguf, capture) {
  return {
    available: function () { return true; },
    health: function () { return Promise.resolve({ ok: true }); },
    info: function () { return { runtime: "llama.cpp", model_id: gguf }; },
    generate: function (req) { if (capture) capture(req); return Promise.resolve({ text: "Native says hi.", finish: "stop" }); }
  };
}

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── Qwen GGUF → ChatML prompt reaches the runtime; provenance records the GGUF ──────────
  {
    let req = null;
    const store = L.createMemoryStore();
    const res = await CHAT.runConstitutionalChat({
      text: "hello", generate: webllmGen, model_id: "Qwen2.5-0.5B-webllm",
      nativeBridge: rawRuntime("qwen2.5-3b-instruct-q4_k_m.gguf", (r) => req = r),
      messages: [{ role: "user", content: "hello" }],
      ledgerStore: store, signingKey: key.privateKey, created_at: T
    });
    ok("Qwen GGUF selects ChatML: runtime receives <|im_start|> markers", req && /<\|im_start\|>/.test(req.prompt) && /<\|im_start\|>assistant\n$/.test(req.prompt));
    ok("runtime receives the governed contract + a numeric max_tokens", req && req.contract && typeof req.max_tokens === "number");
    ok("selected provider is local-native", res.selected_provider === "local-native");
    ok("provenance model_id = the loaded GGUF (not the WebLLM id)", res.record && res.record.model_id === "qwen2.5-3b-instruct-q4_k_m.gguf");
    ok("ledger records provider = local-native", res.record && res.record.provider === "local-native");
    ok("raw native completion flows through governance to the answer", res.status === "ok" && res.output_text === "Native says hi." && res.ui.ok === true);
  }

  // ── Same pipeline, Llama GGUF → header-id prompt (model-agnostic swap, only the adapter) ─
  {
    let req = null;
    const store = L.createMemoryStore();
    const res = await CHAT.runConstitutionalChat({
      text: "hello", generate: webllmGen,
      nativeBridge: rawRuntime("Llama-3.2-3B-Instruct-Q4_K_M.gguf", (r) => req = r),
      messages: [{ role: "user", content: "hello" }],
      ledgerStore: store, signingKey: key.privateKey, created_at: T
    });
    ok("Llama GGUF selects the header-id template (no ChatML)", req && req.prompt.indexOf("<|begin_of_text|>") === 0 && /<\|start_header_id\|>assistant<\|end_header_id\|>/.test(req.prompt) && !/<\|im_start\|>/.test(req.prompt));
    ok("swapping the GGUF changed ONLY the template; provenance follows the model", res.record && res.record.model_id === "Llama-3.2-3B-Instruct-Q4_K_M.gguf" && res.selected_provider === "local-native");
  }

  // ── Governed max_tokens: the Execution Contract ceiling reaches the runtime ─────────────
  {
    let req = null;
    const store = L.createMemoryStore();
    await CHAT.runConstitutionalChat({
      text: "hello", generate: webllmGen,
      nativeBridge: rawRuntime("qwen2.5-3b-instruct-q4_k_m.gguf", (r) => req = r),
      messages: [{ role: "user", content: "hello" }],
      ledgerStore: store, signingKey: key.privateKey, created_at: T
    });
    ok("max_tokens equals the contract's output_constraints.max_tokens", req && req.contract && req.max_tokens === req.contract.output_constraints.max_tokens);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Native llama path: GGUF model_id → model-specific template, governed max_tokens, provenance = GGUF, raw completion governed — simulated, no APK/native/network.");
  process.exit(0);
})().catch(e => { console.error("native-llama test crashed:", e); process.exit(1); });
