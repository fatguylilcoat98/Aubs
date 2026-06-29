/* ============================================================================
   AUBS TRUST OS — Glass Box (Layer 9, §8)
   Truth · Safety · We Got Your Back

   One answer → one Trust Record → a lightly-exposed UI. The UI NEVER invents; it only
   displays the record.

   - Easy (plain English, most users stop here): one sentence composed ONLY from record fields.
   - Detailed (tabs, each pillar with a visible strength badge): Overview · Decision · Grounding
     · Privacy · Memory · Integrity · Provenance · Ledger.

   The §8 law, enforced at render time: every rendered claim shows its badge, and the five
   badges are visually distinct. render() REFUSES to display a claim with no badge — an
   estimate can never sneak through wearing nothing (or a borrowed ✓).

   Returns structured data the UI paints; no DOM here. Environment-agnostic.
   ========================================================================== */
(function () {
  "use strict";
  var S = (typeof require !== "undefined") ? require("./strengths.js") : (typeof window !== "undefined" ? window.AUBS_STRENGTHS : null);
  var TR = (typeof require !== "undefined") ? require("./trust-record.js") : (typeof window !== "undefined" ? window.AUBS_TRUST_RECORD : null);

  function renderClaim(c) {
    if (!c || !c.badge || !S.isCanonical(c.strength)) throw new Error("glass-box: refusing to render a claim with no/invalid strength badge");
    // The render boundary is the last line before a user sees a badge. A claim whose badge does
    // not match its strength is an estimate wearing a borrowed ✓ — refuse it.
    if (c.badge !== S.BADGE[c.strength]) throw new Error("glass-box: badge does not match strength ('" + c.strength + "' must render '" + S.BADGE[c.strength] + "', not '" + c.badge + "')");
    return { text: c.what, badge: c.badge, strength: c.strength, limits: c.limits, form: c.form || null };
  }
  function renderSlot(proof) { return (proof && proof.claims ? proof.claims : []).map(renderClaim); }

  // Easy: one honest sentence, built ONLY from the record.
  function easy(record) {
    var bits = [];
    if (record.decision && record.decision.selected) {
      bits.push("AUBS used " + record.decision.selected + ".");
    } else if (record.decision === null) {
      bits.push("AUBS answered from its own runtime — the model was not used.");
    }
    if (record.privacy && record.privacy.claims && record.privacy.claims[0]) {
      bits.push(record.privacy.claims[0].what);
    }
    if (record.grounding && typeof record.grounding.unsupported === "number" && record.grounding.unsupported > 0) {
      bits.push(record.grounding.unsupported + " claim(s) flagged unverified.");
    }
    return bits.join(" ");
  }

  function render(record, opts) {
    opts = opts || {};
    // validate the record before showing anything (no rendering an invalid record).
    var v = TR.validateTrustRecord(record);
    if (!v.ok) throw new Error("glass-box: refusing to render an invalid Trust Record: " + JSON.stringify(v.issues));

    if (opts.mode === "easy") return { mode: "easy", text: easy(record) };

    var detailed = {
      mode: "detailed",
      overview: { summary: TR.summarize(record), strengths: record.strength_summary },
      tabs: {
        Decision: renderSlot(record.decision),
        Grounding: renderSlot(record.grounding),
        Privacy: renderSlot(record.privacy),
        Memory: renderSlot(record.memory),
        Integrity: renderSlot(record.integrity),
        Provenance: renderSlot(record.provenance)
      },
      trace: record.trace || null,
      ledger: { seq: record.seq, record_hash: record.record_hash, signature: record.signature, intent_id: record.intent_id },
      // the badge legend the UI must render visually-distinct (the §8 law)
      legend: S.ALL.map(function (s) { return { strength: s, badge: S.BADGE[s], label: S.LABEL[s] }; })
    };
    return detailed;
  }

  var API = { render: render, easy: easy, renderClaim: renderClaim };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_GLASS_BOX = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_GLASS_BOX = API;
})();
