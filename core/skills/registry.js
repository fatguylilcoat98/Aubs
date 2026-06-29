/* ============================================================================
   AUBS Constitutional Skills Framework — registry + manifest validation (M11)
   Truth · Safety · We Got Your Back

   A skill is a declared, governed capability. Registration FAILS CLOSED: duplicate ids,
   invalid manifests, undeclared permissions, unknown tools/providers, unknown memory scopes,
   and missing operations are rejected. Skills never execute resources — they declare and
   request them; only the kernel executes.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC     = isNode ? require("../cac")               : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var SCHEMA  = isNode ? require("./skill.schema.json")  : (typeof window !== "undefined" ? window.AUBS_SKILL_SCHEMA : null);
  var TPERMS  = isNode ? require("../tools/permissions") : (typeof window !== "undefined" ? window.AUBS_TOOL_PERMS : null);
  var MTYPES  = isNode ? require("../memory/types")      : (typeof window !== "undefined" ? window.AUBS_MEMORY_TYPES : null);

  var MANIFEST_KEYS = ["skill_id", "name", "version", "description", "inputs", "outputs", "required_permissions",
    "allowed_tools", "allowed_providers", "allowed_memory_scopes", "requires_network", "requires_user_confirmation",
    "risk_level", "supported_operations", "enabled", "metadata"];

  function manifestOf(skill) {
    var m = {};
    MANIFEST_KEYS.forEach(function (k) { if (skill[k] !== undefined) m[k] = skill[k]; });
    return m;
  }

  // validateSkill(skill, { toolRegistry, providerRegistry }) → { ok, issues:[...] }
  function validateSkill(skill, opts) {
    opts = opts || {}; var issues = [];
    if (!skill || typeof skill !== "object") return { ok: false, issues: [{ key: "skill", problem: "missing or not an object" }] };
    var v = CAC.validate.validate(SCHEMA, manifestOf(skill));
    if (!v.valid) v.errors.forEach(function (e) { issues.push({ key: "manifest", problem: e }); });
    if (typeof skill.execute !== "function") issues.push({ key: "execute", problem: "must be a function (deterministic, no dynamic code)" });
    // undeclared permissions (must be tool permission categories)
    (skill.required_permissions || []).forEach(function (p) { if (TPERMS.PERMISSION_CATEGORIES.indexOf(p) === -1) issues.push({ key: "required_permissions", problem: "unknown permission '" + p + "'" }); });
    // unknown memory scopes
    (skill.allowed_memory_scopes || []).forEach(function (s) { if (MTYPES.SCOPES.indexOf(s) === -1) issues.push({ key: "allowed_memory_scopes", problem: "unknown scope '" + s + "'" }); });
    // unknown tools / providers (cross-checked against the supplied registries)
    if (opts.toolRegistry) (skill.allowed_tools || []).forEach(function (t) { if (!opts.toolRegistry.has(t)) issues.push({ key: "allowed_tools", problem: "unknown tool '" + t + "'" }); });
    if (opts.providerRegistry) (skill.allowed_providers || []).forEach(function (p) { if (!opts.providerRegistry.has(p)) issues.push({ key: "allowed_providers", problem: "unknown provider '" + p + "'" }); });
    if (!Array.isArray(skill.supported_operations) || skill.supported_operations.length === 0) issues.push({ key: "supported_operations", problem: "non-empty array required" });
    return { ok: issues.length === 0, issues: issues };
  }

  function createSkillRegistry(opts) {
    opts = opts || {}; var byId = {};
    function registerSkill(skill) {
      var v = validateSkill(skill, opts);
      if (!v.ok) return { ok: false, error: "invalid skill manifest", issues: v.issues };
      if (Object.prototype.hasOwnProperty.call(byId, skill.skill_id)) return { ok: false, error: "duplicate skill_id: " + skill.skill_id };
      byId[skill.skill_id] = skill;
      return { ok: true, skill_id: skill.skill_id };
    }
    function removeSkill(id) { if (!Object.prototype.hasOwnProperty.call(byId, id)) return { ok: false, error: "not registered" }; delete byId[id]; return { ok: true, skill_id: id }; }
    function getSkill(id) { return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null; }
    function has(id) { return Object.prototype.hasOwnProperty.call(byId, id); }
    function ids() { return Object.keys(byId).sort(); }
    function listSkills() { return ids().map(function (id) { return byId[id]; }); }
    function describe() { return listSkills().map(function (s) { return manifestOf(s); }); }
    return {
      registerSkill: registerSkill, removeSkill: removeSkill, getSkill: getSkill, has: has,
      ids: ids, listSkills: listSkills, validateSkill: function (s) { return validateSkill(s, opts); }, describe: describe,
      get size() { return Object.keys(byId).length; }
    };
  }

  var API = { createSkillRegistry: createSkillRegistry, validateSkill: validateSkill, manifestOf: manifestOf, MANIFEST_KEYS: MANIFEST_KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_REGISTRY = API;
})();
