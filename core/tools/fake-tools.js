/* ============================================================================
   AUBS Constitutional Tool Framework — fake reference tools (Milestone 10)
   Truth · Safety · We Got Your Back

   Deterministic, side-effect-FREE tools that prove constitutional execution (not
   functionality). NO real filesystem / calendar / network / shell access — each returns
   canned, classified output. The shape every real tool will follow.
   ========================================================================== */
(function () {
  "use strict";

  function tool(over) {
    return Object.assign({
      tool_id: "tool", tool_type: "filesystem", version: "1.0.0",
      permissions_required: [], requires_network: false, requires_user_confirmation: false,
      supported_operations: ["noop"], enabled: true,
      healthCheck: function () { return Promise.resolve({ ok: true }); },
      metadata: function () { return { tool_id: over && over.tool_id, version: over && over.version }; },
      execute: function () { return Promise.resolve({ status: "success", output_text: "(ok)", output_classification: "none" }); }
    }, over || {});
  }

  var fakeFilesystemTool = tool({
    tool_id: "fs.read", tool_type: "filesystem", version: "1.0.0",
    permissions_required: ["filesystem.read"], supported_operations: ["read", "list"],
    metadata: function () { return { tool_id: "fs.read", version: "1.0.0", description: "read/list files (fake)" }; },
    execute: function (op) {
      if (op === "list") return Promise.resolve({ status: "success", output_text: "fileA.txt, fileB.txt", output_classification: "file_list" });
      return Promise.resolve({ status: "success", output_text: "(canned file contents)", output_classification: "file_content" });
    }
  });

  var fakeFilesystemWriteTool = tool({
    tool_id: "fs.write", tool_type: "filesystem", version: "1.0.0",
    permissions_required: ["filesystem.write"], requires_user_confirmation: true, supported_operations: ["write"],
    metadata: function () { return { tool_id: "fs.write", version: "1.0.0", description: "write files (fake, needs confirmation)" }; },
    execute: function () { return Promise.resolve({ status: "success", output_text: "wrote 1 file (fake)", output_classification: "write_ack" }); }
  });

  var fakeCalendarTool = tool({
    tool_id: "calendar", tool_type: "calendar", version: "2.1.0",
    permissions_required: ["calendar.read"], supported_operations: ["list_events"],
    metadata: function () { return { tool_id: "calendar", version: "2.1.0", description: "read calendar (fake)" }; },
    execute: function () { return Promise.resolve({ status: "success", output_text: "2 events tomorrow", output_classification: "event_list" }); }
  });

  var fakeHttpTool = tool({
    tool_id: "http", tool_type: "http", version: "1.0.0",
    permissions_required: ["network.http"], requires_network: true, supported_operations: ["get"],
    metadata: function () { return { tool_id: "http", version: "1.0.0", description: "HTTP GET (fake, no real network)" }; },
    execute: function () { return Promise.resolve({ status: "success", output_text: "200 OK (canned body)", output_classification: "http_response" }); }
  });

  var fakeShellTool = tool({
    tool_id: "shell", tool_type: "shell", version: "0.9.0",
    permissions_required: ["shell.execute"], requires_user_confirmation: true, supported_operations: ["run"],
    metadata: function () { return { tool_id: "shell", version: "0.9.0", description: "run a shell command (fake)" }; },
    execute: function () { return Promise.resolve({ status: "success", output_text: "(canned stdout)", output_classification: "shell_output" }); }
  });

  // failure / drift / unhealthy fakes
  var fakeFailingTool = tool({ tool_id: "failing", tool_type: "filesystem", permissions_required: ["filesystem.read"], supported_operations: ["read"], execute: function () { return Promise.resolve({ status: "failure", message: "fake tool failed", output_classification: "none" }); } });
  var fakeDriftTool = tool({ tool_id: "drift", tool_type: "filesystem", permissions_required: ["filesystem.read"], supported_operations: ["read"], execute: function () { return Promise.resolve({ status: "success", junk: true }); } });   // missing output_text/classification
  var fakeThrowingTool = tool({ tool_id: "throwing", tool_type: "shell", permissions_required: ["shell.execute"], requires_user_confirmation: true, supported_operations: ["run"], execute: function () { return Promise.reject(new Error("tool crashed")); } });
  var fakeUnhealthyTool = tool({ tool_id: "unhealthy", tool_type: "http", permissions_required: ["network.http"], requires_network: true, supported_operations: ["get"], healthCheck: function () { return Promise.resolve({ ok: false, error: "down" }); } });
  var fakePartialTool = tool({ tool_id: "partial", tool_type: "database", permissions_required: ["database.query"], supported_operations: ["query"], execute: function () { return Promise.resolve({ status: "partial", output_text: "first 100 rows (truncated)", output_classification: "row_set" }); } });

  var API = {
    tool: tool,
    fakeFilesystemTool: fakeFilesystemTool, fakeFilesystemWriteTool: fakeFilesystemWriteTool,
    fakeCalendarTool: fakeCalendarTool, fakeHttpTool: fakeHttpTool, fakeShellTool: fakeShellTool,
    fakeFailingTool: fakeFailingTool, fakeDriftTool: fakeDriftTool, fakeThrowingTool: fakeThrowingTool,
    fakeUnhealthyTool: fakeUnhealthyTool, fakePartialTool: fakePartialTool
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_FAKES = API;
})();
