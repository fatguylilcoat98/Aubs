/* ============================================================================
   AUBS Typed Scoped Memory — permission model (Milestone 9)
   Truth · Safety · We Got Your Back

   Reads require scope approval (cross-scope reads need explicit authorization). Writes
   require ownership. Permissions are deterministic and explainable — every decision
   carries a reason. (GEL/policy approval is layered on top by the memory service.)
   ========================================================================== */
(function () {
  "use strict";

  function isExpired(memory, now) {
    if (!memory || !memory.expires_at) return false;
    var t = Date.parse(memory.expires_at);
    return !isNaN(t) && now != null && now > t;
  }

  // ctx = { actor:{ user_id, scopes:[...] }, grants:[{scope, allow}], now }
  function canRead(memory, ctx) {
    ctx = ctx || {}; var actor = ctx.actor || {};
    if (!memory) return { allowed: false, reason: "memory_missing" };
    if (isExpired(memory, ctx.now)) return { allowed: false, reason: "expired" };
    // owner always reads their own memory
    if (memory.owner && actor.user_id && memory.owner === actor.user_id && memory.user_id === actor.user_id) {
      // ...but scope still applies for NON-private owner data only via scope/grant below if actor isn't in-scope
      if (memory.scope === "private") return { allowed: true, reason: "owner" };
    }
    var scopes = actor.scopes || [];
    if (scopes.indexOf(memory.scope) !== -1) return { allowed: true, reason: "in_scope" };
    // memory explicitly shared into one of the actor's scopes
    if ((memory.read_scopes || []).some(function (s) { return scopes.indexOf(s) !== -1; })) return { allowed: true, reason: "shared_scope" };
    // cross-scope read requires an explicit grant
    var grant = (ctx.grants || []).filter(function (g) { return g.scope === memory.scope && g.allow === true; })[0];
    if (grant) return { allowed: true, reason: "granted" };
    // owner reading their own non-private memory without being in-scope still allowed (it's theirs)
    if (memory.owner && actor.user_id && memory.owner === actor.user_id) return { allowed: true, reason: "owner" };
    return { allowed: false, reason: "cross_scope_denied" };
  }

  // Writes require ownership: the actor must be the owner AND the subject of the record.
  function canWrite(input, ctx) {
    ctx = ctx || {}; var actor = ctx.actor || {};
    if (!actor.user_id) return { allowed: false, reason: "no_actor" };
    if (input.owner && input.owner !== actor.user_id) return { allowed: false, reason: "ownership_violation" };
    if (input.user_id && input.user_id !== actor.user_id) return { allowed: false, reason: "ownership_violation" };
    return { allowed: true, reason: "owner" };
  }

  var API = { isExpired: isExpired, canRead: canRead, canWrite: canWrite };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_MEMORY_PERMS = API;
})();
