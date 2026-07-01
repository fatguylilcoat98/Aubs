/* AUBS Model Adapters — model-specific chat templates behind a model-agnostic seam.

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   Proves the ONE model-specific place is correct and swappable:
     - Qwen2.5 renders ChatML; Llama-3 renders header ids; Phi-3 renders tag pairs
     - resolve() picks the right adapter by model_id; unknown → generic fallback
     - the SAME messages produce DIFFERENT prompts per model (model-specific), while the
       registry API is identical (model-agnostic) — a new model is a new adapter, not a rewrite
     - register() adds an adapter that wins over generic
     - clean() strips template artifacts the model echoes
   Usage: node tests/run-model-adapters.cjs   (exit 0 = all pass) */
"use strict";
const A = require("../core/model/adapters.js");

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const MSGS = [
  { role: "system", content: "You are AUBS." },
  { role: "user", content: "Hi there." },
  { role: "assistant", content: "Hello!" },
  { role: "user", content: "What time is it?" }
];

// ── resolve(): the right family by model_id, generic as the catch-all ──────────────────
ok("resolve qwen*.gguf → qwen2.5 adapter", A.resolve("qwen2.5-3b-instruct-q4_k_m.gguf").id === "qwen2.5");
ok("resolve llama* → llama-3 adapter", A.resolve("Llama-3.2-3B-Instruct-Q4_K_M.gguf").id === "llama-3");
ok("resolve phi* → phi-3 adapter", A.resolve("phi-3-mini-q4.gguf").id === "phi-3");
ok("resolve unknown → generic fallback", A.resolve("some-brand-new-model.gguf").id === "generic");
ok("resolve null → generic (never throws)", A.resolve(null).id === "generic");

// ── Qwen2.5 = ChatML ───────────────────────────────────────────────────────────────────
{
  const r = A.format("qwen2.5-3b-instruct-q4_k_m.gguf", MSGS);
  ok("qwen: ChatML markers present", /<\|im_start\|>system\nYou are AUBS\.<\|im_end\|>/.test(r.prompt) && /<\|im_start\|>user\nWhat time is it\?<\|im_end\|>/.test(r.prompt));
  ok("qwen: ends with an assistant generation opener", /<\|im_start\|>assistant\n$/.test(r.prompt));
  ok("qwen: stop includes <|im_end|>", r.stop.indexOf("<|im_end|>") !== -1);
  ok("qwen: adapter_id reported", r.adapter_id === "qwen2.5");
}

// ── Llama-3 = header ids ─────────────────────────────────────────────────────────────────
{
  const r = A.format("Llama-3.2-3B-Instruct-Q4_K_M.gguf", MSGS);
  ok("llama: begins with <|begin_of_text|>", r.prompt.indexOf("<|begin_of_text|>") === 0);
  ok("llama: header id blocks present", /<\|start_header_id\|>user<\|end_header_id\|>\n\nWhat time is it\?<\|eot_id\|>/.test(r.prompt));
  ok("llama: ends opening the assistant header", /<\|start_header_id\|>assistant<\|end_header_id\|>\n\n$/.test(r.prompt));
  ok("llama: stop includes <|eot_id|>", r.stop.indexOf("<|eot_id|>") !== -1);
}

// ── Phi-3 = tag pairs ────────────────────────────────────────────────────────────────────
{
  const r = A.format("phi-3-mini-4k-instruct-q4.gguf", MSGS);
  ok("phi: tag-pair markers present", /<\|system\|>\nYou are AUBS\.<\|end\|>/.test(r.prompt) && /<\|user\|>\nWhat time is it\?<\|end\|>/.test(r.prompt));
  ok("phi: ends with <|assistant|> opener", /<\|assistant\|>\n$/.test(r.prompt));
  ok("phi: stop includes <|end|>", r.stop.indexOf("<|end|>") !== -1);
}

// ── model-specific but model-agnostic: same messages, different prompts, identical API ──
{
  const q = A.format("qwen2.5-x.gguf", MSGS).prompt;
  const l = A.format("llama-3-x.gguf", MSGS).prompt;
  const p = A.format("phi-3-x.gguf", MSGS).prompt;
  ok("same conversation → three DIFFERENT model-specific prompts", q !== l && l !== p && q !== p);
  ok("every prompt carries the actual conversation content (nothing dropped)", [q, l, p].every(s => s.indexOf("What time is it?") !== -1 && s.indexOf("Hello!") !== -1));
}

// ── register(): a new adapter wins over generic without touching anything else ──────────
{
  const gemma = {
    id: "gemma", family: "gemma",
    matches: (m) => /gemma/i.test(String(m)),
    format: (messages) => {
      let out = "";
      (messages || []).forEach(m => { const role = m.role === "assistant" ? "model" : "user"; out += "<start_of_turn>" + role + "\n" + m.content + "<end_of_turn>\n"; });
      return { prompt: out + "<start_of_turn>model\n", stop: ["<end_of_turn>"] };
    },
    clean: (t) => String(t)
  };
  const reg = A.register(gemma);
  ok("register() accepts a well-formed adapter", reg.ok === true && reg.id === "gemma");
  ok("newly registered adapter now resolves (swap = new adapter, no rewrite)", A.resolve("gemma-2b-it.gguf").id === "gemma");
  ok("generic is still the catch-all after registration", A.resolve("totally-unknown.gguf").id === "generic");
  ok("register() rejects a malformed adapter", A.register({ id: "bad" }).ok === false);
}

// ── clean(): strips template artifacts the model echoes ────────────────────────────────
{
  ok("qwen clean strips a trailing <|im_end|>", A.clean("qwen-x.gguf", "The answer.<|im_end|>") === "The answer.");
  ok("llama clean strips <|eot_id|>", A.clean("llama-3-x.gguf", "Done.<|eot_id|>") === "Done.");
  ok("generic clean trims trailing whitespace", A.clean("unknown.gguf", "hi   ") === "hi");
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Model adapters: Qwen/Llama/Phi templates correct, resolve-by-id + generic fallback, register() swap, clean() — the ONE model-specific place; the pipeline stays model-agnostic.");
process.exit(0);
