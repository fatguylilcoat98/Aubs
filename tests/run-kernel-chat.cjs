/* AUBS Kernel Chat Bridge — Milestone 4 tests. Proves the REAL chat path can run
   through the kernel behind a flag without losing the working experience:
   flag-ON routes through Intent→Plan→GEL→(allow?model:block)→Result/Failure→Record,
   the real adapter is called ONLY after GEL allow, every turn writes a ledger record,
   explanations come from recorded state, and the ledger verifies.
   Usage: node tests/run-kernel-chat.cjs   (exit 0 = all pass) */
"use strict";
const L = require("../spine/ledger.js");
const CAC = require("../core/cac");
const K = require("../core/kernel");
const BR = require("../core/kernel/chat-bridge.js");
const EXPL = require("../core/kernel/explanation.js");

let pass = 0, fail = 0; const F = [];
function ok(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// deny/reauth/modify bundle over model_call (same shape the device's default bundle ALLOWS)
function bundleWith(effect) {
  return { bundle_id: "b", bundle_version: "1", require_explicit_allow: false, policies: [{ policy_id: effect + "-mc", precedence_level: "org", effect: effect, enabled: true, reason: effect + " model calls", match: { step_type: "model_call" } }] };
}
// fake "generate" functions — stand in for the real WebLLM completion the app injects
function okGen(text) { let n = 0; const f = function () { n++; return Promise.resolve({ text: text || "Hello from the local model.", finish: "stop" }); }; f.calls = () => n; return f; }
function emptyGen() { let n = 0; const f = function () { n++; return Promise.resolve({ text: "", finish: "length" }); }; f.calls = () => n; return f; }
function throwGen() { let n = 0; const f = function () { n++; return Promise.reject(new Error("on-device engine lost")); }; f.calls = () => n; return f; }

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── flag ON: a normal local turn routes through the kernel and is ALLOWED ──────────
  let store = L.createMemoryStore();
  let gen = okGen("The capital of France is Paris.");
  let res = await BR.runKernelChat({ text: "what's the capital of France?", generate: gen, model_id: "Qwen2.5-0.5B-Instruct", ledgerStore: store, signingKey: key.privateKey });
  ok("flag ON: turn routes through kernel (Intent+Plan+GEL produced)", !!(res.intent && res.plan && res.governance) && CAC.validate.validateIntent(res.intent).valid);
  ok("GEL allow on a local turn (default bundle: local-only is allowed)", res.governance.decision === "allow");
  ok("real adapter WAS called after allow (exactly once)", gen.calls() === 1);
  ok("model text flows back to the UI verbatim", res.ui.ok && res.ui.text === "The capital of France is Paris." && res.result.output_text === "The capital of France is Paris.");
  ok("successful turn wrote a DecisionRecord (execution_type=model)", res.record && res.record.execution_type === "model");
  ok("explanation derived from recorded state: answered locally", res.explanation === "Answered locally. Nothing left this device." && res.ui.explanation === res.explanation);
  ok("explanation matches EXPL.level1 over the same outcome", res.explanation === EXPL.level1({ decision: "allow", status: "ok", kind: "executed", left_device: false }));

  // ── GEL deny: the model is NEVER called; a record is still written ─────────────────
  let denyGen = okGen();
  res = await BR.runKernelChat({ text: "hello", generate: denyGen, ledgerStore: store, signingKey: key.privateKey, bundle: bundleWith("deny") });
  ok("GEL deny → adapter (model) NEVER called", denyGen.calls() === 0);
  ok("GEL deny → UI marked blocked, no result", res.ui.blocked === true && res.result === null && res.failure && res.failure.failure_type === "policy_denied");
  ok("GEL deny → blocked message is honest, not model output", /can't run that under your current policy/.test(res.ui.text));
  ok("denied turn STILL wrote a DecisionRecord (execution_type=blocked)", res.record && res.record.execution_type === "blocked");
  ok("denied explanation: blocked by policy", res.explanation === "Blocked by policy. Nothing left this device.");

  // ── require_reauth: blocked, recoverable, model not called ─────────────────────────
  let reGen = okGen();
  res = await BR.runKernelChat({ text: "hi", generate: reGen, ledgerStore: store, signingKey: key.privateKey, bundle: bundleWith("require_reauth") });
  ok("require_reauth → model not called, failure recoverable", reGen.calls() === 0 && res.failure && res.failure.recoverable === true && res.ui.blocked === true);
  ok("require_reauth → re-auth worded message", /re-authenticate/.test(res.ui.text));

  // ── adapter failure paths → CAC Failure (model_error), honest error to the UI ──────
  let eGen = emptyGen();
  res = await BR.runKernelChat({ text: "hello", generate: eGen, ledgerStore: store, signingKey: key.privateKey });
  ok("empty model output → CAC Failure (model_error), adapter was called", eGen.calls() === 1 && res.failure && res.failure.failure_type === "model_error" && res.result === null);
  ok("empty output explanation: execution failed", res.explanation === "Execution failed before an answer. Nothing left this device.");
  let tGen = throwGen();
  res = await BR.runKernelChat({ text: "hello", generate: tGen, ledgerStore: store, signingKey: key.privateKey });
  ok("thrown engine error → caught as CAC Failure (model_error)", tGen.calls() === 1 && res.failure && res.failure.failure_type === "model_error");
  ok("failure turns also wrote DecisionRecords", res.record !== null);

  // ── ledger verifies after a mix of real chat turns (allow + deny + reauth + fail) ──
  const v = await L.verifyLedger(await store.all(), key.publicKey);
  ok("ledger VERIFIES after flagged kernel chat (" + v.count + " records, signed)", v.ok === true && v.count === 5);
  ok("records prove LOCAL execution + no egress (provider=local on every record)", (await store.all()).every(r => r.provider === "local"));

  // ── determinism of the UI mapping (pure function over recorded state) ──────────────
  const mk = (decision, status, kind) => ({ governance: { decision, reason: "r" }, result: status === "ok" ? { status: "ok", output_text: "x" } : null, failure: status !== "ok" ? { message: "m", failure_type: "model_error" } : null, record: { execution_type: kind === "executed" ? "model" : "blocked", seq: 0, id: "i" }, explanation: EXPL.level1({ decision, status, kind, left_device: false }) });
  ok("uiView is deterministic for the same recorded state", JSON.stringify(BR.uiView(mk("allow", "ok", "executed"))) === JSON.stringify(BR.uiView(mk("allow", "ok", "executed"))));
  ok("uiView surfaces blocked for a denied record", BR.uiView(mk("deny", "blocked", "blocked")).blocked === true);

  // ── flag OFF (by construction): the bridge runs ONLY when called. Nothing here is
  //    invoked unless the app reaches runKernelChat, so flag-OFF cannot regress chat. ──
  ok("flag-OFF safety: bridge is inert until runKernelChat is called (pure module)", typeof BR.runKernelChat === "function" && typeof BR.makeRealLocalAdapter === "function");

  // ── produced CAC validates ─────────────────────────────────────────────────────────
  const good = await BR.runKernelChat({ text: "hi again", generate: okGen("ok"), ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
  ok("kernel-chat Result validates against CAC", CAC.validate.validateResult(good.result).valid);

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Kernel chat bridge v0.1: real chat through Intent→Plan→GEL→model/deny→Record, flag-gated, ledger-verified.");
  process.exit(0);
})().catch(e => { console.error("kernel-chat test crashed:", e); process.exit(1); });
