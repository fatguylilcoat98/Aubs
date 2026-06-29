/* ============================================================================
   AUBS Kernel — Level 1 explanation (Milestone 3)
   Truth · Safety · We Got Your Back

   One honest sentence, DERIVED FROM RECORDED STATE (the governance decision, the
   execution status, and whether any data left the device) — never invented from model
   output. This is the seed of the Blueprint's tiered explainability (rendered from the
   ledger, not reconstructed separately).
   ========================================================================== */
(function () {
  "use strict";

  // outcome = { decision, status, kind, left_device }
  function level1(outcome) {
    outcome = outcome || {};
    var tail = outcome.left_device ? "Data left this device." : "Nothing left this device.";
    var head;
    if (outcome.decision !== "allow") head = "Blocked by policy.";
    else if (outcome.kind === "refusal") head = "Refused for safety.";
    else if (outcome.kind === "failed") head = "Execution failed before an answer.";
    else head = "Answered locally.";
    return head + " " + tail;
  }

  var API = { level1: level1 };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_EXPLANATION = API;
})();
