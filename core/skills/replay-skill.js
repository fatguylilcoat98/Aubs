/* ============================================================================
   AUBS Constitutional Skills Framework — skill replay / drift (M11)
   Truth · Safety · We Got Your Back

   A skill run is replayable: capture the skill's manifest fingerprint at decision time,
   then detect — WITHOUT re-running the skill — whether it was removed, its version /
   permissions / provider / tool / memory-scope requirements changed, or policy drifted.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var GEL = isNode ? require("../gel") : (typeof window !== "undefined" ? window.AUBS_GEL : null);

  function captureSkillEvidence(execResult) {
    var rec = (execResult && execResult.record) || {};
    var e = rec.explanation || {};
    function pick(prefix) { return (e.required_resources || []).filter(function (r) { return r.indexOf(prefix) === 0; }).map(function (r) { return r.slice(prefix.length); }); }
    return {
      skill_id: e.skill_id, skill_version: e.skill_version,
      required_permissions: (e.required_permissions || []).slice(),
      provider_requirements: pick("provider:"),
      tool_requirements: pick("tool:"),
      memory_scope_requirements: pick("memory:"),
      policy_version: rec.policy_version || null
    };
  }
  function sameArr(a, b) { return JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort()); }
  function manifestReqs(skill, prefixArr) { return prefixArr; }

  // compareSkill(evidence, { registry, currentBundle }) → { status, reasons, diffs }. No re-run.
  function compareSkill(evidence, opts) {
    opts = opts || {}; var reasons = {}, diffs = [];
    function add(r, d) { reasons[r] = true; diffs.push(d); }
    if (opts.currentBundle && GEL && GEL.bundleHash && evidence.policy_version) {
      if (GEL.bundleHash(opts.currentBundle) !== evidence.policy_version) add("policy_drift", { from: evidence.policy_version, to: GEL.bundleHash(opts.currentBundle) });
    }
    var cur = (opts.registry && opts.registry.getSkill) ? opts.registry.getSkill(evidence.skill_id) : null;
    if (!cur) { add("skill_removed", { skill_id: evidence.skill_id }); return finish(reasons, diffs); }
    if (cur.version !== evidence.skill_version) add("skill_version_changed", { from: evidence.skill_version, to: cur.version });
    if (!sameArr(cur.required_permissions, evidence.required_permissions)) add("permissions_changed", { from: evidence.required_permissions, to: cur.required_permissions });
    if (!sameArr(cur.allowed_providers, evidence.provider_requirements)) add("provider_requirement_changed", { from: evidence.provider_requirements, to: cur.allowed_providers });
    if (!sameArr(cur.allowed_tools, evidence.tool_requirements)) add("tool_requirement_changed", { from: evidence.tool_requirements, to: cur.allowed_tools });
    if (!sameArr(cur.allowed_memory_scopes, evidence.memory_scope_requirements)) add("memory_scope_requirement_changed", { from: evidence.memory_scope_requirements, to: cur.allowed_memory_scopes });
    return finish(reasons, diffs);
  }
  function finish(reasons, diffs) { var list = Object.keys(reasons); return { status: list.length ? "DRIFT" : "MATCH", reasons: list, diffs: diffs }; }

  var API = { captureSkillEvidence: captureSkillEvidence, compareSkill: compareSkill };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_REPLAY = API;
})();
