/* AUBS Model Endpoint Connector — pluggable engines (local & remote), OpenAI-compatible.
   Proves the connector lists models, runs a chat completion, classifies localhost vs network
   (for the honest Glass Box line), and discovers reachable servers — all with an INJECTED fetch,
   no real network. Usage: node tests/run-endpoint.cjs */
"use strict";
const E = require("../core/providers/endpoint.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const bad = (code) => ({ ok: false, status: code, json: () => Promise.resolve({}) });

// ── classify: localhost is on-device, anything else is network (drives the honest Glass Box) ──
t("classify localhost → on-device", E.classify("http://localhost:11434/v1") === "on-device");
t("classify 127.0.0.1 → on-device", E.classify("http://127.0.0.1:1234/v1") === "on-device");
t("classify remote → network", E.classify("https://my-aubs-server.com/v1") === "network");
t("isLocal true only for loopback", E.isLocal("http://localhost:8080") && !E.isLocal("http://192.168.1.5:11434"));

(async () => {
  // ── listModels: OpenAI {data:[{id}]} and Ollama-ish {models:[{name}]} ──────────────────────
  {
    const f = () => Promise.resolve(ok({ data: [{ id: "llama3.2:3b" }, { id: "phi3.5" }] }));
    const m = await E.listModels("http://localhost:11434/v1", f);
    t("listModels parses OpenAI {data:[{id}]}", m.length === 2 && m[0] === "llama3.2:3b");
    const f2 = () => Promise.resolve(ok({ models: [{ name: "qwen2.5:3b" }] }));
    t("listModels parses {models:[{name}]} too", (await E.listModels("x", f2))[0] === "qwen2.5:3b");
    let threw = false; try { await E.listModels("x", () => Promise.resolve(bad(404))); } catch (e) { threw = true; }
    t("listModels rejects on non-OK status", threw);
  }

  // ── chat: OpenAI request shape + response parse, injected fetch (no network) ────────────────
  {
    let seen = null;
    const f = (url, init) => { seen = { url, body: JSON.parse(init.body) }; return Promise.resolve(ok({ model: "llama3.2:3b", choices: [{ message: { content: "Hello from a local model." }, finish_reason: "stop" }] })); };
    const r = await E.chat("http://localhost:11434/v1", "llama3.2:3b", [{ role: "user", content: "hi" }], { max_tokens: 64 }, f);
    t("chat hits {base}/chat/completions", /\/chat\/completions$/.test(seen.url));
    t("chat sends OpenAI body (model + messages + stream:false)", seen.body.model === "llama3.2:3b" && Array.isArray(seen.body.messages) && seen.body.stream === false);
    t("chat parses choices[0].message.content", r.text === "Hello from a local model." && r.finish === "stop");
    // AUDIT REGRESSION: array-shaped content ([{type:'text',text:'…'}]) must be joined, not "[object Object]"
    const fa = () => Promise.resolve(ok({ choices: [{ message: { content: [{ type: "text", text: "part A " }, { type: "text", text: "part B" }] }, finish_reason: "stop" }] }));
    const ra = await E.chat("http://localhost:11434/v1", "m", [{ role: "user", content: "hi" }], {}, fa);
    t("chat joins array-shaped content (no '[object Object]')", ra.text === "part A part B");
  }

  // ── discover: reachable servers come back with models; unreachable are marked, never throw ──
  {
    const fByBase = (url) => url.indexOf("11434") >= 0
      ? Promise.resolve(ok({ data: [{ id: "llama3.2:3b" }] }))
      : Promise.reject(new Error("ECONNREFUSED"));
    const found = await E.discover(E.KNOWN_LOCAL, fByBase);
    const ollama = found.find(s => s.name === "Ollama");
    const lmstudio = found.find(s => s.name === "LM Studio");
    t("discover marks Ollama reachable with its models", ollama.reachable === true && ollama.models[0] === "llama3.2:3b" && ollama.kind === "on-device");
    t("discover marks an unreachable server reachable:false (never throws)", lmstudio.reachable === false && !!lmstudio.error);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Endpoint connector: OpenAI-compatible list/chat, localhost-vs-network classification, best-effort discovery — injected fetch, no network.");
  process.exit(0);
})().catch(e => { console.error("endpoint test crashed:", e); process.exit(1); });
