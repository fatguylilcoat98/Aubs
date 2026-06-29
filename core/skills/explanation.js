/* ============================================================================
   AUBS Constitutional Skills Framework — skill "Why?" (M11)
   Truth · Safety · We Got Your Back

   Derived ENTIRELY from a recorded DecisionRecord — never from model output. States the
   skill used, the resources requested / approved / blocked, the policy decision, whether
   anything left the device, and whether confirmation was required.
   ========================================================================== */
(function () {
  "use strict";

  function skillWhy(record) {
    var e = (record && record.explanation) || {};
    var why;
    if (e.decision !== "allow") why = "Blocked by policy (" + (e.decision || "?") + ").";
    else if (e.eligibility_reasons && e.eligibility_reasons.length) why = "Blocked: " + e.eligibility_reasons.join(", ") + ".";
    else why = "Governance allowed it and every requested resource was eligible.";
    var blocked = (e.blocked_resources || []).map(function (b) { return b.resource + " (" + b.reason + ")"; });
    var d = {
      skill_used: e.skill_id || null,
      operation: e.operation || null,
      status: e.status || null,
      risk_level: e.risk_level || null,
      resources_requested: e.required_resources || [],
      resources_approved: e.approved_resources || [],
      resources_blocked: blocked,
      policy_decision: e.decision === "allow" ? "Allowed." : (e.decision ? cap(e.decision) + "." : "Unknown."),
      why_permitted: why,
      data_left_device: e.left_device ? "Yes." : "No.",
      user_approval_required: e.requires_user_confirmation ? ("Yes (" + (e.approval_path || "") + ").") : "No."
    };
    d.text = "Skill used: " + (d.skill_used || "none") + "\n" +
             "Resources requested: " + (d.resources_requested.join(", ") || "none") + "\n" +
             "Resources approved: " + (d.resources_approved.join(", ") || "none") + "\n" +
             "Resources blocked: " + (d.resources_blocked.join(", ") || "none") + "\n" +
             "Policy decision: " + d.policy_decision + "\n" +
             "Anything left device: " + d.data_left_device + "\n" +
             "User approval required: " + d.user_approval_required;
    return d;
  }
  function cap(s) { s = String(s == null ? "" : s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var API = { skillWhy: skillWhy };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_EXPL = API;
})();
