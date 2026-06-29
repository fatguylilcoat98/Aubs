/* ============================================================================
   AUBS Constitutional Skills Framework — fake reference skills (M11)
   Truth · Safety · We Got Your Back

   Deterministic, side-effect-FREE skills. Each DECLARES the providers/tools/memory-scopes/
   permissions it requires (so governance is real) even though the implementation is canned.
   No LLM-authored plans, no dynamic code. The resource ids referenced here are the M5
   provider fakes (fake-local-ok / fake-cloud-ok) and the M10 tool fakes (calendar/http/shell).
   ========================================================================== */
(function () {
  "use strict";

  function skill(over) {
    return Object.assign({
      skill_id: "skill", name: "Skill", version: "1.0.0", description: "",
      inputs: [], outputs: [], required_permissions: [], allowed_tools: [], allowed_providers: [],
      allowed_memory_scopes: [], requires_network: false, requires_user_confirmation: false,
      risk_level: "low", supported_operations: ["run"], enabled: true, metadata: {},
      execute: function () { return Promise.resolve({ status: "success", output_text: "(ok)", output_classification: "none" }); }
    }, over || {});
  }

  var summarize_note = skill({
    skill_id: "summarize_note", name: "Summarize Note", version: "1.0.0",
    description: "Summarize a local note using on-device inference + private memory.",
    inputs: ["note_text"], outputs: ["summary"],
    allowed_providers: ["fake-local-ok"], allowed_memory_scopes: ["private"],
    risk_level: "low", supported_operations: ["summarize"],
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned summary of the note)", output_classification: "summary" }); }
  });

  var local_fact_answer = skill({
    skill_id: "local_fact_answer", name: "Local Fact Answer", version: "1.0.0",
    description: "Answer from private memory only, fully on-device.",
    inputs: ["question"], outputs: ["answer"],
    allowed_memory_scopes: ["private"], risk_level: "low", supported_operations: ["answer"],
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned fact answer from memory)", output_classification: "fact" }); }
  });

  var calendar_lookup = skill({
    skill_id: "calendar_lookup", name: "Calendar Lookup", version: "1.0.0",
    description: "Read upcoming events via the calendar tool.",
    inputs: ["date_range"], outputs: ["events"],
    allowed_tools: ["calendar"], required_permissions: ["calendar.read"],
    risk_level: "low", supported_operations: ["lookup"],
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned: 2 events tomorrow)", output_classification: "event_list" }); }
  });

  var http_fetch_summary = skill({
    skill_id: "http_fetch_summary", name: "HTTP Fetch + Summary", version: "1.2.0",
    description: "Fetch a URL (tool) and summarize it (cloud provider).",
    inputs: ["url"], outputs: ["summary"],
    allowed_tools: ["http"], allowed_providers: ["fake-cloud-ok"], required_permissions: ["network.http"],
    requires_network: true, risk_level: "medium", supported_operations: ["fetch_summarize"],
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned summary of fetched page)", output_classification: "summary" }); }
  });

  var shell_status_check = skill({
    skill_id: "shell_status_check", name: "Shell Status Check", version: "0.9.0",
    description: "Run a read-only status command via the shell tool (needs confirmation).",
    inputs: [], outputs: ["status"],
    allowed_tools: ["shell"], required_permissions: ["shell.execute"],
    requires_user_confirmation: true, risk_level: "high", supported_operations: ["status"],
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned system status)", output_classification: "shell_output" }); }
  });

  var API = { skill: skill, summarize_note: summarize_note, local_fact_answer: local_fact_answer, calendar_lookup: calendar_lookup, http_fetch_summary: http_fetch_summary, shell_status_check: shell_status_check };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_SKILL_FAKES = API;
})();
