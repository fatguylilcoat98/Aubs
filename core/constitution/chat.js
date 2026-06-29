/* ============================================================================
   AUBS Constitutional Chat Path — the One Spine for live local chat (Milestone 14)
   Truth · Safety · We Got Your Back

   The thin glue that lets the REAL on-device chat turn run through the full constitutional
   pipeline (runConstitutionalRequest) instead of the standalone M4 kernel bridge. It adds
   NO new behaviour and NO new model: the app injects the one WebLLM completion it already
   has, and this module wraps it as a governed `local-webllm` PROVIDER plus a built-in
   `local_chat` SKILL, then drives one request:

     Intent → Plan (planner) → GEL → Provider Eligibility → Provider (drift shield) →
     Grounding → DecisionRecord → Ledger → Replay evidence → Level 1 explanation.

   Inert by construction: nothing here runs unless the app calls runConstitutionalChat,
   which only happens behind FLAG_CONSTITUTION_CHAT (?spine=1). With the flag off the app
   behaves exactly as before. It NEVER loads a model and NEVER creates a second engine.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PROV     = isNode ? require("../providers")        : (typeof window !== "undefined" ? window.AUBS_PROVIDERS : null);
  var SKILLREG = isNode ? require("../skills/registry")  : (typeof window !== "undefined" ? window.AUBS_SKILL_REGISTRY : null);
  var PIPE     = isNode ? require("./pipeline")          : (typeof window !== "undefined" ? window.AUBS_CONSTITUTION_PIPELINE : null);
  var TRUST    = isNode ? require("../trust")            : (typeof window !== "undefined" ? window.AUBS_TRUST : null);

  // The on-device chat skill: a low-risk, fully-local capability that DECLARES exactly one
  // provider (the local model) and nothing else — no tools, no network, no memory scopes.
  // The pipeline executes via the provider; execute() is a required-but-unused passthrough
  // (skills declare/request resources, they never run them — only the kernel executes).
  function makeLocalChatSkill() {
    return {
      skill_id: "local_chat", name: "Local Chat", version: "1.0.0",
      description: "Answer the user on-device using the local model. Nothing leaves the device.",
      inputs: ["message"], outputs: ["answer"],
      required_permissions: [], allowed_tools: [], allowed_providers: ["local-webllm"],
      allowed_memory_scopes: [], requires_network: false, requires_user_confirmation: false,
      risk_level: "low", supported_operations: ["chat"], enabled: true, metadata: { builtin: true },
      execute: function () { return Promise.resolve({ status: "success", output_text: "", output_classification: "none" }); }
    };
  }

  // Wrap the injected completion as a governed local provider. generate(ctx) → { text, finish }
  // (may throw). The provider returns the normalized adapter shape the Drift Shield validates;
  // a throw or empty output becomes an explicit, honest failure — never invented text.
  function makeLocalProvider(generate, model_id) {
    var adapter = {
      id: "local-webllm",
      run: function (plan, ctx) {
        return Promise.resolve()
          .then(function () { return generate(ctx); })
          .then(function (out) {
            var text = (out && typeof out.text === "string") ? out.text : "";
            if (!text) return { ok: false, failure_type: "model_error", message: "the on-device model returned no text", recoverable: true };
            return { ok: true, output_text: text, model_id: model_id || "local-model", provider_id: "local-webllm" };
          })
          .catch(function (e) { return { ok: false, failure_type: "model_error", message: (e && e.message) ? e.message : String(e), recoverable: true }; });
      }
    };
    return PROV.adapterToProvider(adapter, { provider_id: "local-webllm", provider_type: "local", capabilities: PROV.defaultLocalCapabilities() });
  }

  // Assemble the governed environment for a chat turn: a provider registry holding the local
  // model, and a skill registry holding the built-in local_chat skill (validated against that
  // provider registry, so an undeclared/unknown provider could never slip in). Pure setup.
  function buildChatEnv(opts) {
    opts = opts || {};
    var providerRegistry = PROV.createRegistry();
    providerRegistry.register(makeLocalProvider(opts.generate, opts.model_id));
    var skillRegistry = SKILLREG.createSkillRegistry({ providerRegistry: providerRegistry });
    var reg = skillRegistry.registerSkill(makeLocalChatSkill());
    return { providerRegistry: providerRegistry, skillRegistry: skillRegistry, skillRegistered: reg };
  }

  // Drive ONE constitutional chat turn. Returns the pipeline state plus a UI view derived
  // purely from recorded state — text to show, whether it was blocked, the honest explanation.
  function runConstitutionalChat(opts) {
    opts = opts || {};
    var env = buildChatEnv(opts);
    var request = {
      user_text: opts.text || "",
      skill_id: "local_chat", operation: "chat",
      // local-only / no-egress: this turn must never leave the device.
      constraints: opts.constraints || { max_egress: "none", local_only: true, data_classification: "personal" }
    };
    return Promise.resolve(PIPE.runConstitutionalRequest(request, {
      skillRegistry: env.skillRegistry,
      providerRegistry: env.providerRegistry,
      bundle: opts.bundle || null,
      ctx: opts.ctx || {},
      ledgerStore: opts.ledgerStore || null,
      signingKey: opts.signingKey || null,
      // Slice 0 — Article 12 v2: app-declared identity + the deterministic identity route.
      // appIdentity is the application's declaration (Splendor/LYLO/…); when absent the kernel
      // falls back to AUBS. identityV2 / FLAG_IDENTITY_V2 default OFF (byte-identical when off).
      appIdentity: opts.appIdentity || null,
      identityV2: opts.identityV2,
      // A2 — governed-fact registry as the first pre-model owner (Invariant I).
      // Default reads FLAG_GOVERNED_FACTS in the pipeline; runtime carries version/creator metadata.
      governedFacts: opts.governedFacts,
      runtime: opts.runtime || null,
      // Memory-first (§7): owned memories the governed-fact gate uses to answer stored personal
      // facts (where do I live / what do you know about me) deterministically, model 0×.
      memoryEntries: opts.memoryEntries || null,
      // Trust OS wire-up: emit a validated Trust Record (FLAG_TRUST_OS). publicKey upgrades the
      // Integrity proof to a full offline chain re-verify.
      trustOS: opts.trustOS,
      publicKey: opts.publicKey || null,
      // Unified Identity: the resolver reads this config (assistant name / user name / style).
      identityConfig: opts.identityConfig || null,
      userPersonaName: opts.userPersonaName || null,
      userName: opts.userName || null,
      intent_id: opts.intent_id, plan_id: opts.plan_id, created_at: opts.created_at, source: opts.source || "user"
    })).then(function (state) {
      state.ui = uiView(state);
      return state;
    });
  }

  // Honest, model-free message when a turn is blocked by governance/eligibility/etc.
  function blockedMessage(state) {
    var decision = state.governance ? state.governance.decision : "deny";
    if (decision === "require_reauth") return "You'll need to re-authenticate before I can run that.";
    return "I can't run that under your current policy.";
  }

  // Map recorded pipeline state → exactly what the chat UI needs. NEVER invents text:
  // success shows the model's output verbatim; blocked/failed show an honest, fixed message.
  function uiView(state) {
    var blocked = state.status === "blocked";
    var ok = state.status === "ok";
    var text;
    if (ok) text = state.output_text || "";
    else if (blocked) text = blockedMessage(state);
    else text = "Something went wrong before I could answer. Nothing left this device.";
    var ui = {
      ok: ok, blocked: blocked, text: text,
      explanation: state.explanation || "",
      grounding: state.grounding ? state.grounding.tag : null,
      record_id: state.record ? state.record.id : null,
      record_seq: state.record ? state.record.seq : null,
      execution_type: state.record ? state.record.execution_type : null,
      // Slice 0: when the answer came from the app-declared identity route, surface that the
      // model was NOT called and who declared the identity (for an honest "Why?").
      identity: state.identity || null,
      // A2.1 explainability invariant: every response carries internal provenance —
      // who owned it, where it came from, whether the model was consulted, and why.
      provenance: state.provenance || null
    };
    // Trust OS fields are added ONLY when a Trust Record exists — so with FLAG_TRUST_OS off the
    // ui shape is byte-identical to pre-Trust-OS (no trust_* keys appear at all).
    if (state.trust_record) {
      ui.trust_record = state.trust_record;
      ui.trust_valid = state.trust_record_valid === true;
      ui.glass_box_easy = (TRUST && TRUST.glassBox) ? (function () { try { return TRUST.glassBox.render(state.trust_record, { mode: "easy" }).text; } catch (e) { return null; } })() : null;
    }
    return ui;
  }

  // Slice 0 — sample APP IDENTITIES. AUBS is the OS; these are interchangeable applications
  // that DECLARE their own identity. The live app declares NONE by default (fallback = AUBS);
  // these prove the OS↔app layering and are selectable for founder/device testing only.
  var APP_IDENTITIES = {
    splendor: { app_id: "splendor", assistant_name: "Splendor", persona_ref: "splendor-soul-v1" },
    lylo:     { app_id: "lylo",     assistant_name: "LYLO",     persona_ref: "lylo-persona-v1" }
  };
  function getAppIdentity(appId) {
    if (!appId) return null;
    return APP_IDENTITIES[String(appId).toLowerCase()] || null;
  }

  var API = {
    makeLocalChatSkill: makeLocalChatSkill, makeLocalProvider: makeLocalProvider,
    buildChatEnv: buildChatEnv, runConstitutionalChat: runConstitutionalChat, uiView: uiView,
    APP_IDENTITIES: APP_IDENTITIES, getAppIdentity: getAppIdentity
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONSTITUTION_CHAT = API;
})();
