/* AUBS local-native provider seam — Phase 3 tests.

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   Proves the repo-side native provider seam WITHOUT any native runtime, plugin, or APK
   (the bridge is a deterministic in-process fake):
     - local-native is ELIGIBLE when a native bridge is present,
     - local-native is NOT eligible (never registered) when the bridge is absent,
     - local-native is SELECTED over local-webllm when both are eligible,
     - local-webllm is selected (fallback) when native is absent,
     - policy / local_only is still respected (native is local, no egress),
     - no model/provider bypass — native still runs through the Drift Shield + pipeline,
     - the ledger records provider_id = local-native DISTINCTLY.
   Usage: node tests/run-native-provider.cjs   (exit 0 = all pass) */
"use strict";
const P = require("../core/providers");
const CAC = require("../core/cac");
const L = require("../spine/ledger.js");
const NATIVE = require("../core/kernel/native-bridge.js");
const CHAT = require("../core/constitution/chat.js");
const ELIG = P.eligibility;

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const T = "2026-07-01T00:00:00Z";

// A deterministic native bridge fake — stands in for the Capacitor/llama.cpp plugin. No native
// code, no network, no model: it just echoes so we can exercise the contract + registration.
function fakeBridge(over) {
  return Object.assign({
    generate: function (ctx) {
      const u = ctx && ctx.intent && ctx.intent.user_text;
      return Promise.resolve({ text: "(native) " + (u || "answer"), finish: "stop" });
    },
    available: function () { return true; },
    health: function () { return Promise.resolve({ ok: true }); },
    info: function () { return { runtime: "llama.cpp", model_id: "qwen2.5-3b-q4_k_m.gguf" }; }
  }, over || {});
}

// Intent+Plan for a local-only chat turn, and an allow governance over it.
function scenario(constraints) {
  const intent = CAC.builders.buildIntent("say hi", { intent_id: "i", created_at: T, constraints: constraints });
  const plan = CAC.builders.buildPlan(intent, [{ step_type: "model_call", target: "local", egress: "none" }], { plan_id: "p", created_at: T });
  return { intent, plan };
}
const allowGov = (plan) => CAC.builders.buildGovernanceDecision(plan, "allow", { winning_rule: "default-allow-local", precedence_level: "default", created_at: T });
const denyGov = (plan) => CAC.builders.buildGovernanceDecision(plan, "deny", { winning_rule: "org-deny", precedence_level: "org", created_at: T });

// A minimal local-webllm provider (the offline floor) for the head-to-head selection tests.
function webllmProvider() {
  const adapter = {
    id: "local-webllm",
    run: function () { return Promise.resolve({ ok: true, output_text: "(webllm) hi", model_id: "Qwen2.5-0.5B", provider_id: "local-webllm" }); }
  };
  return P.adapterToProvider(adapter, { provider_id: "local-webllm", provider_type: "local", capabilities: P.defaultLocalCapabilities() });
}

