/* ============================================================================
   AUBS TRUST OS — Proof-Strength Taxonomy (Layer 2) — HARD LAW
   Truth · Safety · We Got Your Back

   The spine of the architecture (§3). Strength attaches to INDIVIDUAL CLAIMS, not to
   pillars — one pillar routinely mixes strengths (see Decision Proof). Five strengths,
   strongest → weakest, each with a VISUALLY DISTINCT badge (§8). A self-verifiable ✓
   and a runtime-attested ~ may never look alike: the moment they do, an estimate is
   wearing a proof badge.

   Every claim must declare FOUR things (§3): what is claimed, what evidence supports
   it, what strength class it is, and what its limits are. `claim()` enforces this.

   Honesty guards (enforced, not aspirational):
     - rejection rationale / cost estimates may NEVER be self-verifiable;
     - model-assisted output may never be self-verifiable;
     - "nothing leaked" is not a claimable string.

   Environment-agnostic: module.exports (Node) or window.AUBS_STRENGTHS.
   ========================================================================== */
(function () {
  "use strict";

  // The five canonical strengths. Order = strongest → weakest.
  var SELF_VERIFIABLE = "self-verifiable";
  var RUNTIME_ATTESTED = "runtime-attested";
  var MODEL_INFERRED = "model-inferred";
  var USER_ASSERTED = "user-asserted";
  var UNSUPPORTED = "unsupported";

  var RANK = {};
  RANK[SELF_VERIFIABLE] = 5; RANK[RUNTIME_ATTESTED] = 4; RANK[MODEL_INFERRED] = 3; RANK[USER_ASSERTED] = 2; RANK[UNSUPPORTED] = 1;

  // Visually-distinct badges (the §8 law). Asserted unique by the validator.
  var BADGE = {};
  BADGE[SELF_VERIFIABLE] = "✓";   // ✓
  BADGE[RUNTIME_ATTESTED] = "~";       // ~
  BADGE[MODEL_INFERRED] = "≈";    // ≈
  BADGE[USER_ASSERTED] = "•";     // •
  BADGE[UNSUPPORTED] = "⚠";       // ⚠

  var LABEL = {};
  LABEL[SELF_VERIFIABLE] = "self-verifiable"; LABEL[RUNTIME_ATTESTED] = "runtime-attested";
  LABEL[MODEL_INFERRED] = "model-inferred"; LABEL[USER_ASSERTED] = "user-asserted"; LABEL[UNSUPPORTED] = "unsupported";

  var ALL = [SELF_VERIFIABLE, RUNTIME_ATTESTED, MODEL_INFERRED, USER_ASSERTED, UNSUPPORTED];

  function isCanonical(s) { return Object.prototype.hasOwnProperty.call(RANK, s); }

  // Domain proofs may carry a qualified FORM (e.g. egress "sealed-door") that still maps to
  // one of the five badge classes. normalize() returns { strength, form }.
  function normalize(s) {
    if (isCanonical(s)) return { strength: s, form: null };
    if (s === "egress-attested:sealed-door") return { strength: RUNTIME_ATTESTED, form: "sealed-door" };
    if (s === "egress-attested" || s === "filtered-egress") return { strength: RUNTIME_ATTESTED, form: "filtered" };
    return { strength: null, form: null };   // unknown → invalid (caller fails closed)
  }

  function badge(s) { var n = normalize(s); return n.strength ? BADGE[n.strength] : "?"; }
  function rank(s) { var n = normalize(s); return n.strength ? RANK[n.strength] : 0; }

  // A Claim is the atomic unit: the four declared things + optional form.
  // Throws on a missing field or a non-canonical strength — you cannot build a claim
  // that doesn't declare its strength.
  function claim(what, evidence, strength, limits, opts) {
    opts = opts || {};
    var n = normalize(strength);
    if (!n.strength) throw new Error("claim: invalid/undeclared strength: " + strength);
    if (typeof what !== "string" || !what) throw new Error("claim: 'what is claimed' is required");
    if (evidence === undefined || evidence === null) throw new Error("claim: 'evidence' is required (use [] or a note, never omit)");
    if (typeof limits !== "string") throw new Error("claim: 'limits' is required (state them, even if 'none')");
    // honesty guards
    if (n.strength === SELF_VERIFIABLE && opts.estimate === true)
      throw new Error("claim: an estimate/counterfactual may never be self-verifiable");
    if (n.strength === SELF_VERIFIABLE && opts.modelAssisted === true)
      throw new Error("claim: model-assisted output may never be self-verifiable");
    if (/\bnothing (?:else )?(?:leaked|left)\b/i.test(what) && n.form !== "sealed-door")
      throw new Error("claim: 'nothing leaked' is not claimable except as the sealed-door form");
    return { what: what, evidence: evidence, strength: n.strength, form: n.form, limits: limits, badge: BADGE[n.strength] };
  }

  // HARD-LAW check on a set of claims: every one declares a canonical strength, and the
  // five badges are distinct (so a self-verifiable ✓ can never look like a runtime ~).
  function validateClaims(claims) {
    var issues = [];
    (claims || []).forEach(function (c, i) {
      if (!c || !isCanonical(c.strength)) issues.push({ at: i, type: "missing_or_invalid_strength" });
      if (c && !c.badge) issues.push({ at: i, type: "missing_badge" });
      if (c && typeof c.limits !== "string") issues.push({ at: i, type: "missing_limits" });
      // a claim's badge MUST match its strength — no estimate wearing a borrowed ✓.
      if (c && isCanonical(c.strength) && c.badge && c.badge !== BADGE[c.strength]) issues.push({ at: i, type: "badge_strength_mismatch" });
    });
    var badges = ALL.map(function (s) { return BADGE[s]; });
    if (new Set(badges).size !== ALL.length) issues.push({ type: "badges_not_distinct" });
    return { ok: issues.length === 0, issues: issues };
  }

  var API = {
    SELF_VERIFIABLE: SELF_VERIFIABLE, RUNTIME_ATTESTED: RUNTIME_ATTESTED, MODEL_INFERRED: MODEL_INFERRED,
    USER_ASSERTED: USER_ASSERTED, UNSUPPORTED: UNSUPPORTED, ALL: ALL,
    RANK: RANK, BADGE: BADGE, LABEL: LABEL,
    isCanonical: isCanonical, normalize: normalize, badge: badge, rank: rank,
    claim: claim, validateClaims: validateClaims
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_STRENGTHS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_STRENGTHS = API;
})();
