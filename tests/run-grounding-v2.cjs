/* AUBS Verified Grounding v2 (Semantic Fit) — adversarial suite (candidate Article 3a amendment).
   Proves the three layers behind FLAG_SPINE_GROUNDING_V2 (default OFF): (1) grounding is
   query-gated and fail-closed; (2) object disambiguation closes same-slot cross-grounding;
   (3) only the value_verified tier displays as 'grounded' (topic_relevant -> inferred), with
   a negation guard. Deterministic, model-free, flag-off byte-identical.
   Usage: node tests/run-grounding-v2.cjs   (exit 0 = all pass) */
"use strict";
const S = require("../spine/spine.js");

let pass = 0, fail = 0; const FA = [];
function ok(d, c) { c ? pass++ : (fail++, FA.push(d)); console.log((c ? "PASS  " : "FAIL  ") + d); }
function withV2(on, fn) { const prev = S.FLAGS.FLAG_SPINE_GROUNDING_V2; S.FLAGS.FLAG_SPINE_GROUNDING_V2 = on; try { return fn(); } finally { S.FLAGS.FLAG_SPINE_GROUNDING_V2 = prev; } }
function entries(list) { return list.map(c => S.makeMemoryEntry(c, {})); }
function tag(o) { return S.tagAnswer(o); }

(() => {
  // ── Helper-level determinism (no learned components) ────────────────────────────────
  ok("extractQueryObject pulls the query's object noun for coarse slots", S.extractQueryObject("what's my favorite color", "likes") === "color" && S.extractQueryObject("where do i live", "location") === null);
  const e1 = S.makeMemoryEntry("User's favorite color is blue", {});
  ok("groundingStrength: value stated → value_verified", S.groundingStrength("Your favorite color is blue.", e1, "what's my favorite color") === "value_verified");
  ok("groundingStrength: on-topic but value absent → topic_relevant", S.groundingStrength("I recall your favorite color.", e1, "what's my favorite color") === "topic_relevant");
  ok("groundingStrength: negation guard → not value_verified", S.groundingStrength("Your favorite color is not blue.", e1, "what's my favorite color") === "topic_relevant");

  // ── Same-slot cross-citation (the core Hole B case the golden set does NOT contain) ──
  const es = entries(["User's favorite color is blue", "User's favorite food is pizza"]);
  const ids = es.map(e => e.id);
  const q = "what's my favorite color";
  const citeFood = "Your favorite food. [ID:" + ids[1] + "]";   // cites the WRONG (food) memory
  // Under RATIFIED 3a (flag off): both memories match slot:likes → the wrong one grounds (the hole).
  const off = withV2(false, () => tag({ answer: citeFood, query: q, memory_ids_in_prompt: ids, entries: es, classification: "personal" }));
  ok("flag OFF reproduces the same-slot hole (wrong 'likes' memory grounds)", off.tag === "grounded");
  // Under v2 (flag on): object disambiguation → 'color' not in the food memory → not grounded.
  const on = withV2(true, () => tag({ answer: citeFood, query: q, memory_ids_in_prompt: ids, entries: es, classification: "personal" }));
  ok("flag ON: same-slot cross-citation NO LONGER grounds (object-miss → inferred)", on.tag === "inferred");

  // ── value_verified vs topic_relevant (conservative policy) ──────────────────────────
  const ec = entries(["User's favorite color is blue"]); const cid = ec[0].id;
  const vv = withV2(true, () => tag({ answer: "Your favorite color is blue. [ID:" + cid + "]", query: q, memory_ids_in_prompt: [cid], entries: ec, classification: "personal" }));
  ok("flag ON: answer states the value → grounded (value_verified, basis recorded)", vv.tag === "grounded" && vv.grounding_strength === "value_verified" && /slot:likes:color/.test(vv.relevance_basis) && vv.grounded_on.join() === cid);
  const tr = withV2(true, () => tag({ answer: "I remember your favorite color note. [ID:" + cid + "]", query: q, memory_ids_in_prompt: [cid], entries: ec, classification: "personal" }));
  ok("flag ON: on-topic but value-absent → inferred (topic_relevant, conservative)", tr.tag === "inferred" && tr.grounding_strength === "topic_relevant");

  // ── Negation trap (must never ground the value) ─────────────────────────────────────
  const neg = withV2(true, () => tag({ answer: "Your favorite color is not blue. [ID:" + cid + "]", query: q, memory_ids_in_prompt: [cid], entries: ec, classification: "personal" }));
  ok("flag ON: negation trap → NOT grounded", neg.tag !== "grounded");

  // ── No-query → fail closed (Layer 1 default) ────────────────────────────────────────
  const nq = withV2(true, () => tag({ answer: "Your favorite color is blue. [ID:" + cid + "]", memory_ids_in_prompt: [cid], entries: ec, classification: "personal" }));
  ok("flag ON: grounding with NO query → never grounds (fail closed)", nq.tag !== "grounded");

  // ── Determinism + replayability (same inputs → identical decision; v1 vs v2 re-judge) ─
  const args = { answer: "Your favorite color is blue. [ID:" + cid + "]", query: q, memory_ids_in_prompt: [cid], entries: ec, classification: "personal" };
  const a = withV2(true, () => tag(args)), b = withV2(true, () => tag(args));
  ok("v2 grounding is deterministic (same inputs → identical decision)", JSON.stringify(a) === JSON.stringify(b));
  const wrongArgs = { answer: citeFood, query: q, memory_ids_in_prompt: ids, entries: es, classification: "personal" };
  const v1Judge = withV2(false, () => tag(wrongArgs)).tag, v2Judge = withV2(true, () => tag(wrongArgs)).tag;
  ok("the same record can be re-judged under v1 vs v2 (M7 replay), deterministically", v1Judge === "grounded" && v2Judge === "inferred");

  // ── Glass Box honesty: strength carried into the provenance record ──────────────────
  const prov = S.makeProvenance({ tag: "grounded", grounding_source: "spine_verified", grounding_strength: "value_verified", memory_ids_cited: [cid] });
  ok("provenance carries grounding_strength (weak ≠ strong in the record)", prov.grounding_strength === "value_verified");
  const provOff = S.makeProvenance({ tag: "grounded" });
  ok("provenance grounding_strength is null when unset (flag-off byte-identical)", provOff.grounding_strength === null);

  // ── Existing 3a invariants still hold under v2 (no false grounded) ──────────────────
  const idn = withV2(true, () => tag({ answer: "Your favorite color is blue. [ID:" + cid + "]", query: "who are you", memory_ids_in_prompt: [cid], entries: ec, classification: "identity" }));
  ok("v2 preserves Article 12: identity never grounds on user memory", idn.tag === "general");
  const conf = withV2(true, () => tag({ answer: "Your favorite color is blue. [ID:" + cid + "]", query: q, memory_ids_in_prompt: [cid], entries: ec, classification: "personal", conflict: true }));
  ok("v2 preserves Article 2: conflict never grounds", conf.tag === "unknown");

  console.log("\nAssertions: " + pass + "/" + (pass + fail) + " passed");
  if (fail) { console.log("FAILURES:\n" + FA.join("\n")); process.exit(1); }
  console.log("Verified Grounding v2: query-gated, object-disambiguated, value-verified — deterministic, fail-closed, flag-off byte-identical.");
  process.exit(0);
})();
