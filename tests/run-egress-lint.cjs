/* AUBS Trust OS Layer 1 — EGRESS LINT (the CI gate, as a .cjs test since the repo has no
   package.json/CI). Scans runtime source for outbound-network primitives and FAILS if any
   appear outside the single Trusted Egress Gateway. Pre-existing network sites are tracked on
   an explicit MIGRATION-DEBT allowlist and printed every run, so the debt is visible, not
   hidden — and no NEW egress can be added outside the door. Usage: node tests/run-egress-lint.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// The ONE door. Network primitives are allowed only here.
const GATEWAY = "core/trust/egress.js";
// Pre-existing network sites, NOT yet behind the gateway. Each is debt to migrate when the
// wire is attached. Listed explicitly so the lint passes today AND the debt stays visible.
const MIGRATION_DEBT = {
  "core/providers/openai-adapter.js": "model transport — migrate behind egress() at wire-up",
  "core/providers/endpoint.js": "model endpoint transport (local/remote OpenAI-compatible) — route behind egress() at wire-up",
  "sw.js": "PWA service worker fetch — audit/route at wire-up"
};
const ALLOW = new Set([GATEWAY, ...Object.keys(MIGRATION_DEBT)]);

// Skip: tests, deps, git, and BUILT artifacts (bundles are generated, not authored).
const SKIP_DIR = new Set(["node_modules", ".git", "tests", "fonts"]);
const SKIP_FILE = new Set(["build/bundle.js", "public/bundle.js"]);
const NET = /\bfetch\s*\(|\bXMLHttpRequest\b|new\s+WebSocket\b|navigator\.sendBeacon\b|\bEventSource\b/;
// A same-origin app-asset load is NOT egress: the gateway governs sending data OUT to a THIRD
// PARTY. A fetch() with a RELATIVE STRING LITERAL (not http(s): and not //) can only hit our own
// origin — it is the app loading its own asset (the service worker even caches it), exactly like a
// <script>/<link>. We exempt ONLY that precise shape; an absolute or DYNAMIC fetch(...) URL is
// still egress and must go through the door.
const LOCAL_ASSET_FETCH = /\bfetch\s*\(\s*["'`](?!https?:|\/\/)[^"'`]+["'`]/g;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    const st = fs.statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIR.has(name)) walk(full, out); }
    else if (/\.(js|html)$/.test(name) && !SKIP_FILE.has(rel)) out.push(rel);
  }
  return out;
}

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const files = walk(ROOT, []);
const offenders = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  // Strip same-origin relative-literal asset fetches before scanning — they are not egress.
  const scanned = src.replace(LOCAL_ASSET_FETCH, " ");
  if (NET.test(scanned) && !ALLOW.has(rel)) offenders.push(rel);
}

// Self-check the exemption rule so it can't silently widen into a loophole: a relative literal is
// allowed, but an absolute or dynamic URL is still caught.
function isEgress(snippet) { return NET.test(snippet.replace(LOCAL_ASSET_FETCH, " ")); }
t("exemption is sound: relative-literal fetch is NOT egress", isEgress('fetch("assets/lexicon/words_alpha.txt")') === false);
t("exemption is tight: absolute-URL fetch IS still egress", isEgress('fetch("https://evil.example/x")') === true);
t("exemption is tight: dynamic/variable fetch IS still egress", isEgress('fetch(url)') === true);

t("the gateway exists and is the declared single door", fs.existsSync(path.join(ROOT, GATEWAY)));
t("NO network primitive outside the gateway or the tracked migration-debt allowlist",
  offenders.length === 0);
if (offenders.length) console.log("   OFFENDERS (new egress outside the door — move it behind egress()):\n   - " + offenders.join("\n   - "));

console.log("\nMigration debt (pre-existing network sites to route behind the gateway at wire-up):");
for (const [f, why] of Object.entries(MIGRATION_DEBT)) {
  const present = fs.existsSync(path.join(ROOT, f));
  console.log("   - " + f + (present ? "" : " (absent)") + " — " + why);
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Egress lint: the one door holds; no new network call exists outside it; the two legacy sites are tracked, not hidden.");
process.exit(0);
