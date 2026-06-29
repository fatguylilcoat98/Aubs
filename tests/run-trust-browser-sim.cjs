/* AUBS Trust OS — BROWSER LOAD SIMULATION. The maintainer can't run a real browser, and the
   .cjs tests use require() (the Node export path), NOT the window-global path the device uses.
   This loads every external <script src> from aubs-app.html, IN ORDER, inside a vm sandbox with
   a fake `window` + browser globals — exercising each module's browser IIFE branch and its
   window.AUBS_* dependency resolution. Then it drives a real turn through the assembled
   window.AUBS_CONSTITUTION_CHAT with trustOS on. A load-order/global/runtime bug that would
   brick the device shows up here. Usage: node tests/run-trust-browser-sim.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// ── parse the external script srcs from the HTML, in order ───────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, "aubs-app.html"), "utf8");
const srcs = [];
const re = /<script src="([^"]+)"><\/script>/g; let m;
while ((m = re.exec(html)) !== null) srcs.push(m[1]);
const localSrcs = srcs.filter(s => !/^https?:/.test(s) && fs.existsSync(path.join(ROOT, s)));
t("found the local module scripts to load", localSrcs.length > 10);

// ── a fake browser environment ───────────────────────────────────────────────────────────────
const docStub = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} }),
  addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} }, documentElement: { style: {} }
};
const sandbox = {
  console, crypto: require("crypto").webcrypto, TextEncoder, TextDecoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  Buffer, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
  performance: { now: () => 0 }, navigator: { userAgent: "node-sim" },
  location: { search: "", href: "http://localhost/", hostname: "localhost" },
  document: docStub, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, indexedDB: undefined
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

// ── load each script in order; report any that throw at load ─────────────────────────────────
const loadErrors = [];
for (const rel of localSrcs) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel }); }
  catch (e) { loadErrors.push(rel + " → " + (e && e.message ? e.message : e)); }
}
t("ALL module scripts loaded without throwing (browser IIFE path)", loadErrors.length === 0);
if (loadErrors.length) console.log("   LOAD ERRORS:\n   - " + loadErrors.join("\n   - "));

// ── the critical globals assembled ──────────────────────────────────────────────────────────
t("window.AUBS_SPINE present", !!sandbox.AUBS_SPINE);
t("window.AUBS_TRUST present (Trust OS barrel)", !!sandbox.AUBS_TRUST && !!sandbox.AUBS_TRUST.record);
t("window.AUBS_TRUST proofs all wired", !!(sandbox.AUBS_TRUST && sandbox.AUBS_TRUST.proofs && sandbox.AUBS_TRUST.proofs.integrity && sandbox.AUBS_TRUST.proofs.privacy && sandbox.AUBS_TRUST.proofs.decision));
t("window.AUBS_CONSTITUTION_PIPELINE present", !!sandbox.AUBS_CONSTITUTION_PIPELINE);
t("window.AUBS_CONSTITUTION_CHAT present", !!sandbox.AUBS_CONSTITUTION_CHAT);
t("window.AUBS_FACT_GATE present (governed facts)", !!sandbox.AUBS_FACT_GATE);

// ── drive a REAL turn through the browser-assembled globals, trustOS ON ───────────────────────
(async () => {
  if (sandbox.AUBS_CONSTITUTION_CHAT && sandbox.AUBS_LEDGER) {
    try {
      const key = await sandbox.AUBS_LEDGER.generateSigningKeyPair();
      const store = sandbox.AUBS_LEDGER.createMemoryStore();
      const res = await sandbox.AUBS_CONSTITUTION_CHAT.runConstitutionalChat({
        text: "Tell me about Sacramento.", generate: async () => ({ text: "Sacramento is the capital of California.", finish: "stop" }),
        model_id: "qwen2.5-0.5b", intent_id: "i1", plan_id: "p1", created_at: "2026-06-29T00:00:00Z",
        ledgerStore: store, signingKey: key.privateKey, trustOS: true, publicKey: key.publicKey
      });
      const ui = res.ui || {};
      t("browser-path turn produced an answer", ui.ok === true && /Sacramento/.test(ui.text));
      t("browser-path turn emitted a Trust Record", !!ui.trust_record);
      t("browser-path Trust Record VALIDATES", ui.trust_valid === true && sandbox.AUBS_TRUST.record.validateTrustRecord(ui.trust_record).ok === true);
      t("browser-path Glass Box line rendered", typeof ui.glass_box_easy === "string" && /door was locked/i.test(ui.glass_box_easy));
      if (res.trust_record_error) { F.push("trust_record_error: " + res.trust_record_error); fail++; }

      // governed-fact turn through the browser globals (model 0×)
      const res2 = await sandbox.AUBS_CONSTITUTION_CHAT.runConstitutionalChat({
        text: "Who created you?", generate: async () => ({ text: "should-not-be-used", finish: "stop" }),
        model_id: "m", intent_id: "g1", plan_id: "gp1", created_at: "2026-06-29T00:00:00Z",
        ledgerStore: sandbox.AUBS_LEDGER.createMemoryStore(), signingKey: key.privateKey,
        governedFacts: true, trustOS: true, publicKey: key.publicKey, runtime: { creator: "Christopher Hughes" }
      });
      t("browser-path governed 'Who created you?' → creator, model 0×", res2.ui.text === "I was built by Christopher Hughes.");
      t("browser-path governed turn also carries a valid Trust Record", !!res2.ui.trust_record && res2.ui.trust_valid === true);
    } catch (e) {
      t("browser-path turn ran without throwing", false); F.push("turn threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    }
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("\nBROWSER SIM OK: every script loads in order via the window path; the assembled globals run a full turn; Trust Record validates and the Glass Box renders — the device load path is exercised end-to-end.");
  process.exit(0);
})();