(async () => {
  const key = await L.generateSigningKeyPair();
  const localOnly = { local_only: true, max_egress: "none", data_classification: "personal" };

  // ══ 1) Bridge detection + provider contract ═══════════════════════════════════════════
  ok("isNativeBridge true for an object with generate()", NATIVE.isNativeBridge(fakeBridge()) === true);
  ok("isNativeBridge false for null / no generate", NATIVE.isNativeBridge(null) === false && NATIVE.isNativeBridge({}) === false);
  ok("bridgeAvailable honours available()===false", NATIVE.bridgeAvailable(fakeBridge({ available: () => false })) === false);
  const prov = NATIVE.makeNativeProvider(fakeBridge(), {});
  ok("makeNativeProvider → provider_id=local-native, provider_type=local", prov.provider_id === "local-native" && prov.provider_type === "local");
  ok("native provider is local-posture (no cloud, no egress)", prov.capabilities.supports_cloud === false && prov.capabilities.max_egress === "none" && prov.capabilities.requires_network === false);
  const contract = P.drift.validateProvider(prov);
  ok("native provider passes the Drift Shield contract", contract.ok === true);

  // ══ 2) Registration: only when the bridge is present ══════════════════════════════════
  let reg = P.createRegistry();
  let r = NATIVE.registerNativeProvider(reg, null, {});   // no bridge, no global
  ok("registration SKIPPED when bridge absent (no_native_bridge)", r.registered === false && r.reason === "no_native_bridge" && !reg.has("local-native"));

  reg = P.createRegistry();
  r = NATIVE.registerNativeProvider(reg, fakeBridge({ available: () => false }), {});
  ok("registration SKIPPED when bridge present but unavailable", r.registered === false && r.reason === "native_bridge_unavailable" && !reg.has("local-native"));

  reg = P.createRegistry();
  r = NATIVE.registerNativeProvider(reg, fakeBridge(), {});
  ok("registration SUCCEEDS when a usable bridge is present", r.registered === true && r.provider_id === "local-native" && reg.has("local-native"));

  // ══ 3) Eligibility: present ⇒ eligible; absent ⇒ not even a candidate ══════════════════
  let s = scenario(localOnly);
  let e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: reg });
  ok("local-native ELIGIBLE when the bridge is present", e.eligible.some(p => p.provider_id === "local-native"));

  let regNoNative = P.createRegistry();
  regNoNative.register(webllmProvider());
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: regNoNative });
  ok("local-native NOT eligible when bridge absent (never registered)", !e.eligible.some(p => p.provider_id === "local-native"));

  // ══ 4) Selection preference: native wins when both eligible; webllm is the fallback ════
  let regBoth = P.createRegistry();
  regBoth.register(webllmProvider());
  NATIVE.registerNativeProvider(regBoth, fakeBridge(), {});
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: regBoth });
  ok("both eligible → local-native SELECTED over local-webllm", e.selected === "local-native" && e.eligible.length === 2);

  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: regNoNative });
  ok("native absent → local-webllm selected (fallback preserved)", e.selected === "local-webllm");

  // preference is EXPLICIT, not alphabetical luck: even if webllm sorted first it must not win.
  ok("selectionSort ranks local-native ahead of local-webllm", ELIG.selectionSort({ provider_id: "local-webllm" }, { provider_id: "local-native" }) > 0);
  ok("preference does not disturb unrelated providers (lowest id fallback)", ELIG.selectionSort({ provider_id: "local-aaa" }, { provider_id: "local-bbb" }) < 0);

  // ══ 5) Policy still governs: local_only respected, deny still blocks ═══════════════════
  e = await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: denyGov(s.plan), registry: regBoth });
  ok("GEL deny → nothing selected (native cannot bypass policy)", e.selected === null && e.governance_ok === false && e.eligible.length === 0);

  // native must remain a LOCAL provider under a local-only intent (no egress path opens up).
  ok("native stays eligible under local_only (it is on-device)", (await ELIG.evaluate({ intent: s.intent, plan: s.plan, governance: allowGov(s.plan), registry: regBoth })).eligible.some(p => p.provider_id === "local-native"));

  // ══ 6) No bypass + provenance: native runs through the FULL pipeline; ledger stamps it ══
  const store = L.createMemoryStore();
  const nativeGen = () => Promise.resolve({ text: "hi from native", finish: "stop" });
  const res = await CHAT.runConstitutionalChat({
    text: "hello", generate: nativeGen, model_id: "webllm-fallback",
    nativeBridge: fakeBridge(), native_model_id: "qwen2.5-3b-q4_k_m.gguf",
    ledgerStore: store.store || store, signingKey: key.privateKey, created_at: T
  });
  ok("constitutional pipeline SELECTS local-native when the bridge is present", res.selected_provider === "local-native");
  ok("pipeline answered through native (model was consulted, governed)", res.status === "ok" && res.ui && res.ui.ok === true);
  const rec = res.record;
  ok("ledger DecisionRecord records provider = local-native distinctly", rec && rec.provider === "local-native");
  ok("DecisionRecord explanation carries provider_id = local-native", rec && rec.explanation && rec.explanation.provider_id === "local-native");
  ok("record is chained + signed (no bypass of provenance)", rec && typeof rec.record_hash === "string" && rec.record_hash.length > 0 && typeof rec.signature === "string");

  // Same pipeline, NO bridge → falls back to local-webllm, provenance stamps THAT distinctly.
  const store2 = L.createMemoryStore();
  const res2 = await CHAT.runConstitutionalChat({
    text: "hello", generate: () => Promise.resolve({ text: "hi from webllm", finish: "stop" }),
    model_id: "Qwen2.5-0.5B",
    ledgerStore: store2.store || store2, signingKey: key.privateKey, created_at: T
  });
  ok("no bridge → pipeline selects local-webllm (default Pages behaviour unchanged)", res2.selected_provider === "local-webllm");
  ok("fallback record records provider = local-webllm distinctly", res2.record && res2.record.provider === "local-webllm");

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("local-native seam: present⇒eligible, absent⇒webllm floor, native preferred when both, policy still governs, provenance distinct — no runtime, no APK, no network.");
  process.exit(0);
})().catch(e => { console.error("native-provider test crashed:", e); process.exit(1); });
