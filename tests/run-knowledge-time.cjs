/* AUBS Runtime Service — Time (Class 1, self-verifiable, model 0×).
   The device clock + platform tz database are authoritative for the current instant, so the runtime
   answers time-in-a-city, relative dates, and the local timezone with certainty. `now` is injected
   so tests are deterministic; DST-free zones (UTC, Tokyo) are used for exact assertions. Unknown
   places fall through (null). Usage: node tests/run-knowledge-time.cjs */
"use strict";
const T = require("../core/knowledge/time.js");
const K = require("../core/knowledge/registry.js");

let pass = 0, fail = 0; const F = [];
function t(d, c) { c ? pass++ : (fail++, F.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }

// Fixed instant: 2026-06-29 12:00 UTC (a Monday). Tokyo = UTC+9 (no DST) → 21:00 Monday.
const NOW = new Date("2026-06-29T12:00:00Z");
const pack = T.makePack({ now: () => NOW, localZone: "America/Denver" });
const ans = (q) => { const r = pack.respond(q); return r ? r.answer : null; };

// ── time in a city / timezone (DST-free zones for exactness) ──────────────────────────────────
t("time in Tokyo (UTC+9, no DST) → 9:00 PM Monday", ans("what time is it in Tokyo") === "In Tokyo it's Monday, 9:00 PM.");
t("time in UTC → 12:00 PM Monday", ans("what's the time in UTC") === "In Utc it's Monday, 12:00 PM.");
t("'time in Tokyo right now' phrasing handled", ans("what time is it in Tokyo right now") === "In Tokyo it's Monday, 9:00 PM.");
t("raw IANA zone accepted ('time in Asia/Tokyo')", /9:00 PM/.test(ans("what time is it in Asia/Tokyo") || ""));

// ── local timezone ─────────────────────────────────────────────────────────────────────────
t("'what timezone am I in' → injected local zone", ans("what timezone am I in?") === "You're in the America/Denver timezone.");
t("'what is my timezone' → local zone", ans("what is my timezone") === "You're in the America/Denver timezone.");

// ── relative dates (computed from the injected now) ──────────────────────────────────────────
{
  const tomo = new Date(NOW.getTime() + 86400000), yest = new Date(NOW.getTime() - 86400000);
  // compare to a parallel local-format so the test is machine-tz agnostic (logic, not a hardcoded string)
  t("tomorrow's date = day after now", ans("what's tomorrow's date?") === "Tomorrow is " + pack.localDateStr(tomo) + ".");
  t("yesterday's date = day before now", ans("what was yesterday's date?") === "Yesterday was " + pack.localDateStr(yest) + ".");
  t("'what day is tomorrow' handled", /Tomorrow is/.test(ans("what day is tomorrow") || ""));
}

// ── boundaries: unknown place / non-time → null (never invented, falls through) ───────────────
t("unknown city ('time in Narnia') → null", pack.respond("what time is it in Narnia") === null);
t("non-time question → null", pack.respond("write me a poem") === null);
t("bare 'what time is it' (no place) → null here (reality-context owns local time)", pack.respond("what time is it") === null);

// ── proof + registry ─────────────────────────────────────────────────────────────────────────
{
  const r = pack.respond("what time is it in Tokyo");
  t("answer self-verifiable, model 0×", r.proof.class === "self_verifiable" && r.proof.model_called === false);
  K.register(pack);
  const rr = K.ask("what time is it in Tokyo");
  t("registry routes a time query, model 0×, self-verifiable", rr && rr.pack === "time" && rr.proof.model_called === false && rr.proof.class === "self_verifiable");
}

console.log("\nAssertions: " + pass + "/" + (pass + fail));
if (fail) { console.log("FAILURES:\n" + F.join("\n")); process.exit(1); }
console.log("Time service: time-in-city (tz, DST via platform), relative dates, local timezone — self-verifiable, model 0×; unknown places fall through.");
process.exit(0);
