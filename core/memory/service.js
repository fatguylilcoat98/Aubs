/* ============================================================================
   AUBS Typed Scoped Memory — governed memory service (Milestone 9)
   Truth · Safety · We Got Your Back

   The ONLY access path to memory. Callers (the kernel) request memory; they never query
   storage directly. Every read/write/denial is governed (GEL + scope + ownership + schema),
   recorded as a DecisionRecord, and replayable. Deletes never erase — they supersede.

   read()  → { ok, memories, reason, confidence, permission, denied, record }
   write() → { ok, memory, reason, permission, governance, record }
   Nothing happens silently.
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC    = isNode ? require("../cac")            : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var GEL    = isNode ? require("../gel")            : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var T      = isNode ? require("./types")           : (typeof window !== "undefined" ? window.AUBS_MEMORY_TYPES : null);
  var STORE  = isNode ? require("./store")           : (typeof window !== "undefined" ? window.AUBS_MEMORY_STORE : null);
  var PERMS  = isNode ? require("./permissions")     : (typeof window !== "undefined" ? window.AUBS_MEMORY_PERMS : null);
  var SCHEMA = isNode ? require("./memory.schema.json") : (typeof window !== "undefined" ? window.AUBS_MEMORY_SCHEMA : null);

  function nowISO(clock) { return clock ? clock() : new Date().toISOString(); }
  function nowMs(clockMs) { return clockMs ? clockMs() : Date.now(); }
  var _ctr = 0;
  function genId(idgen) { if (idgen) return idgen(); try { if (globalThis.crypto && globalThis.crypto.randomUUID) return "mem_" + globalThis.crypto.randomUUID(); } catch (e) {} _ctr++; return "mem_" + _ctr; }

  function createMemoryService(cfg) {
    cfg = cfg || {};
    var store = cfg.store || STORE.createMemoryLog();
    var signingKey = cfg.signingKey || null;            // signs the memory log
    var ledgerStore = cfg.ledgerStore || null;          // DecisionRecords land here
    var ledgerKey = cfg.ledgerKey || null;
    var policyBundle = cfg.policyBundle || (GEL ? GEL.defaultBundle : null);

    function govern(op, scope) {
      // a VALID CAC plan (GEL fail-closed-validates the plan it evaluates)
      var intent = CAC.builders.buildIntent("memory:" + op, { source: "system", constraints: { data_classification: "personal", local_only: true, max_egress: "none" } });
      var steps = [{ step_type: op === "read" ? "memory_read" : "memory_write", egress: "none", target: scope || "memory" }];
      var plan = CAC.builders.buildPlan(intent, steps, {});
      return GEL.evaluate(plan, policyBundle, { intent: intent });
    }
    function record(op, exec_type, ids, scope, extra) {
      if (!ledgerStore || !LEDGER) return Promise.resolve(null);
      var dr = {
        input: op, output: (ids || []).join(","), timestamp: extra && extra.timestamp,
        intent_id: (extra && extra.conversation_id) || "mem",
        model_id: "none", provider: "memory", execution_type: exec_type,
        memory_refs: ids || [], retrieved_doc_refs: [],
        explanation: Object.assign({ op: op, scope: scope || null }, extra && extra.explanation || {}),
        policy_version: (GEL && GEL.bundleHash) ? GEL.bundleHash(policyBundle) : "none"
      };
      return LEDGER.appendRecord(ledgerStore, dr, ledgerKey).catch(function () { return null; });
    }

    // ── WRITE ───────────────────────────────────────────────────────────────────────
    // GEL → schema validation → ownership. Any failure: NO append, a denial DecisionRecord.
    function write(input, ctx) {
      ctx = ctx || {}; input = input || {};
      var g = govern("write", input.scope);
      if (g.decision !== "allow") {
        return record("memory_write", "memory_denied", [], input.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "denied", governance: g.decision, reason: "governance_" + g.decision } })
          .then(function (rec) { return { ok: false, reason: "governance_" + g.decision, governance: g, permission: { allowed: false, reason: "governance_" + g.decision }, record: rec }; });
      }
      // construct the full TSM object with conservative defaults
      var type = input.type || "FACT";
      var inferred = T.mustBeInferred(type) ? true : (input.inferred === true);   // INFERENCE is always inferred
      var mem = {
        record_version: "tsm-1",
        memory_id: input.memory_id || genId(cfg.idgen),
        type: type,
        user_id: input.user_id,
        owner: input.owner || input.user_id,
        scope: input.scope || "private",
        read_scopes: input.read_scopes || [],
        content: input.content != null ? input.content : null,
        inferred: inferred,
        confidence: input.confidence != null ? input.confidence : (inferred ? 0.5 : 0.9),
        source_classification: input.source_classification || (inferred ? "model_inferred" : "user_stated"),
        provenance: {
          created_from: (input.provenance && input.provenance.created_from) || null,
          conversation_id: ctx.conversation_id || (input.provenance && input.provenance.conversation_id) || null,
          decision_record: (input.provenance && input.provenance.decision_record) || null,
          source: (input.provenance && input.provenance.source) || (inferred ? "inference" : "user"),
          timestamp: nowISO(cfg.clock)
        },
        evidence_refs: input.evidence_refs || [],
        supersedes: input.supersedes || null,
        deleted: input.deleted === true,
        created_at: input.created_at || nowISO(cfg.clock),
        updated_at: input.supersedes ? nowISO(cfg.clock) : null,
        expires_at: input.expires_at || null
      };
      // schema validation
      var v = CAC.validate.validate(SCHEMA, mem);
      if (!v.valid) {
        return record("memory_write", "memory_denied", [], mem.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "denied", reason: "schema_invalid", errors: v.errors.slice(0, 4) } })
          .then(function (rec) { return { ok: false, reason: "schema_invalid", errors: v.errors, record: rec }; });
      }
      // ownership
      var w = PERMS.canWrite(mem, ctx);
      if (!w.allowed) {
        return record("memory_write", "memory_denied", [], mem.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "denied", reason: w.reason } })
          .then(function (rec) { return { ok: false, reason: w.reason, permission: w, record: rec }; });
      }
      return STORE.appendMemory(store, mem, signingKey).then(function () {
        return record("memory_write", "memory_write", [mem.memory_id], mem.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "allowed", type: mem.type, inferred: mem.inferred } })
          .then(function (rec) { return { ok: true, memory: mem, reason: "written", permission: w, governance: g, record: rec }; });
      });
    }

    // Only FACT and PREFERENCE may be created automatically. INFERENCE is created explicitly,
    // always marked inferred — never silently promoted to fact.
    function captureAuto(facts, ctx) {
      facts = facts || [];
      var results = [];
      function step(i) {
        if (i >= facts.length) return Promise.resolve(results);
        var f = facts[i];
        if (!T.isAutoCreatable(f.type || "FACT")) { results.push({ ok: false, reason: "type_not_auto_creatable", type: f.type }); return step(i + 1); }
        return write(Object.assign({ user_id: ctx.actor && ctx.actor.user_id, type: "FACT", inferred: false, source_classification: "user_stated" }, f), ctx).then(function (r) { results.push(r); return step(i + 1); });
      }
      return step(0);
    }
    function inferFact(input, ctx) { return write(Object.assign({}, input, { type: "INFERENCE", inferred: true, source_classification: "model_inferred" }), ctx); }

    // ── READ ────────────────────────────────────────────────────────────────────────
    // GEL → per-memory scope/permission. Returns matched+permitted memories, the denials,
    // an aggregate confidence, and a DecisionRecord. The kernel never sees raw storage.
    function read(query, ctx) {
      query = query || {}; ctx = ctx || {};
      var g = govern("read", query.scope);
      if (g.decision !== "allow") {
        return record("memory_read", "memory_denied", [], query.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "denied", governance: g.decision, reason: "governance_" + g.decision } })
          .then(function (rec) { return { ok: false, memories: [], reason: "governance_" + g.decision, confidence: 0, permission: { allowed: false, reason: "governance_" + g.decision }, denied: [], record: rec }; });
      }
      return store.all().then(function (records) {
        var active = STORE.activeMemories(records);
        var matched = active.filter(function (m) {
          if (query.user_id && m.user_id !== query.user_id) return false;
          if (query.scope && m.scope !== query.scope) return false;
          if (query.type && m.type !== query.type) return false;
          if (query.memory_ids && query.memory_ids.indexOf(m.memory_id) === -1) return false;
          if (query.text && (m.content || "").toLowerCase().indexOf(String(query.text).toLowerCase()) === -1) return false;
          return true;
        });
        var allowed = [], denied = [];
        matched.forEach(function (m) {
          var p = PERMS.canRead(m, ctx);
          if (p.allowed) allowed.push(m); else denied.push({ memory_id: m.memory_id, scope: m.scope, reason: p.reason });
        });
        var conf = allowed.length ? (allowed.reduce(function (s, m) { return s + (m.confidence || 0); }, 0) / allowed.length) : 0;
        var ids = allowed.map(function (m) { return m.memory_id; });
        return record("memory_read", ids.length ? "memory_read" : "memory_denied", ids, query.scope, { conversation_id: ctx.conversation_id, explanation: { permission: ids.length ? "allowed" : "none", returned: ids.length, denied: denied.length } })
          .then(function (rec) {
            return { ok: true, memories: allowed, reason: ids.length ? "ok" : (denied.length ? "all_denied" : "no_match"), confidence: conf, permission: { allowed: true, reason: "governed_read" }, denied: denied, record: rec };
          });
      });
    }

    // ── SUPERSEDE / DELETE — append-only; history survives ───────────────────────────
    function supersede(memory_id, newFields, ctx) {
      ctx = ctx || {};
      return store.all().then(function (records) {
        var cur = STORE.activeMemories(records).filter(function (m) { return m.memory_id === memory_id; })[0];
        if (!cur) return { ok: false, reason: "not_found" };
        var w = PERMS.canWrite(cur, ctx);
        if (!w.allowed) return record("memory_supersede", "memory_denied", [memory_id], cur.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "denied", reason: w.reason } }).then(function (rec) { return { ok: false, reason: w.reason, record: rec }; });
        // a new VERSION with the SAME memory_id (latest wins); the prior version stays in history.
        var merged = Object.assign({}, cur, newFields, { memory_id: memory_id, supersedes: cur.record_hash, created_at: cur.created_at });
        delete merged.record_hash; delete merged.signature; delete merged.seq; delete merged.prev_hash;
        return write(merged, ctx).then(function (r) {
          return record("memory_supersede", "memory_supersede", [memory_id], cur.scope, { conversation_id: ctx.conversation_id, explanation: { permission: "allowed", supersedes: cur.record_hash } })
            .then(function (rec) { return { ok: r.ok, superseded: memory_id, memory: r.memory, record: rec }; });
        });
      });
    }
    function remove(memory_id, ctx) {   // logical delete = a deactivating superseding record
      return supersede(memory_id, { deleted: true, content: null }, ctx);
    }

    // Snapshot for replay: active memories + the full signed log.
    function snapshot() { return store.all().then(function (records) { return { active: STORE.activeMemories(records), log: records }; }); }
    function verify(publicKey) { return store.all().then(function (records) { return STORE.verifyMemoryLog(records, publicKey); }); }

    return { write: write, read: read, captureAuto: captureAuto, inferFact: inferFact, supersede: supersede, remove: remove, snapshot: snapshot, verify: verify, _store: store };
  }

  var API = { createMemoryService: createMemoryService };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_SERVICE = API;
})();
