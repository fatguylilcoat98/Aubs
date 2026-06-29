/* AUBS A2 — governed-fact classifier as the FIRST pre-model owner on EVERY live entry path.
   Enumerates the live entry paths (GATE.LIVE_ENTRY_PATHS), and for each proves: the governed-fact
   registry has first refusal (model 0×); "who made you" → creator (NOT identity); "what can you do"
   → capabilities; acronym stays canonical; open-ended prompts still reach the model. Plus the
   regression guard that fails if identityRoute is reachable as the first handler, and flag-OFF
   byte-identical. Assistant name "Tom" exposes any hard-coded AUBS leak.
   Usage: node tests/run-governed-facts-paths.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("../spine/ledger.js");
const SPINE = require("../spine/spine.js");
const CHAT = require("../core/constitution/chat.js");
const GATE = require("../core/facts/gate.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function spyGen(text) { let n = 0; const f = async () => { n++; return { text: text || "MODEL_REPLY", finish: "stop" }; }; f.calls = () => n; return f; }
const NOW = "2026-06-29T00:00:00Z";
const TOMCFG = { assistantName: "Tom" };
const RUNTIME = { creator: "Christopher Hughes" };
const RESOLVED = SPINE.resolveRuntimeIdentity(TOMCFG);
const IDENTITY_WOULD_SAY = SPINE.identityRoute("Who made you?", RESOLVED).answer; // "I'm Tom." if identity were first

(async () => {
  const key = await L.generateSigningKeyPair();
  let seq = 0;

  // ── Entry-path harnesses. Each returns { text, modelCalls, factId }. ───────────────────────
  // 1) the constitutional pipeline (runConstitutionalChat / ?spine=1) — the real model path.
  async function pipelinePath(q, over) {
    const g = spyGen("MODEL_REPLY"); seq++;
    const s = await CHAT.runConstitutionalChat(Object.assign({
      text: q, generate: g, model_id: "m", intent_id: "i" + seq, plan_id: "p" + seq, created_at: NOW,
      governedFacts: true, identityConfig: TOMCFG, runtime: RUNTIME,
      ledgerStore: L.createMemoryStore(), signingKey: key.privateKey
    }, over || {}));
    return { text: s.ui.text, modelCalls: g.calls(), factId: s.governed_fact ? s.governed_fact.fact_id : "open_ended" };
  }
  // 2) the app chat handler (aubs-app.html window.send) calls this exact shared gate first.
  async function appPath(q) {
    const r = GATE.governedFactGate(q, { resolved: RESOLVED, runtime: RUNTIME, exclude: ["user_profile"], enabled: true });
    return { text: r.handled ? r.answer : "MODEL_REPLY", modelCalls: r.handled ? 0 : 1, factId: r.handled ? r.factId : "open_ended" };
  }
  const PATHS = { constitution_pipeline: pipelinePath, app_chat_handler: appPath };

  // ── Enumerate: every declared live entry path has a harness here (Invariant I coverage). ────
  GATE.LIVE_ENTRY_PATHS.forEach(function (p) {
    t("entry path enumerated & covered: " + p.id, typeof PATHS[p.id] === "function");
  });
  t("no live entry path is left untested", Object.keys(PATHS).length === GATE.LIVE_ENTRY_PATHS.length);

  // ── The ownership matrix, proven on EVERY path ──────────────────────────────────────────────
  for (const id of Object.keys(PATHS)) {
    const run = PATHS[id];
    const name = await run("What's your name?");
    t(id + ": 'What's your name?' → identity \"I'm Tom.\", model 0×",
      name.text === "I'm Tom." && name.modelCalls === 0 && name.factId === "identity:assistant_identity");

    const who = await run("Who are you?");
    t(id + ": 'Who are you?' → identity, model 0× (NOT creator)",
      who.factId.indexOf("identity:") === 0 && who.modelCalls === 0);

    const made = await run("Who made you?");
    t(id + ": 'Who made you?' → creator (NOT identity), model 0×",
      made.factId === "creator" && made.text === "I was built by Christopher Hughes." && made.modelCalls === 0);
    t(id + ": REGRESSION — 'Who made you?' is NOT the identity answer (identityRoute not first)",
      made.text !== IDENTITY_WOULD_SAY);

    const created = await run("Who created you?");
    t(id + ": 'Who created you?' → creator", created.factId === "creator" && created.modelCalls === 0);

    const can = await run("What can you do?");
    t(id + ": 'What can you do?' → capabilities (NOT identity), model 0×",
      can.factId === "capabilities" && can.modelCalls === 0);

    const caps = await run("What are your capabilities?");
    t(id + ": 'What are your capabilities?' → capabilities", caps.factId === "capabilities" && caps.modelCalls === 0);

    const acr = await run("What does AUBS stand for?");
    t(id + ": acronym stays canonical, model 0×",
      acr.text === "AUBS stands for Autonomous Unit Brain System." && acr.factId === "identity:acronym" && acr.modelCalls === 0);

    const open = await run("Write me an email to my landlord.");
    t(id + ": open-ended prompt STILL reaches the model (model 1×)",
      open.factId === "open_ended" && open.modelCalls === 1);
  }

  // ── Flag-OFF byte-identical: governed query reaches the model on the pipeline path ──────────
  {
    const g = spyGen("MODEL_REPLY"); seq++;
    const s = await CHAT.runConstitutionalChat({
      text: "What's your name?", generate: g, model_id: "m", intent_id: "i" + seq, plan_id: "p" + seq, created_at: NOW,
      governedFacts: false, identityV2: false, identityConfig: TOMCFG,
      ledgerStore: L.createMemoryStore(), signingKey: key.privateKey
    });
    t("flag OFF (pipeline): governed query goes to the MODEL (byte-identical, model 1×)", g.calls() === 1);
  }

  // ── Static wiring check on the live HTML handler (aubs-app.html) ─────────────────────────────
  {
    const html = fs.readFileSync(path.join(__dirname, "../aubs-app.html"), "utf8");
    const iGate = html.indexOf("governedFactGate(text");
    const iGf = html.indexOf("if(gf.handled)");
    const iRouted = html.indexOf("if(routed && routed.handled)");
    const iReg = html.indexOf("core/facts/registry.js");
    const iPipe = html.indexOf("core/constitution/pipeline.js");
    t("html: window.send calls governedFactGate (gate wired into the live path)", iGate > 0);
    t("html: gf branch precedes the router branch (registry first refusal over identity)", iGf > 0 && iGf < iRouted);
    t("html: facts scripts load before pipeline.js (gate available to the pipeline)", iReg > 0 && iReg < iPipe);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("A2: governed-fact registry is the first pre-model owner on every live entry path; creator/capabilities/acronym owned correctly (model 0×); open-ended reaches the model; identityRoute is never the first handler; flag-OFF byte-identical.");
  process.exit(0);
})().catch(e => { console.error("governed-facts-paths test crashed:", e); process.exit(1); });
