/* ============================================================================
   AUBS KNOWLEDGE PACK #2 — Definitions (Class 2, grounded/CITED)
   Truth · Safety · We Got Your Back

   A dictionary the runtime owns. Unlike the lexicon (Class 1, self-verifiable:
   "is X a word" is CERTAIN), a definition is Class 2: the runtime owns a SOURCE,
   not the truth. So every answer is CITED — "According to <source>, X means: …" —
   and carries proof class GROUNDED, never self-verifiable. Owning a corpus makes
   it CITED, not TRUE. If a word isn't in the dictionary it says so honestly,
   rather than letting the model invent a definition.

   Data: Webster's Unabridged Dictionary (1913, public domain). Built from TSV
   ("<lowercase word>\t<gloss>" per line). Deterministic, model-free.

   Environment-agnostic: module.exports (Node) or window.AUBS_DEFINITIONS.
   ========================================================================== */
(function () {
  "use strict";

  function buildDefinitions(tsv, manifest) {
    manifest = manifest || {};
    var map = Object.create(null), count = 0;
    var lines = String(tsv || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]; if (!line) continue;
      var tab = line.indexOf("\t"); if (tab < 1) continue;
      var w = line.slice(0, tab).trim().toLowerCase();
      var g = line.slice(tab + 1).trim();
      if (w && g && !map[w]) { map[w] = g; count++; }
    }
    return makePack(map, count, manifest);
  }

  function makePack(map, count, manifest) {
    manifest = manifest || {};
    var name = manifest.name || "Webster's Dictionary (1913)";
    var version = manifest.version || "webster-1913";
    var cite = manifest.cite || name;
    // GROUNDED, never self-verifiable: the runtime owns a source, not the truth.
    var PROOF = { class: "grounded", source: cite, model_called: false };

    function define(w) { return map[String(w || "").trim().toLowerCase()] || null; }

    // Extract the word being asked about (excluding filler pronouns — "what does it mean" is
    // resolved upstream from context, not here).
    var FILLER = { it: 1, this: 1, that: 1, these: 1, those: 1, one: 1 };
    function subject(s) {
      var m;
      if ((m = s.match(/\bwhat\s+(?:does|do)\s+["']?([a-zA-Z][a-zA-Z'-]*)["']?\s+mean\b/i))
        || (m = s.match(/\b(?:define|definition\s+of|meaning\s+of|what'?s\s+the\s+meaning\s+of|what\s+is\s+the\s+(?:definition|meaning)\s+of)\s+["']?([a-zA-Z][a-zA-Z'-]*)["']?/i))) {
        if (FILLER[m[1].toLowerCase()]) return null;
        return m[1];
      }
      return null;
    }

    // Detector + responder. Returns { answer, proof, factId } | null.
    function respond(q) {
      var s = String(q || "");
      var w = subject(s);
      if (!w) return null;
      var lw = w.toLowerCase();
      var g = define(lw);
      if (g) return { answer: "According to " + cite + ", \"" + lw + "\" means: " + g, proof: PROOF, factId: "definition:" + lw };
      // Clear "define X" with no entry → honest cited absence, NOT a model-invented definition.
      return { answer: "I don't have a definition for \"" + lw + "\" in " + cite + ".", proof: PROOF, factId: "definition:miss" };
    }

    return {
      id: "definitions", name: name, version: version, proof_class: "grounded",
      count: count, source: cite, license: "public domain (Webster's 1913)",
      define: define, respond: respond, subject: subject, proof: PROOF
    };
  }

  var API = { buildDefinitions: buildDefinitions, makePack: makePack };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_DEFINITIONS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_DEFINITIONS = API;
})();
