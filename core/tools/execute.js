/* ============================================================================
   AUBS Constitutional Tool Framework — governed tool executor (Milestone 10)
   Truth · Safety · We Got Your Back

   The kernel's tool-authorization path. Models never execute tools — the model REQUESTS,
   the kernel DECIDES. Lifecycle (mirrors the provider path):

     request → CAC Intent → Plan(tool_call) → GEL → tool eligibility →
       (allow & eligible? run the declared op behind the Drift Shield : block) →
       normalized CAC Result(ok/blocked/error/partial) → DecisionRecord → (replay).

   Execution returns a CAC Result ONLY — never raw tool output. Every execution is recorded
   with classifications (no secrets, no raw payloads).
   ========================================================================== */
(function () {
  "use strict";
  var isNode = (typeof require !== "undefined");
  var CAC    = isNode ? require("../cac")            : (typeof window !== "undefined" ? window.AUBS_CAC : null);
  var GEL    = isNode ? require("../gel")            : (typeof window !== "undefined" ? window.AUBS_GEL : null);
  var LEDGER = isNode ? require("../../spine/ledger.js") : (typeof window !== "undefined" ? window.AUBS_LEDGER : null);
  var ELIG   = isNode ? require("./eligibility")     : (typeof window !== "undefined" ? window.AUBS_TOOL_ELIG : null);
  var DRIFT  = isNode ? require("./drift-shield")    : (typeof window !== "undefined" ? window.AUBS_TOOL_DRIFT : null);
  var EXPL   = isNode ? require("./explanation")     : (typeof window !== "undefined" ? window.AUBS_TOOL_EXPL : null);

  var TOOL_KERNEL_VERSION = "tool-kernel-0.1";

  // request = { tool_id, operation, args, args_classification?, data_classification? }
  // options = { registry, bundle, ctx, ledgerStore, signingKey, created_at, ids…, execution_time_ms? }
  async function executeTool(request, options) {
    request = request || {}; options = options || {}; var O = options;
    var ctx = options.ctx || {};
    var bundle = options.bundle || (GEL ? GEL.defaultBundle : null);
    var registry = options.registry;
    var tool = (registry && registry.getTool) ? registry.getTool(request.tool_id) : null;
    var operation = request.operation;
    var net = !!(tool && (tool.requires_network === true));

    // 1) CAC Intent + 2) Plan (a tool_call step; egress reflects network use)
    var intent = CAC.builders.buildIntent("tool:" + (request.tool_id || "?") + ":" + (operation || "?"), {
      intent_id: O.intent_id, created_at: O.created_at, source: O.source || "user",
      constraints: { data_classification: request.data_classification || "personal", local_only: !net, max_egress: net ? "full" : "none" }
    });
    var plan = CAC.builders.buildPlan(intent, [{ step_type: "tool_call", target: request.tool_id || "tool", egress: net ? "full" : "none" }], { plan_id: O.plan_id, created_at: O.created_at });

    // 3) Governance
    var governance = GEL.evaluate(plan, bundle, { intent: intent, decision_id: O.decision_id, created_at: O.created_at });

    // 4) Tool eligibility (governance + permissions + network + device + confirmation + health)
    var eligibility = await ELIG.evaluate({ tool: tool, operation: operation, governance: governance, ctx: ctx });

    var result, status, label, toolOut = null, resultClass;
    if (!eligibility.eligible) {
      // BLOCKED — the tool never runs. A normalized CAC Result with status "blocked".
      label = "blocked"; status = "blocked"; resultClass = "blocked";
      result = CAC.builders.buildResult(intent, plan, { result_id: O.result_id, created_at: O.created_at, status: "blocked", output_text: "", model_id: null, provider_id: request.tool_id || null });
    } else {
      // 5) execute the DECLARED operation behind the Drift Shield
      toolOut = await DRIFT.runGuarded(tool, operation, request.args, ctx);
      resultClass = toolOut.output_classification || (toolOut.status === "failure" ? "none" : "unknown");
      if (toolOut.status === "success") { label = "success"; status = "ok"; }
      else if (toolOut.status === "partial") { label = "partial"; status = "partial"; }
      else { label = "failure"; status = "error"; }
      result = CAC.builders.buildResult(intent, plan, {
        result_id: O.result_id, created_at: O.created_at, status: status,
        output_text: (status === "ok" || status === "partial") ? (toolOut.output_text || "") : "",
        model_id: null, provider_id: request.tool_id || null
      });
    }

    // 6) DecisionRecord — classifications only, NO secrets / NO raw args or payloads
    var net_used = !!(tool && tool.requires_network === true) && eligibility.eligible;
    var drInput = {
      input: "tool:" + (request.tool_id || "?") + ":" + (operation || "?"),
      output: resultClass, timestamp: O.created_at, intent_id: intent.intent_id,
      model_id: "none", provider: request.tool_id || "tool", execution_type: "tool",
      memory_refs: [], retrieved_doc_refs: [],
      explanation: {
        kernel: TOOL_KERNEL_VERSION, decision: governance.decision, winning_rule: governance.winning_rule,
        status: label, tool_id: request.tool_id || null, tool_type: tool ? tool.tool_type : null,
        tool_version: tool ? tool.version : null, operation: operation || null,
        permission_set: tool ? (tool.permissions_required || []) : [],
        supported_operations: tool ? (tool.supported_operations || []) : [],
        arguments_classification: request.args_classification || classifyArgs(request.args),
        result_classification: resultClass,
        execution_time_ms: O.execution_time_ms != null ? O.execution_time_ms : null,
        approval_path: eligibility.approval_path,
        requires_user_confirmation: tool ? !!tool.requires_user_confirmation : false,
        network_used: net_used,
        eligibility_reasons: eligibility.reasons,
        missing_permissions: eligibility.missing_permissions || [],
        drift: !!(toolOut && toolOut.drift)
      },
      policy_version: governance.policy_bundle_hash
    };
    var record = null;
    if (options.ledgerStore && LEDGER) {
      try { record = await LEDGER.appendRecord(options.ledgerStore, drInput, options.signingKey || null); }
      catch (e) { record = null; }
    }

    var explanation = EXPL.toolWhy(record || { explanation: drInput.explanation });
    return { intent: intent, plan: plan, governance: governance, eligibility: eligibility, result: result, record: record, explanation: explanation, status: label, tool_id: request.tool_id, operation: operation };
  }

  // Classify arguments WITHOUT storing their values (privacy: only shape, never content).
  function classifyArgs(args) {
    if (args == null) return "none";
    if (typeof args === "string") return "string";
    if (Array.isArray(args)) return "array[" + args.length + "]";
    if (typeof args === "object") return "object{" + Object.keys(args).length + "}";
    return typeof args;
  }

  var API = { executeTool: executeTool, classifyArgs: classifyArgs, TOOL_KERNEL_VERSION: TOOL_KERNEL_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_EXECUTE = API;
})();
