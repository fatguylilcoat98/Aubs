/* ============================================================================
   AUBS Constitutional Integration — architectural audit (Milestone 13)
   Truth · Safety · We Got Your Back

   Automatically verifies the One-Spine invariants: no circular dependencies, no kernel
   bypasses (GEL precedes execution; ledger precedes replay), and SINGLE-SOURCE constitutional
   primitives — exactly one policy decider, one provenance writer, one replay engine, one
   memory-permission check, one tool-permission check, one grounding function. A duplicate
   (someone forked a constitutional function) fails the audit. Produces a report.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var GRAPH = isNode ? require("./graph") : (typeof window !== "undefined" ? window.AUBS_CONSTITUTION_GRAPH : null);

  function scanDefs() {
    var fs = require("fs"), path = require("path");
    var roots = [path.join(__dirname, ".."), path.join(__dirname, "..", "..", "spine")];
    var counts = { appendRecord: 0, gelEvaluate: 0, replay: 0, canRead: 0, hasPermissions: 0, tagAnswer: 0 };
    var pats = {
      appendRecord: /function\s+appendRecord\s*\(/g,
      gelEvaluate: /function\s+evaluate\s*\(\s*plan\s*,\s*bundle/g,
      replay: /function\s+replay\s*\(\s*evidence/g,
      canRead: /function\s+canRead\s*\(/g,
      hasPermissions: /function\s+hasPermissions\s*\(/g,
      tagAnswer: /function\s+tagAnswer\s*\(/g
    };
    function walk(dir) {
      var ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      ents.forEach(function (e) {
        var p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "schemas") walk(p); }
        else if (/\.js$/.test(e.name)) {
          var src = fs.readFileSync(p, "utf8");
          for (var k in pats) { var m = src.match(pats[k]); if (m) counts[k] += m.length; }
        }
      });
    }
    roots.forEach(walk);
    return counts;
  }

  function runAudit() {
    var checks = [];
    var gv = GRAPH.validate();
    checks.push({ name: "no_circular_dependencies", ok: gv.ok, detail: gv.ok ? "pipeline DAG is acyclic" : JSON.stringify(gv.errors) });

    var S = GRAPH.STAGES; function before(a, b) { return S.indexOf(a) >= 0 && S.indexOf(a) < S.indexOf(b); }
    var order = before("Plan", "GEL") && before("GEL", "Eligibility") && before("Eligibility", "Execution") &&
                before("Execution", "DecisionRecord") && before("DecisionRecord", "Ledger") && before("Ledger", "Replay") && before("Replay", "Explanation");
    checks.push({ name: "no_kernel_bypass", ok: order, detail: "GEL precedes eligibility & execution; ledger precedes replay; explanation last" });

    if (isNode) {
      var c = scanDefs();
      var singles = [
        ["no_duplicate_provenance_writer", c.appendRecord, "appendRecord"],
        ["no_duplicate_policy_decider", c.gelEvaluate, "GEL evaluate(plan,bundle)"],
        ["no_duplicate_replay_path", c.replay, "replay(evidence)"],
        ["no_duplicate_memory_permission", c.canRead, "canRead"],
        ["no_duplicate_tool_permission", c.hasPermissions, "hasPermissions"],
        ["no_duplicate_grounding", c.tagAnswer, "tagAnswer"]
      ];
      singles.forEach(function (s) { checks.push({ name: s[0], ok: s[1] === 1, detail: s[1] + " definition of " + s[2] }); });
    }

    var ok = checks.every(function (x) { return x.ok; });
    return { ok: ok, checks: checks };
  }

  // Runtime audit of a single pipeline run: exactly one record; at most one of each decision.
  function auditRun(state) {
    var c = (state && state.counters) || {};
    var checks = [
      { name: "exactly_one_decision_record", ok: c.records === 1, detail: c.records + " record(s)" },
      { name: "at_most_one_gel_decision", ok: (c.gel || 0) <= 1, detail: (c.gel || 0) + " GEL eval(s)" },
      { name: "at_most_one_provider_run", ok: (c.provider_runs || 0) <= 1, detail: (c.provider_runs || 0) + " provider run(s)" },
      { name: "at_most_one_provider_eligibility", ok: (c.provider_eligibility || 0) <= 1, detail: (c.provider_eligibility || 0) + " eligibility eval(s)" }
    ];
    return { ok: checks.every(function (x) { return x.ok; }), checks: checks };
  }

  var API = { runAudit: runAudit, auditRun: auditRun, scanDefs: isNode ? scanDefs : undefined };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONSTITUTION_AUDIT = API;
})();
