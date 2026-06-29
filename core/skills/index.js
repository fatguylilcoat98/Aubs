/* AUBS Constitutional Skills Framework v0.1 (Milestone 11) — single entry point.
   A skill is a declared, governed capability that REQUESTS providers, memory, and tools
   through the constitution — it never executes them. Only the kernel executes. Isolated:
   the live app does NOT depend on this. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var registry = require("./registry");
    var execute = require("./execute");
    module.exports = {
      createSkillRegistry: registry.createSkillRegistry,
      validateSkill: registry.validateSkill,
      eligibility: require("./eligibility"),
      explanation: require("./explanation"),
      replay: require("./replay-skill"),
      executeSkill: execute.executeSkill,
      fakes: require("./fake-skills"),
      schema: require("./skill.schema.json")
    };
  } else if (typeof window !== "undefined") {
    var R = window.AUBS_SKILL_REGISTRY || {}, X = window.AUBS_SKILL_EXECUTE || {};
    window.AUBS_SKILLS = {
      createSkillRegistry: R.createSkillRegistry, validateSkill: R.validateSkill,
      eligibility: window.AUBS_SKILL_ELIG, explanation: window.AUBS_SKILL_EXPL, replay: window.AUBS_SKILL_REPLAY,
      executeSkill: X.executeSkill, fakes: window.AUBS_SKILL_FAKES
    };
  }
})();
