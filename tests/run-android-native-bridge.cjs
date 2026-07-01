/* AUBS Android Native Bridge — Phase 1 tests (governed bridge path, no Android build).

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   Proves the Android bridge path WITHOUT an APK / emulator / native code — the native
   plugin is simulated in-process by a stub bridge that returns exactly what the Phase 1
   Java stub returns ("Native bridge connected."). Everything still flows through the
   merged constitutional pipeline (CAC → GEL → Execution Contract → eligibility → Drift
   Shield → ledger). Proves:
     1. no bridge (browser/Pages) → local-webllm selected
     2. simulated native bridge → local-native selected
     3. native provider RECEIVES a valid Execution Contract
     4. native provider CANNOT run without a contract (fail closed, bridge never called)
     5. ledger records provider = local-native
     6. why/explanation shows provider_id = local-native
     7. a THROW from the native bridge becomes an honest CAC Failure (no invented text)
     8. a MALFORMED native response fails closed (adapter → model_error; Drift Shield → provider_drift)
   Usage: node tests/run-android-native-bridge.cjs   (exit 0 = all pass) */
"use strict";
const P = require("../core/providers");
const CAC = require("../core/cac");
const L = require("../spine/ledger.js");
const NATIVE = require("../core/kernel/native-bridge.js");
const CHAT = require("../core/constitution/chat.js");
const PIPE = require("../core/constitution/pipeline.js");

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const T = "2026-07-01T00:00:00Z";

// The simulated native plugin — mirrors capacitor-shell/native/AubsNativePlugin.java's stub:
// generate() returns the NORMALIZED provider shape the merged seam accepts.
function stubBridge(over) {
  return Object.assign({
    available: function () { return true; },
    health: function () { return Promise.resolve({ ok: true }); },
    info: function () { return { runtime: "capacitor-native-stub", model_id: "native-stub" }; },
    generate: function (ctx) {
      return Promise.resolve({ ok: true, output_text: "Native bridge connected.", model_id: "native-stub", provider_id: "local-native", finish: "stop" });
    }
  }, over || {});
}

// A WebLLM completion for the fallback path (the offline floor).
const webllmGen = () => Promise.resolve({ text: "hi from webllm", finish: "stop" });

