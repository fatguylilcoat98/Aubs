/* AUBS A2 — device-bundle trust (Decision Gate 0 §5): signature / freshness / tamper.
   The signed device bundle is a NEW trust root. verifyBundle must FAIL CLOSED on every defect:
   tampered content, expired, downgraded version, unsigned, wrong key. A valid, fresh, correctly
   signed bundle loads; everything else is refused (bundle:null) so the caller falls back to
   structural-invariants-only. Usage: node tests/run-bundle-signing.cjs */
"use strict";
const L = require("../spine/ledger.js");
const B = require("../core/facts/bundle.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

const BUNDLE = {
  bundle_id: "aubs-default", bundle_version: "0.1", require_explicit_allow: false,
  policies: [{ policy_id: "default-allow-local", precedence_level: "default", effect: "allow", enabled: true, reason: "local default", match: {} }]
};
const PAST = "2020-01-01T00:00:00Z";
const FUTURE = "2099-01-01T00:00:00Z";
const NOW = "2026-06-29T00:00:00Z";

(async () => {
  const key = await L.generateSigningKeyPair();
  const other = await L.generateSigningKeyPair();

  // ── Valid path ──────────────────────────────────────────────────────────────────────────
  const signed = await B.signBundle(BUNDLE, key.privateKey, { version_seq: 5, issued_at: NOW, expires_at: FUTURE });
  t("signs: envelope has content_hash, version_seq, signature", !!signed.content_hash && signed.version_seq === 5 && !!signed.signature);

  const ok = await B.verifyBundle(signed, { publicKey: key.publicKey, now: NOW, lastVersionSeq: 5 });
  t("valid bundle (good sig, fresh, not downgraded) → ok, bundle returned", ok.ok === true && ok.bundle && ok.bundle.bundle_id === "aubs-default");

  // ── Tamper: mutate content after signing → content_tampered (fail closed) ──────────────────
  {
    const forged = JSON.parse(JSON.stringify(signed));
    forged.bundle.policies[0].effect = "deny"; // attacker flips the rule
    const r = await B.verifyBundle(forged, { publicKey: key.publicKey, now: NOW });
    t("TAMPER content → fail closed (content_tampered), bundle null", r.ok === false && r.reason === "content_tampered" && r.bundle === null);
  }

  // ── Expired → fail closed ──────────────────────────────────────────────────────────────────
  {
    const exp = await B.signBundle(BUNDLE, key.privateKey, { version_seq: 5, issued_at: PAST, expires_at: PAST });
    const r = await B.verifyBundle(exp, { publicKey: key.publicKey, now: NOW });
    t("EXPIRED → fail closed (expired), bundle null", r.ok === false && r.reason === "expired" && r.bundle === null);
  }

  // ── Downgrade (version_seq < last seen) → fail closed ──────────────────────────────────────
  {
    const old = await B.signBundle(BUNDLE, key.privateKey, { version_seq: 3, issued_at: NOW, expires_at: FUTURE });
    const r = await B.verifyBundle(old, { publicKey: key.publicKey, now: NOW, lastVersionSeq: 5 });
    t("DOWNGRADE (seq 3 < last 5) → fail closed (downgrade), bundle null", r.ok === false && r.reason === "downgrade" && r.bundle === null);
  }

  // ── Unsigned → fail closed ─────────────────────────────────────────────────────────────────
  {
    const unsigned = JSON.parse(JSON.stringify(signed)); delete unsigned.signature;
    const r = await B.verifyBundle(unsigned, { publicKey: key.publicKey, now: NOW });
    t("UNSIGNED → fail closed (unsigned), bundle null", r.ok === false && r.reason === "unsigned" && r.bundle === null);
  }

  // ── Wrong key → fail closed ────────────────────────────────────────────────────────────────
  {
    const r = await B.verifyBundle(signed, { publicKey: other.publicKey, now: NOW, lastVersionSeq: 5 });
    t("WRONG KEY → fail closed (bad_signature), bundle null", r.ok === false && r.reason === "bad_signature" && r.bundle === null);
  }

  // ── No bundle at all → fail closed ─────────────────────────────────────────────────────────
  {
    const r = await B.verifyBundle(null, { publicKey: key.publicKey, now: NOW });
    t("NO BUNDLE → fail closed (no_bundle)", r.ok === false && r.reason === "no_bundle" && r.bundle === null);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Device-bundle trust: a valid signed/fresh bundle loads; tampered/expired/downgraded/unsigned/wrong-key all fail closed (bundle never loaded).");
  process.exit(0);
})().catch(e => { console.error("bundle-signing test crashed:", e); process.exit(1); });
