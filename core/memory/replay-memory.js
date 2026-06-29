/* ============================================================================
   AUBS Typed Scoped Memory — retrieval replay / drift (Milestone 9)
   Truth · Safety · We Got Your Back

   A memory retrieval is replayable: snapshot what was returned at decision time, then later
   compare against current memory state to detect — WITHOUT altering history — whether a
   memory was removed, superseded, or had its permission / scope / confidence changed.
   Composes with M7 (record verification proves authenticity; this proves the memory inputs
   still reproduce).
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var PERMS = isNode ? require("./permissions") : (typeof window !== "undefined" ? window.AUBS_MEMORY_PERMS : null);

  // Capture the minimal, comparable shape of what a read returned (incl. the version hash).
  function snapshotFromRead(readResult) {
    return ((readResult && readResult.memories) || []).map(function (m) {
      return { memory_id: m.memory_id, record_hash: m.record_hash || null, scope: m.scope, confidence: m.confidence, type: m.type, inferred: m.inferred };
    });
  }

  // Compare a snapshot against the CURRENT memory state. current = { active:[...], log:[...] }
  // (from service.snapshot()). ctx.actor lets us re-check read permission. Deterministic.
  function compareMemory(snapshot, current, ctx) {
    ctx = ctx || {}; current = current || { active: [], log: [] };
    var activeById = {}; (current.active || []).forEach(function (m) { activeById[m.memory_id] = m; });
    var reasons = {}, diffs = [];
    function add(reason, diff) { reasons[reason] = true; diffs.push(diff); }

    (snapshot || []).forEach(function (orig) {
      var cur = activeById[orig.memory_id];
      if (!cur) { add("memory_removed", { memory_id: orig.memory_id, change: "removed" }); return; }   // deleted/absent from active
      // a different active VERSION means the exact memory that was read was superseded
      if (orig.record_hash && cur.record_hash && cur.record_hash !== orig.record_hash) {
        add("memory_superseded", { memory_id: orig.memory_id, change: "superseded" });
        if (cur.scope !== orig.scope) add("memory_scope_changed", { memory_id: orig.memory_id, change: "scope", from: orig.scope, to: cur.scope });
        if (cur.confidence !== orig.confidence) add("memory_confidence_changed", { memory_id: orig.memory_id, change: "confidence", from: orig.confidence, to: cur.confidence });
      }
      if (ctx.actor) { var p = PERMS.canRead(cur, ctx); if (!p.allowed) add("memory_permission_changed", { memory_id: orig.memory_id, change: "permission", reason: p.reason }); }
    });

    var list = Object.keys(reasons);
    return { status: list.length ? "DRIFT" : "MATCH", reasons: list, diffs: diffs };
  }

  var API = { snapshotFromRead: snapshotFromRead, compareMemory: compareMemory };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_REPLAY = API;
})();
