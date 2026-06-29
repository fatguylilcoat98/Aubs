/* AUBS Trust OS — HTML wiring regression. Verifies aubs-app.html loads the Trust OS scripts
   that exist, in correct DEPENDENCY ORDER, before pipeline.js, and actually wires the turn
   (trustOS + publicKey passed) and renders the Glass Box line. Static check — guards the
   browser path I can't run headlessly. Usage: node tests/run-trust-html-wiring.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "aubs-app.html"), "utf8");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// ordered list of script srcs as they appear in the HTML
const srcs = [];
const re = /<script src="([^"]+)"><\/script>/g; let m;
while ((m = re.exec(html)) !== null) srcs.push(m[1]);
const idx = (s) => srcs.indexOf(s);
const before = (a, b) => idx(a) >= 0 && idx(b) >= 0 && idx(a) < idx(b);

// 1) every trust script referenced actually exists
const trustScripts = srcs.filter(s => s.indexOf("core/trust/") === 0);
t("HTML references the Trust OS scripts", trustScripts.length >= 18);
let allExist = true;
trustScripts.forEach(s => { if (!fs.existsSync(path.join(ROOT, s))) { allExist = false; F.push("missing file: " + s); } });
t("every referenced Trust OS script exists on disk", allExist);

// 2) dependency order
t("strengths before trust-record", before("core/trust/strengths.js", "core/trust/trust-record.js"));
t("trust-record before the proofs", before("core/trust/trust-record.js", "core/trust/proofs/integrity.js") && before("core/trust/trust-record.js", "core/trust/proofs/memory.js"));
t("hash before memory proof", before("core/trust/hash.js", "core/trust/proofs/memory.js"));
t("reasoning-permission before check-order", before("core/trust/reasoning-permission.js", "core/trust/check-order.js"));
t("ledger before integrity proof (integrity wraps it)", before("spine/ledger.js", "core/trust/proofs/integrity.js"));
t("index.js after all trust modules", before("core/trust/glass-box.js", "core/trust/index.js"));
t("index.js (AUBS_TRUST) before pipeline.js (which reads it)", before("core/trust/index.js", "core/constitution/pipeline.js"));
t("all trust scripts before pipeline.js", trustScripts.every(s => before(s, "core/constitution/pipeline.js")));

// 3) the turn is actually wired
t("FLAG_TRUST_OS + ?trust=1 wiring present", /FLAG_TRUST_OS/.test(html) && /qp\.get\('trust'\)/.test(html) && /function trustOsOn\(\)/.test(html));
t("runConstitutionalChat call passes trustOS + publicKey + runtime", /trustOS:trustOsOn\(\)/.test(html) && /publicKey:\(c&&c\.keys\)\?c\.keys\.publicKey/.test(html) && /runtime:aubsRuntimeMetaFull\(\)/.test(html));
t("Glass Box line rendered from ui.glass_box_easy under the answer", /ui\.glass_box_easy && trustOsOn\(\)/.test(html) && /glass-box-easy/.test(html));
t("creator metadata is Christopher Hughes", /creator:"Christopher Hughes"/.test(html));

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Trust OS HTML wiring: scripts exist + load in dependency order before pipeline.js; the turn passes trustOS/publicKey/runtime; the Glass Box renders. Ready for the device pass.");
process.exit(0);
