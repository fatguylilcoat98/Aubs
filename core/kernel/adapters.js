/* ============================================================================
   AUBS Kernel — local adapter interface + test adapters (Milestone 3)
   Truth · Safety · We Got Your Back

   An adapter executes a model_call step locally and returns a normalized outcome:
     { ok:true,  output_text, model_id, provider_id, grounding? }
     { ok:false, failure_type, message, recoverable }
   (it may also throw — the kernel converts a throw into a CAC Failure).

   The REAL local adapter (wrapping the in-browser WebLLM loop) is added when the
   kernel is wired into the app behind a flag — NOT in this milestone. These are the
   deterministic fakes the kernel tests run against.
   ========================================================================== */
(function () {
  "use strict";

  var localOkAdapter = {
    id: "local-ok",
    run: function (plan, ctx) {
      var text = (ctx && ctx.intent && ctx.intent.user_text) ? ("Local answer to: " + ctx.intent.user_text) : "(local answer)";
      return Promise.resolve({ ok: true, output_text: text, model_id: "Qwen2.5-0.5B-Instruct", provider_id: "local" });
    }
  };

  var localFailAdapter = {
    id: "local-fail",
    run: function () { return Promise.resolve({ ok: false, failure_type: "model_error", message: "local model produced no output", recoverable: true }); }
  };

  var localThrowAdapter = {
    id: "local-throw",
    run: function () { return Promise.reject(new Error("on-device engine crashed")); }
  };

  var localSlowAdapter = {
    id: "local-slow",
    run: function () { return new Promise(function (res) { setTimeout(function () { res({ ok: true, output_text: "(slow local answer)", model_id: "Qwen2.5-0.5B-Instruct", provider_id: "local" }); }, 5); }); }
  };

  // counts invocations — used to prove a DENIED plan never calls the adapter
  function makeSpyAdapter() {
    var n = 0;
    return { id: "spy", run: function () { n++; return Promise.resolve({ ok: true, output_text: "spy ok", model_id: "m", provider_id: "local" }); }, calls: function () { return n; } };
  }

  var API = { localOkAdapter: localOkAdapter, localFailAdapter: localFailAdapter, localThrowAdapter: localThrowAdapter, localSlowAdapter: localSlowAdapter, makeSpyAdapter: makeSpyAdapter };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_ADAPTERS = API;
})();
