/* ============================================================================
   AUBS Kernel — chat bridge (Milestone 4): wrap the REAL local chat in the kernel
   Truth · Safety · We Got Your Back

   This is the bridge between the living app's offline model loop and the kernel.
   It is the FIRST time the constitutional runtime touches real chat — so it is kept
   small, injected, and testable away from the browser:

     - makeRealLocalAdapter(generate, model_id) builds an M3 adapter whose run()
       calls an injected `generate` function. In the APP, `generate` runs the existing
       WebLLM completion (engine.chat.completions.create) with the existing recovery.
       In TESTS, `generate` is a deterministic fake (ok / empty / throw).
     - runKernelChat({...}) drives executeIntent: Intent → Plan → GEL → (allow? the
       real adapter : block) → Result/Failure → DecisionRecord → Level 1 explanation.

   It NEVER loads a model and NEVER creates a second engine. The app injects the one
   engine it already has. With the kernel flag OFF, none of this runs.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var K = isNode ? require("./index") : (typeof window !== "undefined" ? window.AUBS_KERNEL : null);

  // Build a real local adapter (M3 interface) from an injected completion function.
  // generate(ctx) → Promise<{ text, finish }>  (may throw → kernel records a Failure).
  function makeRealLocalAdapter(generate, model_id) {
    return {
      id: "local-webllm",
      run: function (plan, ctx) {
        return Promise.resolve()
          .then(function () { return generate(ctx); })
          .then(function (out) {
            var text = (out && typeof out.text === "string") ? out.text : "";
            if (!text) {
              return { ok: false, failure_type: "model_error", message: "the on-device model returned no text", recoverable: true, finish: out && out.finish };
            }
            return { ok: true, output_text: text, model_id: model_id || "local-model", provider_id: "local", finish: out && out.finish };
          })
          .catch(function (e) {
            return { ok: false, failure_type: "model_error", message: (e && e.message) ? e.message : String(e), recoverable: true };
          });
      }
    };
  }

  // Run one chat turn through the kernel. Returns the full executeIntent outcome plus a
  // UI-friendly view. opts:
  //   text        — the user message (already past the safety gate / router)
  //   generate    — async (ctx)=>{text,finish}; the real WebLLM call (or a test fake)
  //   model_id    — id stamped into the CAC Result
  //   bundle      — GEL policy bundle (omit → kernel uses the default-allow-local bundle)
  //   ledgerStore — append-only store (the app passes its IndexedDB ledger)
  //   signingKey  — Ed25519 private key for the DecisionRecord (may be null → unsigned)
  function runKernelChat(opts) {
    opts = opts || {};
    if (!K || !K.executeIntent) return Promise.reject(new Error("kernel not available"));
    var adapter = makeRealLocalAdapter(opts.generate, opts.model_id);
    return K.executeIntent(opts.text, { local: adapter }, {
      bundle: opts.bundle,
      ledgerStore: opts.ledgerStore || null,
      signingKey: opts.signingKey || null
    }).then(function (res) {
      res.ui = uiView(res);
      return res;
    });
  }

  // Derive exactly what the chat UI needs — text to show, whether it was blocked, and the
  // honest Level 1 explanation. NEVER invents text; pulls from recorded kernel state.
  // A CONTENT-QUALITY failure (the model ran but returned no text) gets an honest fallback
  // marked ui.honest_fallback — a normal assistant reply, not an error state. The generic
  // "Something went wrong on-device" line remains ONLY for true technical failures.
  function uiView(res) {
    var blocked = res.governance && res.governance.decision !== "allow";
    var ok = !!(res.result && res.result.status === "ok");
    var emptyCompletion = !ok && !blocked && /returned no text/i.test(String((res.failure && res.failure.message) || ""));
    var text;
    if (ok) text = res.result.output_text || "";
    else if (blocked) text = blockedMessage(res.governance);
    else if (emptyCompletion) text = "I don't have verified information about that, so I won't guess.";
    else text = errorMessage(res.failure);
    var ui = {
      text: text,
      blocked: blocked,
      ok: ok,
      explanation: res.explanation,                 // "Answered locally. Nothing left this device."
      decision: res.governance ? res.governance.decision : null,
      execution_type: res.record ? res.record.execution_type : (ok ? "model" : "blocked"),
      record_seq: res.record ? res.record.seq : null,
      record_id: res.record ? res.record.id : null
    };
    // Added ONLY on a content-quality failure — the ui shape is unchanged on every other path.
    if (emptyCompletion) ui.honest_fallback = true;
    return ui;
  }

  function blockedMessage(g) {
    var why = (g && g.reason) ? g.reason : "a policy";
    if (g && g.decision === "require_reauth") return "I held that back — it needs you to re-authenticate first (" + why + ").";
    return "I can't run that under your current policy (" + why + ").";
  }
  function errorMessage(f) {
    var m = (f && f.message) ? f.message : "the on-device engine could not complete the answer";
    return "Something went wrong on-device: " + m;
  }

  var API = { makeRealLocalAdapter: makeRealLocalAdapter, runKernelChat: runKernelChat, uiView: uiView };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_CHAT = API;
})();
