/* AUBS Unified Identity Governance — resolved-identity regression tests (assistant name "Tom").
   Proves the One Rule applied to identity: ONE resolved object (assistant name by precedence,
   AUBS as runtime, canonical acronym), five governed answers from declared truth (model 0×), a
   deterministic guard for sideways turns, and flag-OFF byte-identical. "Tom" is used on purpose:
   it exposes any hard-coded "AUBS" leak in the assistant-name path. Usage: node tests/run-identity-resolved.cjs */
"use strict";
const L = require("../spine/ledger.js");
const SPINE = require("../spine/spine.js");
const CHAT = require("../core/constitution/chat.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function spyGen(text) { let n = 0; const f = async () => { n++; return { text: text || "I am AUBS, short for Advanced User.", finish: "stop" }; }; f.calls = () => n; return f; }
const NOW = "2026-06-29T00:00:00Z"; let seq = 0;
function run(textIn, gen, over) { seq++; return CHAT.runConstitutionalChat(Object.assign({ text: textIn, generate: gen, model_id: "m", intent_id: "i" + seq, plan_id: "p" + seq, created_at: NOW }, over)); }
const TOM = { assistantName: "Tom" };
const TOM_CHRIS = { assistantName: "Tom", userName: "Chris" };

(async () => {
  const key = await L.generateSigningKeyPair();

  // ── Resolver / precedence ───────────────────────────────────────────────────────────────
  {
    const r = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
    t("resolver: assistantName 'Tom' → assistantDisplayName==='Tom', source 'user'", r.assistantDisplayName === "Tom" && r.assistantNameSource === "user");
    t("resolver: product is AUBS, expansion canonical, kept separate from the name", r.productName === "AUBS" && r.productExpansion === "Autonomous Unit Brain System");
    const app = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" }, { app_id: "splendor", assistant_name: "Splendor", persona_ref: "x" });
    t("resolver: app mode wins over user (app>user) — 'Splendor', user 'Tom' does NOT override", app.assistantDisplayName === "Splendor" && app.assistantNameSource === "app");
    const def = SPINE.resolveRuntimeIdentity({});
    t("resolver: no name set → fallback 'AUBS', source 'default'", def.assistantDisplayName === "AUBS" && def.assistantNameSource === "default");
  }

  // ── Assistant=Tom, user empty (end-to-end through the pipeline, model 0×) ──────────────────
  {
    const store = L.createMemoryStore();
    const gName = spyGen(); const sName = await run("What's your name?", gName, { identityConfig: TOM, identityV2: true, ledgerStore: store, signingKey: key.privateKey });
    t("Tom · 'What's your name?' → \"I'm Tom.\", model 0×", sName.ui.text === "I'm Tom." && gName.calls() === 0);
    const gWho = spyGen(); const sWho = await run("Who are you?", gWho, { identityConfig: TOM, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Tom · 'Who are you?' → contains Tom AND AUBS as runtime (not as the name), model 0×", /\bTom\b/.test(sWho.ui.text) && /\bAUBS\b/.test(sWho.ui.text) && gWho.calls() === 0);
    const gInt = spyGen(); const sInt = await run("Introduce yourself", gInt, { identityConfig: TOM, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Tom · 'Introduce yourself' → \"I'm Tom, your private assistant running on AUBS.\", model 0×", sInt.ui.text === "I'm Tom, your private assistant running on AUBS." && gInt.calls() === 0);
    const gAcr = spyGen("AUBS stands for Advanced User."); const sAcr = await run("What does AUBS stand for?", gAcr, { identityConfig: TOM, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Tom · 'What does AUBS stand for?' → \"AUBS stands for Autonomous Unit Brain System.\", model 0×", sAcr.ui.text === "AUBS stands for Autonomous Unit Brain System." && gAcr.calls() === 0);
    const gMy = spyGen(); const sMy = await run("What's my name?", gMy, { identityConfig: TOM, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Tom · 'What's my name?' (empty) → \"I don't know yet — what should I call you?\", model 0×", sMy.ui.text === "I don't know yet — what should I call you?" && gMy.calls() === 0);
    t("Tom · identity record provenance: source 'user', model_called:false, one record, ledger verifies", sName.record.explanation.assistant_name_source === "user" && sName.record.explanation.model_called === false && sName.counters.records === 1 && (await L.verifyLedger(await store.all(), key.publicKey)).ok === true);
  }

  // ── Assistant=Tom, user=Chris ─────────────────────────────────────────────────────────────
  {
    const g = spyGen(); const s = await run("What's my name?", g, { identityConfig: TOM_CHRIS, identityV2: true, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("Tom+Chris · 'What's my name?' → \"Your name is Chris.\", model 0×", s.ui.text === "Your name is Chris." && g.calls() === 0);
  }

  // ── Prompt builder includes the resolved name AND the canonical expansion ─────────────────
  {
    const tom = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
    const p = SPINE.identityPreamble("", { resolved: tom });
    t("prompt: includes 'Tom' and 'Autonomous Unit Brain System' and AUBS-as-runtime", /\bTom\b/.test(p) && /Autonomous Unit Brain System/.test(p) && /run on AUBS/.test(p) && !/your name is AUBS/i.test(p));
  }

  // ── Changing the assistant name updates resolver + prompt + router together ───────────────
  {
    const max = SPINE.resolveRuntimeIdentity({ assistantName: "Max" });
    t("rename Tom→Max: resolver name", max.assistantDisplayName === "Max");
    t("rename Tom→Max: prompt reflects Max", /\bMax\b/.test(SPINE.identityPreamble("", { resolved: max })) && !/\bTom\b/.test(SPINE.identityPreamble("", { resolved: max })));
    t("rename Tom→Max: router answers \"I'm Max.\"", SPINE.identityRoute("what's your name?", max).answer === "I'm Max.");
  }

  // ── Guard (sideways turns) ────────────────────────────────────────────────────────────────
  {
    const tom = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
    t("guard: 'My name is AUBS' (name=Tom) → corrected to Tom", /\bTom\b/.test(SPINE.identityGuard("My name is AUBS.", tom)) && !/My name is AUBS/.test(SPINE.identityGuard("My name is AUBS.", tom)));
    t("guard: false expansion 'Assistant, Unemployed' → canonical", SPINE.identityGuard("AUBS stands for Assistant, Unemployed.", tom) === "AUBS stands for Autonomous Unit Brain System.");
    t("guard: invented user name when unknown → stripped", !/your name is Dave/i.test(SPINE.identityGuard("Your name is Dave.", tom)));
    t("guard: ordinary text + correct claim untouched (no false positives)", SPINE.identityGuard("Sure — here's a short hello!", tom) === "Sure — here's a short hello!" && SPINE.identityGuard("I'm Tom, glad to help.", tom) === "I'm Tom, glad to help.");
    const tc = SPINE.resolveRuntimeIdentity({ assistantName: "Tom", userName: "Chris" });
    t("guard: a KNOWN user name is NOT stripped", SPINE.identityGuard("Your name is Chris.", tc) === "Your name is Chris.");
  }

  // ── Flag-OFF byte-identical: the model answers (no deterministic route) ───────────────────
  {
    const g = spyGen("I'm AUBS."); const s = await run("What's your name?", g, { identityConfig: TOM, identityV2: false, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey });
    t("flag-OFF: identity goes to the MODEL, no deterministic identity record", g.calls() === 1 && !s.identity && s.record.execution_type !== "identity");
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Unified Identity: one resolved object; assistant name (Tom) / product (AUBS) / acronym kept separate; five governed answers from declared truth (model 0×); guard for sideways turns; flag-OFF unchanged.");
  process.exit(0);
})().catch(e => { console.error("identity-resolved test crashed:", e); process.exit(1); });
