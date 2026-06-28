/* AUBS — candidate Article 3a amendment test (FLAG_SPINE_VERIFIED_GROUNDING).
   verifyGrounding() must ground ONLY a relevant, affirmatively-stated, user_verified
   in-prompt memory value — and must NOT ground negations, wrong-slot citations, or
   answers that omit the value. This is the CANDIDATE mechanism (not yet law); the test
   proves it is conservative (no false grounding).
   Usage: node tests/run-grounding-verify.cjs   (exit 0 = all pass) */
"use strict";
const SPINE = require("../spine/spine.js");

const ents = [
  SPINE.makeMemoryEntry("User's name is Chris", {}),
  SPINE.makeMemoryEntry("User lives in Sacramento", {}),
  SPINE.makeMemoryEntry("User builds AI software", {})
];
const ids = ents.map(e => e.id);

const cases = [
  { d: "name Q, affirmative → grounded",            q: "what's my name?",         a: "Your name is Chris.",            g: true },
  { d: "NEGATION trap → NOT grounded",              q: "what's my name?",         a: "Your name is not Chris.",        g: false },
  { d: "location Q, affirmative → grounded",        q: "where do I live?",        a: "You live in Sacramento.",        g: true },
  { d: "job Q, affirmative → grounded",             q: "what do I do?",           a: "You build AI software.",         g: true },
  { d: "value omitted → NOT grounded",              q: "what's my name?",         a: "I do not know your name.",       g: false },
  { d: "wrong-slot (wifi, no memory) → NOT grounded", q: "what's my wifi password?", a: "Your name is Chris.",         g: false },
  { d: "no query → NOT grounded",                   q: "",                        a: "Chris.",                          g: false },
  { d: "value present but irrelevant slot → NOT grounded", q: "where do I live?",  a: "Your name is Chris.",            g: false }
];

let pass = 0, fail = 0;
for (const c of cases) {
  const v = SPINE.verifyGrounding({ query: c.q, answer: c.a, memory_ids_in_prompt: ids, entries: ents });
  const ok = (!!v.grounded === c.g) && (!v.grounded || v.grounding_source === "spine_verified");
  if (ok) { pass++; console.log("PASS  " + c.d); }
  else { fail++; console.log("FAIL  " + c.d + "  got grounded=" + !!v.grounded + " source=" + (v.grounding_source||"-")); }
}
console.log("\nverifyGrounding: " + pass + "/" + (pass + fail) + " passed (candidate Article 3a amendment, spine " + SPINE.SPINE_VERSION + ")");
if (fail > 0) process.exit(1);
console.log("Conservative: no false grounding; negation trap held.");
process.exit(0);
