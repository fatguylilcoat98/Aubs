/* AUBS A2 — greeting identity guard. The FLAG_ROUTER greeting embeds an identity claim; it must
   use the resolved assistant name, never a stale "AUBS". Fixed at the source (greetingAnswer uses
   persona) and as a safety net (identityGuard over router output). Regression guard for the leak
   surfaced by the conversation validation. Usage: node tests/run-greeting-identity.cjs */
"use strict";
const SPINE = require("../spine/spine.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const TOM = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });

// source fix: the greeting (reached via routeQuery) uses the persona/resolved name
{
  const r = SPINE.routeQuery("Hello", { entries: [], persona: "Tom", instructions: "" });
  t("greeting (persona='Tom') → \"I'm Tom\", NOT \"I'm AUBS\"", /I'm Tom\b/.test(r.answer) && !/I'm AUBS\b/.test(r.answer));
}

// safety net: identityGuard rewrites a stale router greeting against the resolved identity
{
  const guarded = SPINE.identityGuard("Hey! I'm AUBS, here and ready. What's up?", TOM);
  t("identityGuard rewrites a router greeting 'I'm AUBS' → 'I'm Tom'", /I'm Tom\b/.test(guarded) && !/I'm AUBS\b/.test(guarded));
}

// end-to-end through the router (the live greeting path), persona = resolved name
{
  const r = SPINE.routeQuery("Hello", { entries: [], persona: TOM.assistantDisplayName, instructions: "" });
  t("routeQuery('Hello') greeting respects the resolved name (Tom), no 'I'm AUBS' leak",
    r && r.handled && r.intent === "greeting" && /Tom/.test(r.answer) && !/I'm AUBS\b/.test(r.answer));
}

// bare-OS default is still correct (name = AUBS → greeting says AUBS, no false rewrite)
{
  const r = SPINE.routeQuery("Hello", { entries: [], persona: "AUBS", instructions: "" });
  t("bare-OS 'Hello' → \"I'm AUBS\" (correct; no over-correction)", r.handled && /I'm AUBS\b/.test(r.answer));
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Greeting identity: the router greeting uses the resolved assistant name; identityGuard nets any router identity drift; bare-OS default unchanged.");
process.exit(0);