(async () => {
  const key = await L.generateSigningKeyPair();

  // ══ 1) No bridge (plain browser / GitHub Pages) → local-webllm ═════════════════════════
  {
    const store = L.createMemoryStore();
    const res = await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, model_id: "Qwen2.5-0.5B", ledgerStore: store, signingKey: key.privateKey, created_at: T });
    ok("no native bridge → local-webllm selected (Pages behaviour unchanged)", res.selected_provider === "local-webllm");
    ok("no native bridge → window.AUBSNative undefined equivalent (nothing registered)", res.record && res.record.provider === "local-webllm");
  }

  // ══ 2) Simulated native bridge → local-native selected + stub answer flows through ═════
  {
    const store = L.createMemoryStore();
    const res = await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, model_id: "Qwen2.5-0.5B", nativeBridge: stubBridge(), ledgerStore: store, signingKey: key.privateKey, created_at: T });
    ok("simulated native bridge → local-native selected", res.selected_provider === "local-native");
    ok("stub generate() text flows through the pipeline verbatim", res.status === "ok" && res.output_text === "Native bridge connected." && res.ui.ok === true);
  }

  // ══ 3) Native provider RECEIVES a valid Execution Contract ═════════════════════════════
  {
    let seenContract = null;
    const capturing = stubBridge({ generate: function (ctx) { seenContract = ctx && ctx.execution_contract; return Promise.resolve({ ok: true, output_text: "ok", model_id: "native-stub", provider_id: "local-native", finish: "stop" }); } });
    const store = L.createMemoryStore();
    await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, nativeBridge: capturing, ledgerStore: store, signingKey: key.privateKey, created_at: T });
    const valid = seenContract && CAC.validate.validateExecutionContract(seenContract).valid === true;
    ok("native bridge.generate() receives an Execution Contract", !!seenContract);
    ok("the Execution Contract the native provider receives is VALID", valid === true);
    ok("contract names local-native as the allowed provider", seenContract && seenContract.allowed_provider === "local-native");
  }

  // ══ 4) Native provider CANNOT run without a contract (fail closed, bridge never called) ═
  {
    let calls = 0;
    const spy = stubBridge({ generate: function () { calls++; return Promise.resolve({ ok: true, output_text: "should not run", model_id: "native-stub", provider_id: "local-native" }); } });
    const env = CHAT.buildChatEnv({ generate: webllmGen, nativeBridge: spy });
    ok("native provider is registered when the bridge is present", env.providerRegistry.has("local-native") && env.nativeRegistered.registered === true);
    const intent = CAC.builders.buildIntent("hi", { intent_id: "i", created_at: T, constraints: { local_only: true, max_egress: "none", data_classification: "personal" } });
    const plan = CAC.builders.buildPlan(intent, [{ step_type: "model_call", target: "local", egress: "none" }], { plan_id: "p", created_at: T });
    // No/invalid contract → callProviderInContract must refuse BEFORE the provider runs.
    const refused = await PIPE.callProviderInContract(env.providerRegistry, "local-native", plan, null, { intent: intent });
    ok("no Execution Contract → provider call refused (policy_denied, fail closed)", refused && refused.ok === false && refused.failure_type === "policy_denied");
    ok("the native bridge was NEVER invoked without a contract", calls === 0);
  }

  // ══ 5 + 6) Ledger records local-native; why/explanation shows local-native ════════════
  {
    const store = L.createMemoryStore();
    const res = await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, nativeBridge: stubBridge(), ledgerStore: store, signingKey: key.privateKey, created_at: T });
    ok("ledger DecisionRecord records provider = local-native", res.record && res.record.provider === "local-native");
    ok("explanation/why shows provider_id = local-native", res.record && res.record.explanation && res.record.explanation.provider_id === "local-native");
    ok("record is hash-chained + signed (provenance not bypassed)", res.record && typeof res.record.record_hash === "string" && res.record.record_hash.length > 0 && typeof res.record.signature === "string");
  }

  // ══ 7) A THROW from the native bridge → honest CAC Failure (no invented text) ══════════
  {
    const store = L.createMemoryStore();
    const throwing = stubBridge({ generate: function () { return Promise.reject(new Error("native runtime crashed")); } });
    const res = await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, nativeBridge: throwing, ledgerStore: store, signingKey: key.privateKey, created_at: T });
    ok("native throw → status error, ui not ok (no invented answer)", res.status === "error" && res.ui.ok === false);
    ok("native throw → honest, fixed failure message (nothing left the device)", /nothing left this device/i.test(res.ui.text));
    ok("native failure STILL records provenance as local-native", res.record && res.record.provider === "local-native");
  }

  // ══ 8) A MALFORMED native response fails closed ═══════════════════════════════════════
  {
    // (a) adapter level: garbage from the bridge (no text) → normalized model_error, no leak.
    const store = L.createMemoryStore();
    const garbage = stubBridge({ generate: function () { return Promise.resolve({ nonsense: true, output_text: 12345 }); } });
    const res = await CHAT.runConstitutionalChat({ text: "hello", generate: webllmGen, nativeBridge: garbage, ledgerStore: store, signingKey: key.privateKey, created_at: T });
    ok("malformed bridge output (no text) → fail closed (status error, no leaked garbage)", res.status === "error" && res.ui.ok === false && res.output_text !== 12345);

    // (b) Drift Shield level: a provider whose execute() returns an off-contract shape → provider_drift.
    const malformedProvider = {
      provider_id: "local-native", provider_type: "local", enabled: true,
      capabilities: P.defaultLocalCapabilities(),
      healthCheck: function () { return Promise.resolve({ ok: true }); },
      execute: function () { return Promise.resolve({ ok: true, foo: "bar" }); }   // missing output_text/model_id/provider_id
    };
    const drifted = await P.drift.runGuarded(malformedProvider, {}, {});
    ok("off-contract native response → Drift Shield returns provider_drift (fail closed)", drifted && drifted.ok === false && drifted.failure_type === "provider_drift");
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Android bridge (Phase 1): no bridge⇒webllm, stub bridge⇒local-native, contract received + required, ledger/why record local-native, throw⇒CAC Failure, malformed⇒fail closed. Simulated — no APK, no native code, no network.");
  process.exit(0);
})().catch(e => { console.error("android-native-bridge test crashed:", e); process.exit(1); });
