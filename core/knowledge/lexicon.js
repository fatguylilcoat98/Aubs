/* ============================================================================
   AUBS KNOWLEDGE PACK #1 — Lexicon (Class 1, self-verifiable)
   Truth · Safety · We Got Your Back

   A closed-world word list the runtime OWNS. "Is X a word?" is answered with
   CERTAINTY, model 0× — the same trust tier as identity/date/memory. It also
   does a deterministic did-you-mean (edit-distance-1 candidates drawn FROM the
   set) and reports how many words it knows. No definitions (a word list is not a
   dictionary) — those would be a separate Class-2 pack with grounded proof.

   Data: dwyl/english-words (Unlicense). Built from newline-separated text
   (LF or CRLF), lowercased, de-duplicated. Deterministic, model-free.

   Environment-agnostic: module.exports (Node) or window.AUBS_LEXICON.
   ========================================================================== */
(function () {
  "use strict";

  // Build a lexicon pack from newline-separated word text.
  function buildLexicon(text, manifest) {
    manifest = manifest || {};
    var set = Object.create(null), count = 0;
    var lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var w = lines[i].trim().toLowerCase();
      if (w && !set[w]) { set[w] = 1; count++; }
    }
    return makePack(set, count, manifest);
  }

  function makePack(set, count, manifest) {
    manifest = manifest || {};
    var name = manifest.name || "AUBS lexicon";
    var version = manifest.version || "words_alpha";
    var source = name + " (" + version + ", " + count + " words)";
    var PROOF = { class: "self_verifiable", source: source, model_called: false };

    function isWord(w) { return !!set[String(w || "").trim().toLowerCase()]; }

    // Deterministic edit-distance-1 suggestions, drawn ONLY from the owned set. Bounded.
    function suggest(w, limit) {
      w = String(w || "").trim().toLowerCase(); limit = limit || 3;
      if (!w || isWord(w)) return [];
      var out = [], seen = Object.create(null), alpha = "abcdefghijklmnopqrstuvwxyz";
      function cand(c) { if (c && c !== w && !seen[c] && set[c]) { seen[c] = 1; out.push(c); } }
      for (var i = 0; i < w.length; i++) cand(w.slice(0, i) + w.slice(i + 1));                 // deletion
      for (var j = 0; j <= w.length; j++) for (var a = 0; a < 26; a++) {
        cand(w.slice(0, j) + alpha[a] + w.slice(j));                                           // insertion
        if (j < w.length) cand(w.slice(0, j) + alpha[a] + w.slice(j + 1));                     // substitution
      }
      for (var t = 0; t < w.length - 1; t++) cand(w.slice(0, t) + w[t + 1] + w[t] + w.slice(t + 2)); // transposition
      out.sort(function (x, y) { return Math.abs(x.length - w.length) - Math.abs(y.length - w.length) || (x < y ? -1 : 1); });
      return out.slice(0, limit);
    }

    // Detector + responder. Returns { answer, proof, factId } | null.
    function respond(q) {
      var s = String(q || ""), m;
      if (/\bhow many words (?:do you|does aubs|do u)\s+(?:know|have)\b/i.test(s)
        || /\bhow (?:big|large) is your (?:dictionary|lexicon|vocabulary|word ?list)\b/i.test(s))
        return { answer: "I know " + count.toLocaleString() + " English words.", proof: PROOF, factId: "lexicon:count" };

      if ((m = s.match(/\bis\s+["']?([a-zA-Z][a-zA-Z'-]*)["']?\s+(?:a\s+)?(?:real\s+|valid\s+|english\s+)?word\b/i))
        || (m = s.match(/\bis\s+["']?([a-zA-Z][a-zA-Z'-]*)["']?\s+spelled\s+(?:right|correctly)\b/i))
        || (m = s.match(/\bis\s+["']?([a-zA-Z][a-zA-Z'-]*)["']?\s+in\s+(?:the\s+|your\s+)?dictionary\b/i))) {
        var w = m[1].toLowerCase();
        if (isWord(w)) return { answer: "Yes — \"" + w + "\" is a word.", proof: PROOF, factId: "lexicon:isword" };
        var sg = suggest(w);
        return { answer: "No — \"" + w + "\" isn't in my dictionary." + (sg.length ? (" Did you mean: " + sg.join(", ") + "?") : ""), proof: PROOF, factId: "lexicon:isword" };
      }
      return null;
    }

    return {
      id: "lexicon", name: name, version: version, proof_class: "self_verifiable",
      count: count, source: source, license: "Unlicense (dwyl/english-words)",
      isWord: isWord, has: isWord, suggest: suggest, respond: respond, proof: PROOF
    };
  }

  var API = { buildLexicon: buildLexicon, makePack: makePack };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_LEXICON = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_LEXICON = API;
})();
