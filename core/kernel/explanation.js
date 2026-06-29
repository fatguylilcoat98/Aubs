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
    else if (outcome.kind === "no_provider") head = "No eligible provider.";
    else if (outcome.kind === "failed") head = "Execution failed before an answer.";
    else if (outcome.kind === "executed") head = outcome.left_device ? "Answered via a provider." : "Answered locally.";
    else head = "Answered locally.";
    return head + " " + tail;
  }

  // M8 — the honest provider "Why?", derived ENTIRELY from a recorded DecisionRecord
  // (never from model output). Returns a structured object + a formatted text block.
  function providerDetail(record) {
    record = record || {}; var e = record.explanation || {};
    var pid = e.provider_id || record.provider || null;
    var isLocal = (e.provider_type === "local") || pid === "local";
    var model = e.model_name || record.model_id || null;
    var answeredWith = pid ? (pid + (model && model !== pid ? " " + model : "")) : "AUBS";
    var memCount = (record.memory_refs && record.memory_refs.length) || 0;
    var d = {
      answered_with: answeredWith,
      reason: isLocal ? "Local execution was selected." : "Local execution was not selected.",
      payload_classification: cap(e.payload_classification || "unknown"),
      data_left_device: (e.left_device ? "Prompt only." : "Nothing."),
      memory_sent: memCount ? (memCount + " item" + (memCount === 1 ? "" : "s") + ".") : "None.",
      policy: e.decision === "allow" ? "Allowed." : (e.decision ? cap(e.decision) + "." : "Unknown."),
      model: model, request_id: e.request_id || null,
      egress_level: e.egress_level || null
    };
    d.text = "Answered using " + d.answered_with + ".\n" +
             "Reason: " + d.reason + "\n" +
             "Payload classification: " + d.payload_classification + ".\n" +
             "Data left device: " + d.data_left_device + "\n" +
             "Memory sent: " + d.memory_sent + "\n" +
             "Policy: " + d.policy;
    return d;
  }
  function cap(s) { s = String(s == null ? "" : s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var API = { level1: level1, providerDetail: providerDetail };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_KERNEL_EXPLANATION = API;
})();
