/* ============================================================================
   AUBS Providers — OpenAI reference adapter (Milestone 8)
   Truth · Safety · We Got Your Back

   The FIRST real external provider. Not because AUBS needs OpenAI — because AUBS must
   prove a real provider can live under the constitution WITHOUT weakening it. This is the
   reference every future provider (Anthropic, Gemini, xAI, Meta, Mistral, DeepSeek, server
   endpoints) copies.

   The provider OBEYS the kernel; the kernel never obeys the provider. The adapter is
   TRANSLATION ONLY: CAC Plan/Intent → one synchronous chat completion → normalized response.
   It cannot bypass GEL, eligibility, the Drift Shield, the ledger, replay, or policy.

   Intentionally narrow: simple text completion, synchronous, NO streaming / tools / images /
   function-calling. The HTTP transport is INJECTABLE so tests exercise success + every
   failure mode (timeout/429/500/auth/malformed) with NO network. Secrets live only in the
   closure — never in the descriptor, capabilities, or any DecisionRecord.
   ========================================================================== */
(function () {
  "use strict";

  // Default OFF. Cloud requires BOTH the provider registered AND this flag enabled.
  var FLAG_OPENAI_DEFAULT = false;

  // Conservative, privacy-first capability profile: OpenAI may carry ONLY public data by
  // default (personal/sensitive never leave the device to cloud unless policy broadens it).
  function openaiCapabilities() {
    return {
      supports_local: false, supports_cloud: true, max_egress: "full",
      data_classes_allowed: ["public"], requires_network: true,
      supports_streaming: false, supports_json: false, supports_tools: false,
      zero_retention_claimed: false, baa_eligible: false, region: "us",
      cost_class: "medium", latency_class: "medium"
    };
  }

  // real transport (used in production). req = { url, method, headers, body } → { status, json(), text() }
  function defaultTransport(req) {
    if (typeof fetch === "undefined") return Promise.reject(new Error("no fetch available"));
    return fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
      .then(function (r) { return { status: r.status, json: function () { return r.json(); }, text: function () { return r.text(); } }; });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; var e = new Error("timeout"); e.__timeout = true; reject(e); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
                   function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  var _ctr = 0;
  function localRequestId() {
    try { if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.randomUUID) return "oair_" + globalThis.crypto.randomUUID(); } catch (e) {}
    _ctr++; return "oair_" + _ctr;   // LOCAL correlation id — never from the provider, never a secret
  }

  // Build a Provider-Contract adapter (M5). config:
  //   { apiKey, model="gpt-5", transport=defaultTransport, timeoutMs=30000, baseURL, enabled }
  function makeOpenAIAdapter(config) {
    config = config || {};
    var apiKey = config.apiKey || null;                 // held ONLY in this closure
    var model = config.model || "gpt-5";
    var transport = config.transport || defaultTransport;
    var timeoutMs = config.timeoutMs || 30000;
    var baseURL = config.baseURL || "https://api.openai.com/v1";

    function execute(plan, ctx) {
      var userText = (ctx && ctx.intent && typeof ctx.intent.user_text === "string") ? ctx.intent.user_text : "";
      var requestId = localRequestId();
      if (!apiKey) return Promise.resolve({ ok: false, failure_type: "internal_error", message: "OpenAI adapter: no API key configured", recoverable: false, metadata: { request_id: requestId } });

      // translation only — prompt-only payload, NO memory, NO tools (M8 scope)
      var body = JSON.stringify({ model: model, messages: [{ role: "user", content: userText }], temperature: 0.7, max_tokens: 256 });
      var headers = { "content-type": "application/json", "authorization": "Bearer " + apiKey };   // header is NEVER recorded

      return withTimeout(Promise.resolve().then(function () { return transport({ url: baseURL + "/chat/completions", method: "POST", headers: headers, body: body }); }), timeoutMs)
        .then(function (resp) {
          var status = resp && resp.status;
          if (status === 429) return { ok: false, failure_type: "model_error", message: "OpenAI rate limited (429)", recoverable: true, metadata: { request_id: requestId, http_status: 429 } };
          if (typeof status === "number" && status >= 500) return { ok: false, failure_type: "model_error", message: "OpenAI server error (" + status + ")", recoverable: true, metadata: { request_id: requestId, http_status: status } };
          if (status === 401 || status === 403) return { ok: false, failure_type: "model_error", message: "OpenAI auth failed (" + status + ") — check API key", recoverable: false, metadata: { request_id: requestId, http_status: status } };
          if (typeof status !== "number" || status < 200 || status >= 300) return { ok: false, failure_type: "model_error", message: "OpenAI HTTP " + status, recoverable: true, metadata: { request_id: requestId, http_status: status } };
          return Promise.resolve().then(function () { return resp.json(); }).then(function (data) {
            var ch = data && data.choices && data.choices[0];
            var text = ch && ch.message && ch.message.content;
            if (typeof text !== "string" || !text) return { ok: false, failure_type: "validation_error", message: "OpenAI response missing choices[0].message.content", recoverable: false, metadata: { request_id: requestId, http_status: status } };
            return {
              ok: true, output_text: text, model_id: data.model || model, provider_id: "openai",
              metadata: {
                request_id: requestId, http_status: status, model: data.model || model,
                finish_reason: ch.finish_reason || null,
                usage: data.usage ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens, total_tokens: data.usage.total_tokens } : null
              }
            };
          }).catch(function () { return { ok: false, failure_type: "validation_error", message: "OpenAI returned a non-JSON / malformed body", recoverable: false, metadata: { request_id: requestId, http_status: status } }; });
        })
        .catch(function (e) {
          if (e && e.__timeout) return { ok: false, failure_type: "timeout", message: "OpenAI request timed out after " + timeoutMs + "ms", recoverable: true, metadata: { request_id: requestId } };
          return { ok: false, failure_type: "model_error", message: "OpenAI network error: " + ((e && e.message) ? e.message : String(e)), recoverable: true, metadata: { request_id: requestId } };
        });
    }

    // Offline-safe health: healthy iff credentials are configured (no network probe → deterministic).
    function healthCheck() { return Promise.resolve({ ok: !!apiKey, detail: apiKey ? "credentials present" : "no api key" }); }

    return {
      provider_id: config.provider_id || "openai",
      provider_type: "cloud",
      enabled: config.enabled !== false,
      capabilities: openaiCapabilities(),
      healthCheck: healthCheck,
      execute: execute
    };
  }

  // Opt-in registration: registers ONLY when the flag is enabled AND a key is configured.
  // Flag OFF → the provider is invisible (returns {ok:false, skipped:true}; registry untouched).
  function registerOpenAI(registry, config) {
    config = config || {};
    var flag = config.flagEnabled === true;             // default OFF
    if (!flag) return { ok: false, skipped: true, reason: "FLAG_OPENAI is off" };
    if (!config.apiKey) return { ok: false, skipped: true, reason: "no api key" };
    var adapter = makeOpenAIAdapter(config);
    var r = registry.register(adapter);
    return Object.assign({ adapter: r.ok ? adapter : null }, r);
  }

  var API = {
    FLAG_OPENAI_DEFAULT: FLAG_OPENAI_DEFAULT,
    makeOpenAIAdapter: makeOpenAIAdapter, registerOpenAI: registerOpenAI,
    openaiCapabilities: openaiCapabilities, defaultTransport: defaultTransport
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROVIDER_OPENAI = API;
})();
