/* ============================================================================
   AUBS — generate core/browser-assets.js from the canonical JSON sources.
   Truth · Safety · We Got Your Back

   The CAC validator and the GEL evaluator load JSON (schemas + default policy
   bundle) via require() in Node. A browser cannot require() JSON, so their browser
   branches read injected globals instead:
       window.AUBS_CAC_SCHEMAS       — the 5 CAC schemas
       window.AUBS_GEL_BUNDLE_SCHEMA — the policy-bundle schema
       window.AUBS_GEL_DEFAULT_BUNDLE— the default policy bundle
       window.AUBS_MEMORY_SCHEMA     — the TSM (M9) memory-entry schema
       window.AUBS_SKILL_SCHEMA      — the Skills (M11) skill-manifest schema

   This script inlines those JSON files into one classic <script> so there is a
   SINGLE source of truth (the .json files). Re-run after editing any of them:
       node tools/gen-browser-assets.cjs
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function load(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }

const schemas = {
  intent:     load("core/cac/schemas/intent.schema.json"),
  plan:       load("core/cac/schemas/plan.schema.json"),
  governance: load("core/cac/schemas/governance-decision.schema.json"),
  result:     load("core/cac/schemas/result.schema.json"),
  failure:    load("core/cac/schemas/failure.schema.json")
};
const bundleSchema  = load("core/gel/policy-bundle.schema.json");
const defaultBundle = load("core/gel/default-policy-bundle.json");
const memorySchema  = load("core/memory/memory.schema.json");
const skillSchema   = load("core/skills/skill.schema.json");

const banner =
`/* ============================================================================
   AUBS — core/browser-assets.js  (GENERATED — do not edit by hand)
   Source of truth: core/cac/schemas/*.json, core/gel/policy-bundle.schema.json,
   core/gel/default-policy-bundle.json, core/memory/memory.schema.json,
   core/skills/skill.schema.json. Regenerate: node tools/gen-browser-assets.cjs

   Loaded as a classic <script> BEFORE the CAC/GEL/kernel modules so their browser
   branches can read these globals. Inert: defines globals only, runs no behavior.
   ========================================================================== */`;

const body =
`(function () {
  "use strict";
  if (typeof window === "undefined") return;
  window.AUBS_CAC_SCHEMAS = ${JSON.stringify(schemas, null, 2)};
  window.AUBS_GEL_BUNDLE_SCHEMA = ${JSON.stringify(bundleSchema, null, 2)};
  window.AUBS_GEL_DEFAULT_BUNDLE = ${JSON.stringify(defaultBundle, null, 2)};
  window.AUBS_MEMORY_SCHEMA = ${JSON.stringify(memorySchema, null, 2)};
  window.AUBS_SKILL_SCHEMA = ${JSON.stringify(skillSchema, null, 2)};
})();
`;

const out = banner + "\n" + body;
fs.writeFileSync(path.join(root, "core/browser-assets.js"), out);
console.log("Wrote core/browser-assets.js (" + out.length + " bytes): " +
  Object.keys(schemas).length + " CAC schemas, bundle schema, default bundle, " +
  "memory schema, skill schema.");
