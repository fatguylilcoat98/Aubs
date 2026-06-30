/* ============================================================================
   AUBS MODEL ENDPOINT CONNECTOR — pluggable engines (local & remote)
   Truth · Safety · We Got Your Back

   AUBS is the operating system; models are interchangeable engines. This connector
   lets the runtime talk to ANY OpenAI-compatible model server — a model you
   downloaded and run ON YOUR PHONE (Ollama / llama.cpp-server / LM Studio at
   localhost), or LATER your own AUBS server. Same governed runtime, swappable
   engine. The model never gains authority; it's just where open-ended language
   is generated.

   Honesty: a localhost endpoint is on-device (nothing leaves the phone → the door
   stays locked). A remote endpoint is network egress and must be surfaced as such.
   classify(base) tells the two apart so the Glass Box can be truthful.

   `fetchImpl` is injected so this is fully testable without a network.
   Environment-agnostic: module.exports (Node) or window.AUBS_ENDPOINT.
   ========================================================================== */
(function () {
  "use strict";

  // Common local model servers (OpenAI-compatible). Probed in order during discovery.
  var KNOWN_LOCAL = [
    { name: "Ollama", base: "http://localhost:11434/v1" },
    { name: "LM Studio", base: "http://localhost:1234/v1" },
    { name: "llama.cpp", base: "http://localhost:8080/v1" },
    { name: "Jan", base: "http://localhost:1337/v1" }
  ];

  // fetch with a hard timeout (races a timer; aborts the request) so a hung model server surfaces
  // an honest error instead of spinning forever. Falls back to a plain call if AbortController is absent.
  function fetchT(f, url, init, ms) {
    if (!ms) return Promise.resolve(f(url, init));
    var ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var init2 = ac ? Object.assign({}, init, { signal: ac.signal }) : init;
    var to;
    var timeout = new Promise(function (_, rej) { to = setTimeout(function () { try { if (ac) ac.abort(); } catch (e) {} rej(new Error("timed out after " + Math.round(ms / 1000) + "s")); }, ms); });
    return Promise.race([Promise.resolve(f(url, init2)), timeout]).then(
      function (v) { clearTimeout(to); return v; },
      function (e) { clearTimeout(to); throw e; }
    );
  }

  function isLocal(base) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(String(base || ""));
  }
  // "on-device" (localhost) vs "network" (anything else) — drives the honest Glass Box line.
  function classify(base) { return isLocal(base) ? "on-device" : "network"; }
  function trimBase(base) { return String(base || "").replace(/\/+$/, ""); }

  // List models at an OpenAI-compatible endpoint: GET {base}/models -> [{id}, ...].
  function listModels(base, fetchImpl, opts) {
    opts = opts || {};
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("no fetch"));
    return fetchT(f, trimBase(base) + "/models", { method: "GET", headers: opts.headers || {} }, opts.timeoutMs || 10000)
      .then(function (r) { if (!r.ok) throw new Error("models " + r.status); return r.json(); })
      .then(function (j) {
        var arr = (j && j.data) || (j && j.models) || [];
        return arr.map(function (m) { return (m && (m.id || m.name)) || String(m); }).filter(Boolean);
      });
  }

  // One chat completion (non-streaming) -> { text, finish, model }. OpenAI-compatible.
  function chat(base, model, messages, opts, fetchImpl) {
    opts = opts || {};
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("no fetch"));
    var body = { model: model, messages: messages, stream: false,
      temperature: (opts.temperature != null ? opts.temperature : 0.7),
      max_tokens: (opts.max_tokens != null ? opts.max_tokens : 256) };
    var headers = { "Content-Type": "application/json" };
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    return fetchT(f, trimBase(base) + "/chat/completions", { method: "POST", headers: headers, body: JSON.stringify(body) }, opts.timeoutMs || 180000)
      .then(function (r) { if (!r.ok) throw new Error("chat " + r.status); return r.json(); })
      .then(function (j) {
        var ch = j && j.choices && j.choices[0];
        var text = (ch && ch.message && ch.message.content) || (ch && ch.text) || "";
        // Some servers return content as an array of parts ([{type:"text",text:"…"}]) — join the text parts.
        if (Array.isArray(text)) text = text.map(function (p) { return (p && (p.text || p.content)) || ""; }).join("");
        return { text: String(text || ""), finish: (ch && ch.finish_reason) || "stop", model: (j && j.model) || model };
      });
  }

  // Probe candidates (default: the known local servers) and return the reachable ones with their
  // model lists. Each probe is independent and best-effort (a failure → that one is just absent).
  function discover(candidates, fetchImpl, opts) {
    opts = opts || {};
    var list = candidates || KNOWN_LOCAL;
    return Promise.all(list.map(function (c) {
      return listModels(c.base, fetchImpl, opts)
        .then(function (models) { return { name: c.name, base: c.base, kind: classify(c.base), reachable: true, models: models }; })
        .catch(function (e) { return { name: c.name, base: c.base, kind: classify(c.base), reachable: false, error: String(e && e.message || e) }; });
    })).then(function (all) { return all; });
  }

  var API = { KNOWN_LOCAL: KNOWN_LOCAL, isLocal: isLocal, classify: classify, listModels: listModels, chat: chat, discover: discover };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_ENDPOINT = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_ENDPOINT = API;
})();
