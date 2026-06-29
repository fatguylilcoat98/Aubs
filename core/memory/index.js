/* AUBS Typed Scoped Memory v0.1 (Milestone 9) — single entry point.
   Memory as a governed constitutional subsystem: typed, scoped, owned, provenanced,
   permissioned, append-only, tamper-evident, and replayable. Isolated: the live app does
   NOT depend on this. The memory service is the ONLY access path. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = {
      types: require("./types"),
      store: require("./store"),
      permissions: require("./permissions"),
      createMemoryService: require("./service").createMemoryService,
      replay: require("./replay-memory"),
      schema: require("./memory.schema.json")
    };
  } else if (typeof window !== "undefined") {
    var S = window.AUBS_MEMORY_SERVICE || {};
    window.AUBS_MEMORY = {
      types: window.AUBS_MEMORY_TYPES,
      store: window.AUBS_MEMORY_STORE,
      permissions: window.AUBS_MEMORY_PERMS,
      createMemoryService: S.createMemoryService,
      replay: window.AUBS_MEMORY_REPLAY
    };
  }
})();
