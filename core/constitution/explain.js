/* ============================================================================
   AUBS Constitutional Integration — "Explain Constitution" (Milestone 13)
   Truth · Safety · We Got Your Back

   Prints the EXACT constitutional path a request followed, derived only from the recorded
   trace — never from model output. A developer command, not a UI feature.
   ========================================================================== */
(function () {
  "use strict";
  function explainConstitution(trace) {
    var steps = (trace || []).map(function (t) {
      var line = t.stage;
      if (t.detail) line += " (" + t.detail + ")";
      if (t.status && t.status !== "ok") line += " [" + t.status + "]";
      return line;
    });
    steps.push("Done");
    return steps.join("\n↓\n");
  }
  var API = { explainConstitution: explainConstitution };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONSTITUTION_EXPLAIN = API;
})();
