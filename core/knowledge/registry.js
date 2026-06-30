/* ============================================================================
   AUBS KNOWLEDGE LAYER — pack registry + proof classes (the rail)
   Truth · Safety · We Got Your Back

   A Knowledge Pack is OWNED runtime corpus data with a DECLARED proof class. The
   registry holds packs and enforces one law: a pack may never answer above its
   declared class. Owning a corpus does not make it TRUE — it makes it CITED.

   PROOF_CLASS mirrors the Trust OS five-strength taxonomy:
     self_verifiable (✓) — closed-world membership/lookup, answered with certainty (model 0×)
     runtime_attested (~) — the runtime vouches (e.g. a curated table)
     grounded         (~) — supported by a retrievable source passage ("according to <source>")
     model_inferred   (≈) — the model produced it
     unsupported      (⚠) — no backing

   Pack contract:
     { id, name, version, proof_class, count, source, license,
       respond(q) -> { answer, proof:{class,source,model_called:false}, factId } | null }

   Environment-agnostic: module.exports (Node) or window.AUBS_KNOWLEDGE.
   ========================================================================== */
(function () {
  "use strict";

  var PROOF_CLASS = {
    SELF_VERIFIABLE: "self_verifiable",
    RUNTIME_ATTESTED: "runtime_attested",
    GROUNDED: "grounded",
    MODEL_INFERRED: "model_inferred",
    UNSUPPORTED: "unsupported"
  };
  // Rank for the no-silent-upgrade guard (higher = stronger). A pack's answer proof may not
  // exceed the pack's declared class.
  var RANK = { unsupported: 0, model_inferred: 1, grounded: 2, runtime_attested: 3, self_verifiable: 4 };

  var packs = Object.create(null);

  function register(pack) {
    if (!pack || !pack.id) throw new Error("knowledge: pack needs an id");
    if (!pack.proof_class || !(pack.proof_class in RANK)) throw new Error("knowledge: pack '" + pack.id + "' has no valid proof_class");
    packs[pack.id] = pack;
    return pack;
  }
  function get(id) { return packs[id] || null; }
  function list() { return Object.keys(packs); }

  // Ask every registered pack in turn; the FIRST that answers wins. Each answer's proof.class is
  // clamped to the pack's declared class (a pack can never silently upgrade its own strength).
  function ask(q) {
    var ids = Object.keys(packs);
    for (var i = 0; i < ids.length; i++) {
      var p = packs[ids[i]];
      if (!p.respond) continue;
      var r = p.respond(q);
      if (r && r.answer != null) {
        var cls = (r.proof && r.proof.class) || p.proof_class;
        if (RANK[cls] > RANK[p.proof_class]) cls = p.proof_class;   // clamp — never upgrade
        return {
          answer: r.answer,
          factId: r.factId || ("knowledge:" + p.id),
          pack: p.id,
          proof: { class: cls, source: (r.proof && r.proof.source) || p.source || p.name, model_called: false }
        };
      }
    }
    return null;
  }

  var API = { PROOF_CLASS: PROOF_CLASS, RANK: RANK, register: register, get: get, list: list, ask: ask };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KNOWLEDGE = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_KNOWLEDGE = API;
})();
