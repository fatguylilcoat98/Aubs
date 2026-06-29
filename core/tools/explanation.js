/* ============================================================================
   AUBS Constitutional Tool Framework — tool "Why?" (Milestone 10)
   Truth · Safety · We Got Your Back

   The tool explanation, derived ENTIRELY from a recorded DecisionRecord — never generated
   by an LLM. States the tool used, why it was permitted, which permission allowed it,
   whether the network was used, and whether user approval was required.
   ========================================================================== */
(function () {
  "use strict";

  function toolWhy(record) {
    var e = (record && record.explanation) || {};
    var blocked = e.decision !== "allow" || (e.eligibility_reasons && e.eligibility_reasons.length > 0);
    var why;
    if (e.decision !== "allow") why = "Blocked by policy (" + (e.decision || "?") + ").";
    else if (e.eligibility_reasons && e.eligibility_reasons.length) why = "Blocked: " + e.eligibility_reasons.join(", ") + ".";
    else why = "Governance allowed it and the tool was eligible.";
    var d = {
      tool_used: e.tool_id || null,
      operation: e.operation || null,
      status: e.status || null,
      why_permitted: why,
      permission_that_allowed_it: (e.permission_set && e.permission_set.length) ? e.permission_set.join(", ") : "none required",
      network_used: e.network_used ? "Yes." : "No.",
      user_approval_required: e.requires_user_confirmation ? ("Yes (" + (e.approval_path || "") + ").") : "No.",
      blocked: !!blocked
    };
    d.text = "Tool used: " + (d.tool_used || "none") + "\n" +
             "Why permitted: " + d.why_permitted + "\n" +
             "Permission that allowed it: " + d.permission_that_allowed_it + "\n" +
             "Network used: " + d.network_used + "\n" +
             "User approval required: " + d.user_approval_required;
    return d;
  }

  var API = { toolWhy: toolWhy };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_EXPL = API;
})();
