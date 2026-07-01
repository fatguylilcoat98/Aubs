/* AUBS identity as a NAME FIELD the runtime reads — Chris's spec.

   AUBS — The Good Neighbor Guard
   Built by Christopher Hughes · Sacramento, CA
   Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
   Truth · Safety · We Got Your Back

   The rule: the assistant's NAME is a field the runtime reads. Whatever the user names it IS
   its name; change the field, the name changes; empty field → it says it has no name yet and
   names the OS (AUBS) instead. The USER's name is a separate field, read the same way. Personas
   change TONE only — never the name, never the identity. And the model can never adopt the
   user's name as its own ("I'm Chris" leak).
   Usage: node tests/run-identity-name-field.cjs   (exit 0 = all pass) */
"use strict";
const SPINE = require("../spine/spine.js");
const P = require("../core/persona/persona.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const R = (cfg) => SPINE.resolveRuntimeIdentity(cfg || {}, null);

// ── NAME is read straight from the field ───────────────────────────────────────────────
{
  const named = R({ assistantName: "Ada" });
  t("named: resolver marks named:true and reads the field", named.named === true && named.assistantName === "Ada");
  t("named: 'what's your name?' → reads the field ('I'm Ada.')", SPINE.identityRoute("what's your name?", named).answer === "I'm Ada.");
  t("named: 'who are you?' → name + runtime", /^I'm Ada, running locally through AUBS\.$/.test(SPINE.identityRoute("who are you?", named).answer));

  // change the field → the name changes (nothing cached, it's just read)
  const renamed = R({ assistantName: "Max" });
  t("rename: change the field → 'I'm Max.'", SPINE.identityRoute("what's your name?", renamed).answer === "I'm Max.");
}

// ── UNNAMED: empty field → honest 'no name yet', names the OS (AUBS is NOT a name) ──────
{
  const un = R({});
  t("unnamed: resolver marks named:false, assistantName null", un.named === false && un.assistantName === null);
  const ans = SPINE.identityRoute("what's your name?", un).answer;
  t("unnamed: 'what's your name?' → honest 'no name yet' + names the OS", /^I don't have a name right now — you haven't named me yet — but I run on the AUBS operating system\./.test(ans));
  t("unnamed: it does NOT claim to be AUBS", !/I'm AUBS\b/.test(ans) && !/I am AUBS\b/.test(ans));
  t("unnamed: 'introduce yourself' → same honest unnamed line", /I don't have a name right now/.test(SPINE.identityRoute("introduce yourself", un).answer));
  // 'aubs' typed into the name field is treated as UNNAMED (that's the OS, not a name)
  t("typing 'AUBS' as the name is treated as unnamed", R({ assistantName: "AUBS" }).named === false);
}

// ── USER name is its own field, read the same way ──────────────────────────────────────
{
  t("user name set → 'Your name is Chris.'", SPINE.identityRoute("what's my name?", R({ userName: "Chris" })).answer === "Your name is Chris.");
  t("user name empty → honest 'don't know yet'", /don't know yet/.test(SPINE.identityRoute("what's my name?", R({})).answer));
}

// ── PERSONA changes TONE only — never the name ─────────────────────────────────────────
{
  const persona = P.resolvePersona("talk like a pirate");
  const named = P.compilePersona(persona, R({ assistantName: "Ada" }));
  t("persona named: speaks AS the field name (Ada), pirate is only voice", /speaking as Ada/.test(named) && !/speaking as a pirate/.test(named));
  const unnamed = P.compilePersona(persona, R({}));
  t("persona unnamed: shapes tone but invents NO name", /you don't have a name yet/.test(unnamed) && !/speaking as AUBS/.test(unnamed));
  // the persona does not change what 'what's your name?' returns — that's the field, not the tone
  t("persona does NOT change the name the runtime reports", SPINE.identityRoute("what's your name?", R({ assistantName: "Ada" })).answer === "I'm Ada.");
}

// ── MODEL system prompt: name as a fact + the anti-mirror rule (the 'I'm Chris' fix) ────
{
  const pre = SPINE.identityPreamble("", { resolved: R({ assistantName: "Ada", userName: "Chris" }) });
  t("preamble (named): tells the model its name is Ada", /Your name is Ada\b/.test(pre));
  t("preamble: anti-mirror rule present (user's 'I'm ...' is the USER, not you)", /that describes the USER — never yourself/i.test(pre) && /Never call yourself by the user's name/i.test(pre));
  const preUn = SPINE.identityPreamble("", { resolved: R({ userName: "Chris" }) });
  t("preamble (unnamed): tells the model it has no name yet, runs on AUBS", /do NOT have a name yet/i.test(preUn) && /run(s|ning)? on AUBS/i.test(preUn));
}

// ── GUARD: the model can NEVER adopt the user's name ('I'm Chris' → corrected) ──────────
{
  const named = R({ assistantName: "Ada", userName: "Chris Hughes" });
  t("guard (named): model 'I'm Chris' → corrected to 'I'm Ada'", /I'm Ada\b/.test(SPINE.identityGuard("Hi, I'm Chris, your assistant.", named)) === true);
  t("guard (named): full user name 'I'm Chris Hughes' → corrected", !/I'm Chris Hughes\b/.test(SPINE.identityGuard("I'm Chris Hughes.", named)));
  const un = R({ userName: "Chris" });
  t("guard (unnamed): model 'I'm Chris' → 'I don't have a name yet'", /I don't have a name yet/.test(SPINE.identityGuard("I'm Chris, nice to meet you.", un)));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Identity name field: name is read from a field (set/change/empty), user name is separate, persona = tone only, anti-mirror stops the 'I'm Chris' leak.");
process.exit(0);
