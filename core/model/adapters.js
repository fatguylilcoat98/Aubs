/* ============================================================================
   AUBS Model Adapters — model-specific chat templates behind a model-agnostic seam

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   THE ONE MODEL-SPECIFIC PLACE.
   Every GGUF family formats a conversation differently (Qwen uses ChatML, Llama-3 uses
   header ids, Gemma uses turns, Phi uses tag pairs). That formatting — and the stop
   strings + output cleaning that go with it — is the ONLY thing that differs per model.
   It lives here, isolated, so the rest of AUBS (CLASPION, VeriCore, memory, orchestration,
   governance, the constitutional pipeline, the ledger) stays 100% model-agnostic.

   Swapping models later = REGISTER A NEW ADAPTER here (or ship one), NOT a rewrite. The
   native provider resolves an adapter by model_id, formats the prompt, and hands a raw
   string to the generic llama.cpp runner. The runner never knows which model it is.

   An adapter:
     { id, family,
       matches(model_id) -> bool,
       format(messages, opts) -> { prompt: string, stop: string[] },
       clean(text) -> string }        // strip any template artifacts the model emits

   messages: [{ role: "system"|"user"|"assistant", content: string }, ...]

   Environment-agnostic: module.exports (Node) or window.AUBS_MODEL_ADAPTERS.
   ========================================================================== */
(function () {
  "use strict";

  function str(x) { return (x == null) ? "" : String(x); }
  function norm(messages) {
    return (Array.isArray(messages) ? messages : []).map(function (m) {
      return { role: (m && m.role) || "user", content: str(m && m.content) };
    });
  }
  // Strip a trailing/embedded stop token the model sometimes echoes, and trim.
  function stripStops(text, stops) {
    var t = str(text);
    (stops || []).forEach(function (s) { if (s) t = t.split(s).join(""); });
    return t.replace(/\s+$/, "");
  }

  // ── Qwen2.5 — ChatML (the Phase 2 v1 target) ─────────────────────────────────────────
  // <|im_start|>role\n{content}<|im_end|>\n ... <|im_start|>assistant\n
  var qwen = {
    id: "qwen2.5", family: "qwen",
    matches: function (model_id) { return /qwen/i.test(str(model_id)); },
    stop: ["<|im_end|>", "<|endoftext|>"],
    format: function (messages, opts) {
      opts = opts || {};
      var ms = norm(messages), out = "";
      ms.forEach(function (m) { out += "<|im_start|>" + m.role + "\n" + m.content + "<|im_end|>\n"; });
      if (opts.add_generation_prompt !== false) out += "<|im_start|>assistant\n";
      return { prompt: out, stop: this.stop.slice() };
    },
    clean: function (text) { return stripStops(text, this.stop); }
  };

  // ── Llama-3.x — header ids ───────────────────────────────────────────────────────────
  // <|begin_of_text|><|start_header_id|>role<|end_header_id|>\n\n{content}<|eot_id|> ...
  var llama3 = {
    id: "llama-3", family: "llama",
    matches: function (model_id) { return /llama|meta-?llama/i.test(str(model_id)); },
    stop: ["<|eot_id|>", "<|end_of_text|>"],
    format: function (messages, opts) {
      opts = opts || {};
      var ms = norm(messages), out = "<|begin_of_text|>";
      ms.forEach(function (m) { out += "<|start_header_id|>" + m.role + "<|end_header_id|>\n\n" + m.content + "<|eot_id|>"; });
      if (opts.add_generation_prompt !== false) out += "<|start_header_id|>assistant<|end_header_id|>\n\n";
      return { prompt: out, stop: this.stop.slice() };
    },
    clean: function (text) { return stripStops(text, this.stop); }
  };

  // ── Phi-3 — tag pairs ────────────────────────────────────────────────────────────────
  // <|role|>\n{content}<|end|>\n ... <|assistant|>\n
  var phi3 = {
    id: "phi-3", family: "phi",
    matches: function (model_id) { return /phi/i.test(str(model_id)); },
    stop: ["<|end|>", "<|endoftext|>"],
    format: function (messages, opts) {
      opts = opts || {};
      var ms = norm(messages), out = "";
      ms.forEach(function (m) { out += "<|" + m.role + "|>\n" + m.content + "<|end|>\n"; });
      if (opts.add_generation_prompt !== false) out += "<|assistant|>\n";
      return { prompt: out, stop: this.stop.slice() };
    },
    clean: function (text) { return stripStops(text, this.stop); }
  };

  // ── Generic fallback — plain role labels ─────────────────────────────────────────────
  // Never the preferred path, but lets an UNKNOWN GGUF still run (degraded) rather than
  // fail — so a new model works day-one and gets a proper adapter later, no rewrite.
  var generic = {
    id: "generic", family: "generic",
    matches: function () { return true; },     // matches anything → the last-resort default
    stop: ["\nUser:", "\nSystem:", "\nuser:", "\nsystem:"],
    format: function (messages, opts) {
      opts = opts || {};
      var ms = norm(messages), out = "";
      ms.forEach(function (m) {
        var label = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
        out += label + ": " + m.content + "\n";
      });
      if (opts.add_generation_prompt !== false) out += "Assistant:";
      return { prompt: out, stop: this.stop.slice() };
    },
    clean: function (text) { return stripStops(text, this.stop); }
  };

  // ── Registry ─────────────────────────────────────────────────────────────────────────
  // Order matters for resolve(): specific families first, generic LAST as the catch-all.
  var ADAPTERS = [qwen, llama3, phi3, generic];

  function register(adapter) {
    if (!adapter || typeof adapter.format !== "function" || typeof adapter.matches !== "function") {
      return { ok: false, error: "adapter must have matches() and format()" };
    }
    // Insert BEFORE the generic catch-all so a real adapter always wins over the fallback.
    ADAPTERS.splice(ADAPTERS.length - 1, 0, adapter);
    return { ok: true, id: adapter.id };
  }

  // Pick the adapter for a model_id — first specific match, else the generic fallback.
  function resolve(model_id) {
    for (var i = 0; i < ADAPTERS.length; i++) {
      try { if (ADAPTERS[i].matches(model_id)) return ADAPTERS[i]; } catch (e) {}
    }
    return generic;
  }

  // Format a conversation for a model_id → { prompt, stop, adapter_id }. Pure + deterministic.
  function format(model_id, messages, opts) {
    var a = resolve(model_id);
    var f = a.format(messages, opts);
    return { prompt: f.prompt, stop: f.stop, adapter_id: a.id };
  }

  // Clean raw model output for a model_id (strip template artifacts).
  function clean(model_id, text) {
    var a = resolve(model_id);
    return (typeof a.clean === "function") ? a.clean(text) : String(text == null ? "" : text);
  }

  function list() { return ADAPTERS.map(function (a) { return { id: a.id, family: a.family }; }); }

  var API = {
    register: register, resolve: resolve, format: format, clean: clean, list: list,
    // exported for tests / direct use
    adapters: { qwen: qwen, llama3: llama3, phi3: phi3, generic: generic }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MODEL_ADAPTERS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_MODEL_ADAPTERS = API;
})();
