/* AUBS Governed-Fact Registry + Classifier — Migration A1 regression tests.
   Proves the general table (architecture doc §3) and the deterministic classifier (§4):
   identity rows delegate to the spine's single source (model 0×); runtime facts
   (version, creator) come from owned state; capabilities/profile reuse the spine;
   the classifier fails toward the runtime; and FLAG_GOVERNED_FACTS OFF is byte-identical
   (every input routes to the model). Assistant name "Tom" is used to expose any hard-coded
   "AUBS" leak in the assistant-name path. Usage: node tests/run-governed-facts.cjs */
"use strict";
const SPINE = require("../spine/spine.js");
const C = require("../core/facts/classifier.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const TOM = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
const TOM_CHRIS = SPINE.resolveRuntimeIdentity({ assistantName: "Tom", userName: "Chris" });
const on = (over) => Object.assign({ resolved: TOM, enabled: true }, over);

// ── FLAG OFF (default) — byte-identical: every governed query routes to the model ──────────
{
  // No `enabled` passed and the spine flag defaults OFF.
  t("flag default OFF in spine", SPINE.FLAGS.FLAG_GOVERNED_FACTS === false);
  const qs = ["What's your name?", "What does AUBS stand for?", "What's my name?",
              "What version are you?", "Who created you?", "Do you work offline?"];
  let allOpen = true;
  qs.forEach(q => { if (C.classify(q, { resolved: TOM }).type !== "open_ended") allOpen = false; });
  t("flag OFF: ALL governed queries return open_ended (model answers, byte-identical)", allOpen);
  t("flag OFF: explicit enabled:false also open_ended", C.classify("What's your name?", { resolved: TOM, enabled: false }).type === "open_ended");
}

// ── IDENTITY rows — delegated to the spine, model 0× ──────────────────────────────────────
{
  const name = C.classify("What's your name?", on());
  t("Tom · 'What's your name?' → governed_fact \"I'm Tom.\", model 0×",
    name.type === "governed_fact" && name.answer === "I'm Tom." && name.model_called === false);
  t("Tom · name factId is identity:assistant_identity", name.factId === "identity:assistant_identity");

  const acr = C.classify("What does AUBS stand for?", on());
  t("Tom · acronym → \"AUBS stands for Autonomous Unit Brain System.\" (never invented)",
    acr.type === "governed_fact" && acr.answer === "AUBS stands for Autonomous Unit Brain System." && acr.factId === "identity:acronym");

  const my = C.classify("What's my name?", on());
  t("Tom · 'What's my name?' (unknown) → honest \"I don't know yet…\"",
    my.answer === "I don't know yet — what should I call you?" && my.factId === "identity:user_name");

  const chris = C.classify("What's my name?", on({ resolved: TOM_CHRIS }));
  t("Tom+Chris · 'What's my name?' → \"Your name is Chris.\"", chris.answer === "Your name is Chris.");

  // single source: classifier identity answer === spine identityRoute answer
  t("identity answer matches the spine's identityRoute exactly (one source)",
    name.answer === SPINE.identityRoute("What's your name?", TOM).answer);
}

// ── VERSION — runtime metadata, falling back to SPINE_VERSION ──────────────────────────────
{
  const v = C.classify("What version are you?", on());
  t("version (no runtime meta) → uses SPINE_VERSION",
    v.type === "governed_fact" && v.factId === "version" && v.answer === "I'm running AUBS " + SPINE.SPINE_VERSION + "." && v.model_called === false);
  const v2 = C.classify("What's your version?", on({ runtime: { version: "2.0.0" } }));
  t("version (runtime.version='2.0.0') → \"I'm running AUBS 2.0.0.\"", v2.answer === "I'm running AUBS 2.0.0.");
}

// ── CREATOR — runtime metadata; fails toward runtime (never invents) ──────────────────────
{
  const c0 = C.classify("Who created you?", on());
  t("creator (unset) → honest, no invented name, mentions AUBS",
    c0.type === "governed_fact" && c0.factId === "creator" && /AUBS/.test(c0.answer) && /don't have my creator recorded/i.test(c0.answer));
  const c1 = C.classify("Who built you?", on({ runtime: { creator: "Christopher Hughes" } }));
  t("creator (runtime.creator set) → \"I was built by Christopher Hughes.\"", c1.answer === "I was built by Christopher Hughes.");
}

// ── CAPABILITIES / LOCALITY — delegated to the spine's capabilityAnswer ────────────────────
{
  const off = C.classify("Do you work offline?", on());
  t("'Do you work offline?' → governed_fact, equals spine capabilityAnswer, model 0×",
    off.type === "governed_fact" && off.factId === "capabilities" && off.answer === SPINE.capabilityAnswer("Do you work offline?") && off.model_called === false);
  const priv = C.classify("Does anything I say leave this device?", on());
  t("data-leaves question → capabilities answer from the spine", priv.type === "governed_fact" && priv.answer === SPINE.capabilityAnswer("Does anything I say leave this device?"));
}

// ── USER PROFILE / MEMORY — delegated to the spine; honest when unknown ────────────────────
{
  const m0 = C.classify("Where do I live?", on());
  t("profile 'Where do I live?' (no memory) → honest \"I don't know that about you yet…\"",
    m0.type === "governed_fact" && m0.factId === "user_profile" && /don't know that about you yet/i.test(m0.answer));
}

// ── OPEN-ENDED — the only thing handed to the model ───────────────────────────────────────
{
  t("'Write me an email' → open_ended", C.classify("Write me an email to my landlord.", on()).type === "open_ended");
  t("'Tell me a joke' → open_ended", C.classify("Tell me a joke.", on()).type === "open_ended");
}

// ── TABLE introspection (for A2 Invariant-I enumeration) ──────────────────────────────────
{
  const rows = C.facts();
  const open = rows.filter(r => r.modelMayOriginate);
  t("facts(): exactly ONE row may originate from the model, and it is open_ended",
    open.length === 1 && open[0].id === "open_ended");
  t("facts(): every governed row is modelMayOriginate=false",
    rows.filter(r => r.id !== "open_ended").every(r => r.modelMayOriginate === false));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Governed-fact registry + classifier: identity delegated to the one spine source (model 0×); version/creator from owned state, failing toward the runtime; capabilities/profile reuse the spine; flag-OFF byte-identical.");
process.exit(0);
