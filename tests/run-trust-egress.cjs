/* AUBS Trust OS Layer 1 — Trusted Egress Gateway + egress ledger.
   Every byte that leaves is policy-checked, classified, hashed, and recorded BEFORE it
   leaves; blocked egress is recorded, not sent; the sealed door (Incognito) refuses
   structurally (0 requests, 0 bytes); the egress log is hash-chained and offline-verifiable.
   No real network I/O — `send` is injected. Usage: node tests/run-trust-egress.cjs */
"use strict";
const G = require("../core/trust/egress.js");
const EL = require("../core/trust/egress-ledger.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

function fakeSend() { let n = 0, last = null; const f = (target, payload) => { n++; last = { target, payload }; return Promise.resolve({ ok: true }); }; f.calls = () => n; f.last = () => last; return f; }
const allowGate = { evaluate: (_p, _c, _pol) => ({ allow: true, target: "https://api.example/door", reason: "policy_ok" }) };
const denyGate = { evaluate: (_p, _c, _pol) => ({ allow: false, reason: "data_class_not_allowed" }) };

(async () => {
  // ── ALLOW: policy ok → send once, hashed, recorded ──────────────────────────────────────
  {
    const send = fakeSend(); const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: allowGate, ledger, send });
    const r = await gw.egress({ prompt: "hello" }, { classification: "public" });
    await ledger.ready();
    t("allow: send called exactly once", send.calls() === 1);
    t("allow: returns allowed + payload_hash + runtime-attested strength", r.allowed === true && /^[0-9a-f]{64}$/.test(r.payload_hash) && r.strength === "runtime-attested");
    t("allow: ledger recorded one 'sent' with the same hash", ledger.sentCount() === 1 && ledger.all()[0].payload_hash === r.payload_hash);
    t("allow: counters reflect one request + bytes>0", gw.counters().requests === 1 && gw.counters().bytes_out > 0);
  }

  // ── BLOCK: policy denies → NOT sent, but recorded ───────────────────────────────────────
  {
    const send = fakeSend(); const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: denyGate, ledger, send });
    const r = await gw.egress({ prompt: "secret" }, { classification: "sensitive" });
    await ledger.ready();
    t("block: send NEVER called", send.calls() === 0);
    t("block: returns not-allowed with the policy reason", r.allowed === false && r.reason === "data_class_not_allowed");
    t("block: recorded as 'blocked' (recorded, not sent)", ledger.blockedCount() === 1 && ledger.sentCount() === 0);
    t("block: counters show a block, zero requests", gw.counters().blocked === 1 && gw.counters().requests === 0);
  }

  // ── SEALED DOOR (Incognito): structural refusal, 0 requests / 0 bytes ────────────────────
  {
    const send = fakeSend(); const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: allowGate, ledger, send, sealed: true });
    const r = await gw.egress({ prompt: "anything" }, { classification: "public" });
    await ledger.ready();
    t("sealed: even an allow-policy turn is refused (incognito_sealed)", r.allowed === false && r.reason === "incognito_sealed");
    t("sealed: send NEVER called; 0 requests, 0 bytes", send.calls() === 0 && gw.counters().requests === 0 && gw.counters().bytes_out === 0);
    t("sealed: privacyClaim is sealed-door strength, 0/0", gw.privacyClaim().strength === "egress-attested:sealed-door" && gw.privacyClaim().requests === 0 && gw.privacyClaim().bytes === 0);
  }

  // ── seal() mid-session welds the door ───────────────────────────────────────────────────
  {
    const send = fakeSend(); const gw = G.createGateway({ gate: allowGate, send });
    await gw.egress({ a: 1 }, { classification: "public" });
    gw.seal();
    const r2 = await gw.egress({ a: 2 }, { classification: "public" });
    t("seal(): first send goes, second is refused after welding", send.calls() === 1 && r2.allowed === false && gw.isSealed());
  }

  // ── privacy claim (filtered) reports the recorded list honestly ──────────────────────────
  {
    const send = fakeSend(); const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: allowGate, ledger, send });
    await gw.egress({ a: 1 }, { classification: "public" });
    await gw.egress({ a: 2 }, { classification: "public" });
    t("filtered privacyClaim: runtime-attested, counts match (NOT 'nothing leaked')",
      gw.privacyClaim().strength === "runtime-attested" && gw.privacyClaim().requests === 2 && !/nothing/i.test(gw.privacyClaim().claim));
  }

  // ── egress ledger is hash-chained & offline-verifiable; tamper is detectable ─────────────
  {
    const ledger = EL.createEgressLedger();
    const gw = G.createGateway({ gate: allowGate, ledger, send: fakeSend() });
    await gw.egress({ a: 1 }, { classification: "public" });
    await gw.egress({ a: 2 }, { classification: "public" });
    const v1 = await ledger.verify();
    t("egress ledger verifies (intact chain)", v1.ok === true && v1.count === 2);
    ledger.all()[0].destination = "https://evil.example";   // tamper after the fact
    const v2 = await ledger.verify();
    t("egress ledger detects tampering (hash mismatch)", v2.ok === false && v2.issues.some(i => i.type === "hash_mismatch"));
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("Layer 1 Egress Gateway: one door; policy-checked + hashed + recorded before send; blocked-not-sent; sealed door = 0/0; egress log hash-chained & tamper-evident.");
  process.exit(0);
})().catch(e => { console.error("trust-egress test crashed:", e); process.exit(1); });
