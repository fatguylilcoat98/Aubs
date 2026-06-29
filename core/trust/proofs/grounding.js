/* ============================================================================
   AUBS TRUST OS — Grounding Proof (Layer 4, §4.3)
   Truth · Safety · We Got Your Back

   Claims: each bound factual claim is restorable to a cited source; unsupported ones are
   flagged (never hidden).
   Verified: deterministic, OFFLINE, NO MODEL — extract-then-restore against the carried
   source spans, in tiers:
     T0 exact      — claim text appears verbatim in a source span
     T1 normalized — lowercased, punctuation-stripped, whitespace-collapsed substring
     T2 token-subset — every content token of the claim appears in one source span
   A claim restorable at any tier → self-verifiable ✓ (with the tier noted). A claim
   restorable at none → unsupported ⚠ ("model-asserted, not verified").

   The model-assisted tier (NLI / "T3") is intentionally NOT implemented here: it would be
   graded model-inferred and EXCLUDED from this zero-trust proof. Facts only; reasoning,
   synthesis and opinion stay in free language, marked unverified by absence of a claim.

   Built off to the side. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("../strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("../trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);

  var STOP = { the:1,a:1,an:1,is:1,are:1,was:1,were:1,be:1,to:1,of:1,in:1,on:1,for:1,and:1,or:1,it:1,its:1,that:1,this:1,with:1,as:1,at:1,by:1,from:1,"":1 };
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function tokens(s) { return norm(s).split(" ").filter(function (w) { return w.length > 2 && !STOP[w]; }); }

  // Returns { tier, source_id } if restorable, else null. Deterministic, model-free.
  function restore(claimText, sources) {
    for (var i = 0; i < sources.length; i++) {        // T0 exact (verbatim)
      if (String(sources[i].span || "").indexOf(claimText) >= 0) return { tier: "T0-exact", source_id: sources[i].id };
    }
    var nc = norm(claimText);
    for (var j = 0; j < sources.length; j++) {        // T1 normalized substring
      if (nc && norm(sources[j].span).indexOf(nc) >= 0) return { tier: "T1-normalized", source_id: sources[j].id };
    }
    var ct = tokens(claimText);                        // T2 token-subset
    if (ct.length) {
      for (var k = 0; k < sources.length; k++) {
        var st = {}; tokens(sources[k].span).forEach(function (w) { st[w] = 1; });
        if (ct.every(function (w) { return st[w]; })) return { tier: "T2-token-subset", source_id: sources[k].id };
      }
    }
    return null;
  }

  // input: { claims: [{id?, text}], sources: [{id, span}] }
  function buildGroundingProof(input) {
    input = input || {};
    var sources = input.sources || [];
    var claimsIn = input.claims || [];
    var out = [], restorable = 0, unsupported = 0;
    claimsIn.forEach(function (c) {
      var r = restore(c.text, sources);
      if (r) {
        restorable++;
        out.push(S.claim("\"" + c.text + "\" restorable to source " + r.source_id + " (" + r.tier + ").", [r.source_id], S.SELF_VERIFIABLE, "facts only; offline restore, no model"));
      } else {
        unsupported++;
        out.push(S.claim("\"" + c.text + "\" has no source — model-asserted, not verified.", [], S.UNSUPPORTED, "flagged, never hidden"));
      }
    });
    return TR.proof(out, { restorable: restorable, unsupported: unsupported, total: claimsIn.length, all_restorable: unsupported === 0 });
  }

  var API = { buildGroundingProof: buildGroundingProof, restore: restore };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_PROOF_GROUNDING = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_PROOF_GROUNDING = API;
})();
