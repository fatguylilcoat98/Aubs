/* AUBS A2 — runtime conversation validation. Runs the reviewer's exact conversation through
   the LIVE handler's decision order (safety → governed-fact gate → router → model), the same
   order aubs-app.html window.send() uses, and prints per-turn provenance: who owned the answer
   and whether the model was consulted. NODE-LEVEL faithful simulation of the live handler — the
   physical device test (real WebLLM in-browser) is separate. Usage: node tests/run-conversation.cjs */
"use strict";
const SPINE = require("../spine/spine.js");
const GATE = require("../core/facts/gate.js");
const PROV = require("../core/facts/provenance.js");

// Assistant "Tom", user unknown, creator recorded in runtime metadata.
const RESOLVED = SPINE.resolveRuntimeIdentity({ assistantName: "Tom" });
const RUNTIME = { version: SPINE.SPINE_VERSION, creator: "Christopher Hughes" };

// Faithful live-handler order: safety gate → governed-fact registry → router → model.
// Returns { answer, owner, source, model_called }.
function handleTurn(text) {
  // 1) safety (none of these are unsafe; shown for fidelity)
  if (SPINE.safetyGate(text).blocked) {
    return { answer: SPINE.safeResponse(SPINE.safetyGate(text).reason), owner: "safety", source: "spine:safetyGate", model_called: false };
  }
  // 2) governed-fact registry — FIRST pre-model owner (user_profile deferred to the router/memory, as in the live HTML)
  const g = GATE.governedFactGate(text, { resolved: RESOLVED, runtime: RUNTIME, exclude: ["user_profile"], enabled: true });
  if (g.handled) { const p = PROV.governed(g.factId, g.owner); return { answer: g.answer, owner: p.owner, source: p.source, model_called: false }; }
  // 3) router (deterministic: greeting/memory/etc.) — model 0×
  const r = SPINE.routeQuery(text, { entries: [], persona: RESOLVED.assistantDisplayName, instructions: "" });
  if (r && r.handled) { return { answer: r.answer, owner: "router:" + r.intent, source: "spine:routeQuery", model_called: false }; }
  // 4) model — the only path that consults the language engine
  return { answer: "[model reply]", owner: "model", source: "Qwen2.5 (0.5B)", model_called: true };
}

const CONVO = [
  "Hello.",
  "What's your name?",
  "Who created you?",
  "What does AUBS stand for?",
  "Tell me about yourself.",
  "What can you do?",
  "What's my name?",
  "Tell me what you know about me.",
  "I created you."
];

console.log("Assistant: Tom  ·  User: (unknown)  ·  creator recorded: Christopher Hughes\n");
let modelCalls = 0;
CONVO.forEach(function (q, i) {
  const r = handleTurn(q);
  if (r.model_called) modelCalls++;
  console.log("U" + (i + 1) + ": " + q);
  console.log("    → " + r.answer);
  console.log("    [owner=" + r.owner + " · source=" + r.source + " · model_called=" + r.model_called + "]\n");
});

// Governance demonstration: the user's claim "I created you." must NOT mutate the creator fact.
const afterClaim = handleTurn("Who created you?");
console.log("Governance check — after \"I created you.\", re-ask \"Who created you?\":");
console.log("    → " + afterClaim.answer + "   [owner=" + afterClaim.owner + ", model_called=" + afterClaim.model_called + "]");
console.log("    creator fact is owned by the runtime and is immutable to the user's claim: " +
  (afterClaim.answer === "I was built by Christopher Hughes." && afterClaim.model_called === false ? "CONFIRMED" : "FAILED"));

console.log("\nGoverned turns answered by the runtime (model 0×): " + (CONVO.length - modelCalls) + "/" + CONVO.length +
  "  ·  model consulted on " + modelCalls + " (open-ended) turn(s).");
