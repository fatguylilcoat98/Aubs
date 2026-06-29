/* AUBS Trust OS Layer 5 — Privacy Proof (reads from the Layer-1 gateway).
   Sealed door (Incognito) → "Nothing left this device. The door was locked." (sealed-door
   strength, 0/0). Filtered → runtime-attested "every recorded egress went through one door"
   with the payload-hash list, and it NEVER claims "nothing leaked". Usage: node tests/run-trust-privacy.cjs */
"use strict";
const G = require("../core/trust/egress.js");
const EL = require("../core/trust/egress-ledger.js");
const S = require("../core/trust/strengths.js");
const PRIV = require("../core/trust/proofs/privacy.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const allowGate = { evaluate: () => ({ allow: true, target: "https://api/door", reason: "ok" }) };
const fakeSend = () => Promise.resolve({ ok: true });

(async () => {
  // ── SEALED DOOR (Incognito) — strongest form ───────────────────────────────────────────────
  {
    const gw = G.createGateway({ gate: allowGate, send: fakeSend, sealed: true });
    await gw.egress({ x: 1 }, { classification: "public" });   // refused structurally
    const proof = PRIV.buildPrivacyProof(gw, null);
    t("sealed: claim is the sealed-door form, 0 requests", proof.sealed === true && proof.requests === 0);
    t("sealed: wording 'Nothing left this device. The door was locked.'", /Nothing left this device\. The door was locked\./.test(proof.claims[0].what));
    t("sealed: strength normalizes to runtime-attested badge (~) with sealed-door form", proof.claims[0].strength === S.RUNTIME_ATTESTED && proof.claims[0].form === "sealed-door");
  }

  // ── FILTERED EGRESS — runtime-attested, recorded hashes, never 'nothing leaked' ─────────────
  {
    const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: allowGate, ledger, send: fakeSend });
    await gw.egress({ a: 1 }, { classification: "public" });
    await gw.egress({ a: 2 }, { classification: "public" });
    await ledger.ready();
    const proof = PRIV.buildPrivacyProof(gw, ledger);
    t("filtered: runtime-attested ~, 2 requests recorded", proof.claims[0].strength === S.RUNTIME_ATTESTED && proof.requests === 2);
    t("filtered: carries the complete recorded payload-hash list", proof.recorded_hashes.length === 2 && proof.recorded_hashes.every(h => /^[0-9a-f]{64}$/.test(h)));
    t("filtered: NEVER claims 'nothing leaked'", !proof.claims.some(c => /nothing (leaked|else left)/i.test(c.what)));
    t("filtered: limit is stated plainly (cannot prove nothing else left)", /cannot prove nothing else left/i.test(proof.claims[0].limits));
  }

  // ── blocked egress is surfaced honestly ────────────────────────────────────────────────────
  {
    const ledger = EL.createEgressLedger();
    const denyGate = { evaluate: () => ({ allow: false, reason: "data_class_not_allowed" }) };
    const gw = G.createGateway({ gate: denyGate, ledger, send: fakeSend });
    await gw.egress({ secret: 1 }, { classification: "sensitive" });
    await ledger.ready();
    const proof = PRIV.buildPrivacyProof(gw, ledger);
    t("blocked attempts are reported (recorded, not sent)", proof.blocked === 1 && proof.claims.some(c => /blocked by policy and not sent/.test(c.what)));
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 5 Privacy: sealed-door leads ('door was locked', 0/0); filtered egress is runtime-attested with the recorded hash list; 'nothing leaked' is never claimed.");
  process.exit(0);
})().catch(e => { console.error("trust-privacy test crashed:", e); process.exit(1); });
