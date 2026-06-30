/* AUBS Knowledge Pack #2 (Definitions) — Class 2, grounded/CITED.
   Proves the runtime owns a DICTIONARY and answers from it, model 0×, but at the HONEST proof
   strength: owning a corpus makes it CITED, not TRUE. Every answer cites its source and carries
   proof class "grounded" (never self_verifiable). Unknown words get an honest cited absence, not
   an invented definition. The registry CLAMPS proof strength so a Class-2 pack can never wear a
   Class-1 badge. Usage: node tests/run-knowledge-definitions.cjs */
"use strict";
const DEF = require("../core/knowledge/definitions.js");
const K = require("../core/knowledge/registry.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const TSV = [
  "cat\tA small domesticated carnivore.",
  "democracy\tGovernment by the people.",
  "xylophone\tA musical instrument of wooden bars."
].join("\n") + "\n";
const def = DEF.buildDefinitions(TSV, { name: "Webster's Dictionary (1913)", version: "test", cite: "Webster's Dictionary (1913)" });

// ── builder + lookup ────────────────────────────────────────────────────────────────────────
t("builder count", def.count === 3);
t("define returns the gloss", def.define("CAT") === "A small domesticated carnivore.");
t("define unknown → null", def.define("zzzq") === null);
t("pack declares proof_class grounded (NOT self_verifiable)", def.proof_class === "grounded");

// ── responder: CITED, grounded, model 0× ────────────────────────────────────────────────────
{
  const a = def.respond("what does democracy mean?");
  t("'what does democracy mean' → cited answer, grounded, model 0×",
    a && /According to Webster's Dictionary \(1913\), "democracy" means: Government by the people\./.test(a.answer)
    && a.proof.class === "grounded" && a.proof.model_called === false);
  t("'define xylophone' → cited", /According to Webster's/.test(def.respond("define xylophone").answer));
  t("'meaning of cat' → cited", /"cat" means:/.test(def.respond("meaning of cat").answer));
  // unknown word, clear define intent → honest cited absence (NOT invented, NOT null)
  const miss = def.respond("what does zzzq mean?");
  t("unknown define → honest 'I don't have a definition', NOT invented", miss && /don't have a definition for "zzzq"/.test(miss.answer) && miss.factId === "definition:miss");
  // filler / non-define → null (falls through; "what does it mean" is resolved upstream by context)
  t("'what does it mean' → null here (resolved upstream from context, not invented)", def.respond("what does it mean?") === null);
  t("non-definition question → null", def.respond("is cat a word?") === null);
}

// ── registry interplay + the no-silent-upgrade clamp ────────────────────────────────────────
{
  K.register(def);
  const r = K.ask("define democracy");
  t("registry routes a definition query to the pack, model 0×", r && r.pack === "definitions" && r.proof.model_called === false);
  t("registry answer keeps the GROUNDED class (cited, not upgraded to self-verifiable)", r.proof.class === "grounded");
  t("grounded is strictly weaker than self_verifiable (honest ranking)", K.RANK.grounded < K.RANK.self_verifiable);
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Knowledge Pack #2 (definitions): runtime owns a dictionary; answers are CITED + grounded (never self-verifiable), model 0×; unknown words are honest, not invented; registry clamps proof strength.");
process.exit(0);
