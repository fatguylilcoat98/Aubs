/* AUBS Replay v0.1 (Milestone 7) — single entry point.
   Decision evidence + replay engine. Verification proves authenticity; replay proves the
   reasoning is reproducible. Isolated: the live app does NOT depend on this. */
(function () {
  "use strict";
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var evidence = require("./evidence");
    var engine = require("./replay-engine");
    module.exports = {
      EVIDENCE_VERSION: evidence.EVIDENCE_VERSION,
      captureDecision: evidence.captureDecision,
      verifyEvidence: evidence.verifyEvidence,
      verifyRecordIntegrity: evidence.verifyRecordIntegrity,
      bindIntent: evidence.bindIntent,
      replay: engine.replay,
      replayOnce: engine.replayOnce,
      DRIFT_REASONS: engine.DRIFT_REASONS
    };
  } else if (typeof window !== "undefined") {
    var E = window.AUBS_REPLAY_EVIDENCE || {}, G = window.AUBS_REPLAY_ENGINE || {};
    window.AUBS_REPLAY = {
      EVIDENCE_VERSION: E.EVIDENCE_VERSION,
      captureDecision: E.captureDecision, verifyEvidence: E.verifyEvidence,
      verifyRecordIntegrity: E.verifyRecordIntegrity, bindIntent: E.bindIntent,
      replay: G.replay, replayOnce: G.replayOnce, DRIFT_REASONS: G.DRIFT_REASONS
    };
  }
})();
