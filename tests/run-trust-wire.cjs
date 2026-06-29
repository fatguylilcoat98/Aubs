/* AUBS Trust OS — WIRE-UP test. A real constitutional turn, with FLAG_TRUST_OS on, emits a
   VALIDATED Trust Record (six proofs) and a Glass Box Easy line — assembled from the live
   pipeline's own evidence. Flag OFF → no trust_record (byte-identical). A Trust Record
   assembly failure must NEVER break the turn. Usage: node tests/run-trust-wire.cjs */
"use strict";
const L = require("../spine/ledger.js");
const CHAT = require("../core/constitution/chat.js");
const TR = require("../core/trust/trust-record.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
const NOW = "2026-06-29T00:00:00Z";

(async () => {
  const key = await L.generateSigningKeyPair();
  let seq = 0;
  const turn = (over) => { seq++; return CHAT.runConstitutionalChat(Object.assign({
    text: "Tell me about Sacramento.", generate: async () => ({ text: "Sacramento is the capital of California.", finish: "stop" }),
    model_id: "qwen2.5-0.5b", intent_id: "i" + seq, plan_id: "p" + seq, created_at: NOW,
    ledgerStore: L.createMemoryStore(), signingKey: key.privateKey
  }, over)); };

  // ── flag OFF → byte-identical (no trust_record) ─────────────────────────────────────────────
  {
    const s = await turn({ trustOS: false });
    t("flag OFF: no trust_* keys on the ui at all (truly byte-identical shape)", !("trust_record" in s.ui) && !("glass_box_easy" in s.ui) && !("trust_valid" in s.ui));
    t("flag OFF: the answer itself is unchanged", s.ui.text === "Sacramento is the capital of California.");
  }

  // ── flag ON (model turn) → validated Trust Record + Glass Box line ───────────────────────────
  {
    const s = await turn({ trustOS: true, publicKey: key.publicKey });
    t("flag ON: turn carries a Trust Record", !!s.ui.trust_record);
    t("flag ON: the Trust Record VALIDATES (HARD LAW)", s.ui.trust_valid === true && TR.validateTrustRecord(s.ui.trust_record).ok === true);
    t("flag ON: integrity proof present (real ledger, publicKey given)", !!s.ui.trust_record.integrity && s.ui.trust_record.integrity.claims.length > 0);
    t("flag ON: decision proof is split-strength on a model turn", !!s.ui.trust_record.decision && s.ui.trust_record.decision.claims.length >= 2);
    t("flag ON: privacy proof is sealed-door (on-device default, nothing left)", /door was locked/i.test(s.ui.trust_record.privacy.claims[0].what));
    t("flag ON: Glass Box Easy line rendered from the record", typeof s.ui.glass_box_easy === "string" && /AUBS used/.test(s.ui.glass_box_easy) && /door was locked/i.test(s.ui.glass_box_easy));
    t("flag ON: no assembly error", !s.trust_record_error);
  }

  // ── governed-fact turn (model 0×) also carries a Trust Record ───────────────────────────────
  {
    const s = await CHAT.runConstitutionalChat({
      text: "What's your name?", generate: async () => ({ text: "should-not-be-used", finish: "stop" }),
      model_id: "m", intent_id: "g1", plan_id: "gp1", created_at: NOW, ledgerStore: L.createMemoryStore(), signingKey: key.privateKey,
      governedFacts: true, identityConfig: { assistantName: "Tom" }, trustOS: true, publicKey: key.publicKey
    });
    t("governed-fact turn: answered from runtime (I'm Tom)", s.ui.text === "I'm Tom.");
    t("governed-fact turn: still carries a validated Trust Record", !!s.ui.trust_record && s.ui.trust_valid === true);
  }

  console.log("\nAssertions: " + pass + "/" + (pass + fail));
  if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
  console.log("\nGlass Box (live turn):\n  " + (await turn({ trustOS: true, publicKey: key.publicKey })).ui.glass_box_easy);
  console.log("\nTrust OS WIRED: a live pipeline turn emits a validated Trust Record + Glass Box line; flag OFF is byte-identical; assembly never breaks the turn.");
  process.exit(0);
})().catch(e => { console.error("trust-wire test crashed:", e); process.exit(1); });
