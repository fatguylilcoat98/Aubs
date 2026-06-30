/* ============================================================================
   AUBS RUNTIME SERVICE — Time (Class 1, self-verifiable)
   Truth · Safety · We Got Your Back

   The device clock + the platform timezone database are authoritative for the
   current instant, so the runtime answers time questions with CERTAINTY, model 0×.
   Basic local date/time is already owned by the reality-context governed facts;
   this service adds what they don't cover:
     - time in another city / timezone ("what time is it in Tokyo")
     - relative dates ("what's tomorrow's date", "yesterday")
     - the local timezone ("what timezone am I in")

   `now` is injectable (a function returning a Date) so behavior is deterministic
   and testable; the app passes the live device clock. DST is handled by the
   platform Intl timezone database, not by us. Unknown places fall through (null).

   Environment-agnostic: module.exports (Node) or window.AUBS_TIME.
   ========================================================================== */
(function () {
  "use strict";

  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Curated city / zone-name → IANA timezone. Small and stable; DST applied by the platform.
  var ZONES = {
    "utc": "UTC", "gmt": "UTC",
    "tokyo": "Asia/Tokyo", "japan": "Asia/Tokyo",
    "london": "Europe/London", "uk": "Europe/London", "england": "Europe/London",
    "paris": "Europe/Paris", "france": "Europe/Paris", "berlin": "Europe/Berlin", "germany": "Europe/Berlin",
    "madrid": "Europe/Madrid", "rome": "Europe/Rome", "moscow": "Europe/Moscow",
    "dubai": "Asia/Dubai", "delhi": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "india": "Asia/Kolkata",
    "beijing": "Asia/Shanghai", "shanghai": "Asia/Shanghai", "china": "Asia/Shanghai",
    "hong kong": "Asia/Hong_Kong", "singapore": "Asia/Singapore", "seoul": "Asia/Seoul",
    "sydney": "Australia/Sydney", "australia": "Australia/Sydney", "auckland": "Pacific/Auckland",
    "new york": "America/New_York", "nyc": "America/New_York", "boston": "America/New_York",
    "washington": "America/New_York", "miami": "America/New_York", "atlanta": "America/New_York",
    "chicago": "America/Chicago", "dallas": "America/Chicago", "houston": "America/Chicago",
    "denver": "America/Denver", "phoenix": "America/Phoenix",
    "los angeles": "America/Los_Angeles", "la": "America/Los_Angeles", "san francisco": "America/Los_Angeles",
    "seattle": "America/Los_Angeles", "sacramento": "America/Los_Angeles",
    "toronto": "America/Toronto", "mexico city": "America/Mexico_City",
    "sao paulo": "America/Sao_Paulo", "brazil": "America/Sao_Paulo",
    // US zone names (DST applied by platform for the current instant)
    "eastern": "America/New_York", "et": "America/New_York", "est": "America/New_York", "edt": "America/New_York",
    "central": "America/Chicago", "ct": "America/Chicago", "cst": "America/Chicago", "cdt": "America/Chicago",
    "mountain": "America/Denver", "mt": "America/Denver", "mst": "America/Denver", "mdt": "America/Denver",
    "pacific": "America/Los_Angeles", "pt": "America/Los_Angeles", "pst": "America/Los_Angeles", "pdt": "America/Los_Angeles"
  };

  function resolveZone(place) {
    var p = String(place || "").toLowerCase().trim().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
    p = p.replace(/^(the|in|at)\s+/, "").replace(/\s+(right now|now|currently)$/, "").trim();
    if (!p) return null;
    if (ZONES[p]) return { tz: ZONES[p], label: titleCase(p) };
    if (/^[a-z_]+\/[a-z_]+/i.test(place)) return { tz: place.trim(), label: place.trim() };   // raw IANA
    return null;
  }
  function titleCase(s) { return String(s).replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); }); }

  function makePack(opts) {
    opts = opts || {};
    var nowFn = opts.now || function () { return new Date(); };
    var localZone = opts.localZone || (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return "UTC"; } })() || "UTC";
    var PROOF = { class: "self_verifiable", source: "device clock / runtime time service", model_called: false };

    // Format an instant in a timezone -> "Monday, 9:00 PM" (or null if the zone is invalid).
    // Compose weekday + time ourselves so the output is stable across ICU versions (the combined
    // Intl format omits the comma on some platforms / Node versions).
    function inZone(date, tz) {
      try {
        var wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(date);
        var tm = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
        return wd + ", " + tm;
      } catch (e) { return null; }
    }
    function localDateStr(date) { return DAYS[date.getDay()] + ", " + MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear(); }

    function respond(q) {
      var s = String(q || ""), m;

      // local timezone
      if (/\bwhat(?:'?s| is)\s+my\s+time\s*zone\b/i.test(s) || /\bwhat\s+time\s*zone\s+am\s+i\s+in\b/i.test(s))
        return { answer: "You're in the " + localZone + " timezone.", proof: PROOF, factId: "time:zone_local" };

      // time in a place / timezone
      if ((m = s.match(/\b(?:what(?:'?s| is)\s+the\s+time|what\s+time\s+is\s+it|current\s+time|time)\s+(?:in|at)\s+(.+)/i))) {
        var z = resolveZone(m[1]);
        if (!z) return null;                              // unknown place → fall through, never invented
        var formatted = inZone(nowFn(), z.tz);
        if (!formatted) return null;
        return { answer: "In " + z.label + " it's " + formatted + ".", proof: PROOF, factId: "time:zone" };
      }

      // relative dates
      if (/\b(?:what(?:'?s| is)\s+(?:the\s+date\s+)?tomorrow|what\s+is\s+tomorrow'?s\s+date|tomorrow'?s\s+date|what\s+day\s+is\s+tomorrow)\b/i.test(s)) {
        var t = new Date(nowFn().getTime() + 86400000);
        return { answer: "Tomorrow is " + localDateStr(t) + ".", proof: PROOF, factId: "time:tomorrow" };
      }
      if (/\b(?:what(?:'?s| is)\s+(?:the\s+date\s+)?yesterday|what\s+(?:was|is)\s+yesterday'?s\s+date|yesterday'?s\s+date|what\s+day\s+was\s+yesterday)\b/i.test(s)) {
        var y = new Date(nowFn().getTime() - 86400000);
        return { answer: "Yesterday was " + localDateStr(y) + ".", proof: PROOF, factId: "time:yesterday" };
      }
      return null;
    }

    return {
      id: "time", name: "AUBS time service", version: "v1", proof_class: "self_verifiable",
      source: "device clock / runtime time service", license: "n/a (computation)",
      resolveZone: resolveZone, inZone: inZone, localDateStr: localDateStr, respond: respond, proof: PROOF
    };
  }

  var API = { makePack: makePack, resolveZone: resolveZone };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TIME = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_TIME = API;
})();
