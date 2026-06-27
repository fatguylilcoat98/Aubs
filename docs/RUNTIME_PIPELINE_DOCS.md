# AUBS Runtime Pipeline — Complete Documentation

## Overview

The **Runtime Pipeline** is the **single source of truth** for execution order. It owns the complete flow from user message to final response.

**Key principle:** All execution order is defined in ONE place (RuntimePipeline). Adding future features doesn't scatter code — they plug in as pipeline stages or hooks.

```
User Message
    ↓
RuntimePipeline.execute()
    ├─ STAGE 1: Validate input
    ├─ STAGE 2: Build prompt
    ├─ STAGE 3: Call inference
    ├─ STAGE 4: Validate output
    ├─ STAGE 5: Save to AppState
    └─ HOOKS: Memory capture, analytics, governance
    ↓
Final Result
```

---

## Complete Execution Flow

```
┌────────────────────────────────────────────────────┐
│ ConversationController.sendMessage(userText)       │
│                                                     │
│ 1. Quick validation (not empty, is string)        │
│ 2. Show optimistic user message                    │
│ 3. Call RuntimePipeline.execute(trimmedText)      │
│ 4. Update UI with result                          │
│                                                     │
└─────────────────┬──────────────────────────────────┘
                  │
                  ↓
┌────────────────────────────────────────────────────┐
│ RuntimePipeline.execute(userMessage, options)      │
│                                                     │
│ EXECUTION FLOW:                                    │
│                                                     │
└─────────────────┬──────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ↓                   ↓
┌───────────────┐   ┌──────────────────┐
│ PRE-EXECUTION │   │ STAGE 1 VALIDATE │
│ HOOKS         │   │ INPUT            │
│               │   │                  │
│ (Future)      │   │ • Not null       │
└──────┬────────┘   │ • Is string      │
       │            │ • Not empty      │
       └────┬───────┴──────────────────┘
            │                  │
            │         ✗ Failed │
            │                  └─→ Return error
            │                     └─→ (Optimistic
            │                         message removed
            │                         by Controller)
            ↓
       ┌──────────────────┐
       │ STAGE 2 BUILD    │
       │ PROMPT           │
       │                  │
       │ Calls:           │
       │ PromptBuilder    │
       │ .buildMessages() │
       │                  │
       │ Returns:         │
       │ messages[]       │
       └──────┬───────────┘
              │
        ✗ Failed │
              │   └─→ Return error
              │
              ↓
       ┌──────────────────┐
       │ STAGE 3          │
       │ INFERENCE        │
       │                  │
       │ Calls:           │
       │ ModelAdapter     │
       │ .send(messages)  │
       │                  │
       │ Returns:         │
       │ response text    │
       └──────┬───────────┘
              │
        ✗ Failed │
              │   └─→ Return error
              │
              ↓
       ┌──────────────────┐
       │ STAGE 4          │
       │ VALIDATE OUTPUT  │
       │                  │
       │ Calls:           │
       │ OutputValidator  │
       │ .validate()      │
       │                  │
       │ Returns:         │
       │ { valid,         │
       │   confidence,    │
       │   warnings }     │
       └──────┬───────────┘
              │
        ✗ Invalid │
              │   └─→ Return error (with warnings)
              │
              ↓
       ┌──────────────────┐
       │ STAGE 5 SAVE     │
       │ STATE            │
       │                  │
       │ Calls:           │
       │ AppState methods │
       │ (already called  │
       │  by ModelAdapter)│
       │                  │
       │ Verifies saved   │
       └──────┬───────────┘
              │
        ✗ Failed │
              │   └─→ Return error
              │
              ↓
       ┌──────────────────┐
       │ SUCCESS ✓        │
       │                  │
       │ All stages passed│
       └──────┬───────────┘
              │
              ↓
       ┌──────────────────────────────┐
       │ HOOKS (if enabled):          │
       │                              │
       │ • Pre-execution              │
       │ • Memory capture             │
       │ • Analytics                  │
       │ • Governance                 │
       │ • (Future: streaming, error) │
       └──────┬───────────────────────┘
              │
              ↓
       ┌──────────────────┐
       │ Return success   │
       │ result           │
       │                  │
       │ {                │
       │   success: true, │
       │   message: ...,  │
       │   confidence,    │
       │   stageLogs      │
       │ }                │
       └──────────────────┘
              │
              ↓ Back to ConversationController
       Controller displays response
       End of execution
```

---

## Public API Reference

### `RuntimePipeline.execute(userMessage, options)`

**Parameters:**
- `userMessage` (string) — The user's message
- `options` (object, optional) — Execution options
  - `timeout` — Override timeout (default 30s)
  - `skipValidation` — Skip input validation (default false)

**Returns:** `{ success, message, warnings, confidence, usage, timestamp, executionId, stageLogs }`

**Example:**

```javascript
const result = await RuntimePipeline.execute("Hello!");

if (result.success) {
  console.log("Response:", result.message);
  console.log("Confidence:", result.confidence);
  console.log("Stage log:", result.stageLogs);
} else {
  console.log("Failed at:", result.stageLogs.find(s => s.status === 'failed').stage);
}
```

---

## Pipeline Stages

### Stage 1: Validate Input
**Responsibility:** Check that the input is valid
- Not null/undefined
- Is a string
- Not empty after trimming

**Failure:** Returns error immediately
**Success:** Proceeds to Stage 2

---

### Stage 2: Build Prompt
**Responsibility:** Assemble the complete inference prompt
- Calls `PromptBuilder.buildMessages(userMessage)`
- Returns `messages[]` ready for any model

**Inputs:** userMessage
**Failure:** Returns error immediately
**Success:** Passes `messages[]` to Stage 3

---

### Stage 3: Inference
**Responsibility:** Call the inference engine
- Calls `ModelAdapter.send(userMessage)`
- Engine returns response text
- Both messages are saved to AppState (by ModelAdapter)

**Inputs:** messages[] from PromptBuilder
**Failure:** Returns error immediately
**Success:** Passes response text to Stage 4

---

### Stage 4: Validate Output
**Responsibility:** Check that the response is valid and safe
- Calls `OutputValidator.validate(response)`
- Checks for hallucinations, safety issues, malformation
- Returns confidence score

**Inputs:** response text from ModelAdapter
**Failure:** Returns error with warnings, doesn't save
**Success:** Passes validated response to Stage 5

---

### Stage 5: Save State
**Responsibility:** Verify the conversation is saved
- Both messages already saved by ModelAdapter
- This stage verifies they're in AppState
- Future: Could trigger state migration, backup, etc.

**Inputs:** userMessage, response
**Failure:** Returns error (though save already happened)
**Success:** Marks execution as complete

---

## Hook System

The hook system allows future modules to plug into the pipeline without modifying it.

### Registered Hooks

```javascript
_hookRegistry: {
  preExecution: [],      // Run before pipeline starts
  postExecution: [],     // Run after all stages pass
  memoryCapture: [],     // Extract facts from conversation
  analytics: [],         // Log execution metrics
  governance: [],        // Apply governance rules
  streaming: [],         // (Reserved) Handle streaming responses
  error: []              // (Reserved) Handle errors
}
```

### Register a Hook

```javascript
// Single-use hook
RuntimePipeline.registerHook('memoryCapture', async (context) => {
  const { userMessage, response } = context;
  // Extract facts
  // Save to memory
});

// Returns unsubscribe function
const unsubscribe = RuntimePipeline.registerHook(...);
unsubscribe(); // Removes hook
```

### Hook Signatures

**preExecution Hook:**
```javascript
async (context) => {
  const { userMessage, options } = context;
  // Called before pipeline starts
}
```

**memoryCapture Hook:**
```javascript
async (context) => {
  const { userMessage, response } = context;
  // Extract facts from the conversation
  // Save to memory system
}
```

**analytics Hook:**
```javascript
async (context) => {
  const { success, executionId, duration } = context;
  // Log metrics
  // Send to analytics
}
```

**governance Hook:**
```javascript
async (context) => {
  const { message, confidence } = context;
  // Apply governance rules
  // Log decisions
}
```

---

## Pipeline Configuration

```javascript
RuntimePipeline.config = {
  timeout: 30000,                    // 30 second timeout
  enableCancellation: true,          // Allow cancellations
  enableStreamingHook: false,        // Streaming not yet enabled
  enableMemoryCaptureHook: false,    // Memory capture disabled by default
  enableAnalyticsHook: false,        // Analytics disabled by default
  enableGovernanceHook: false        // Governance disabled by default
}
```

**To enable hooks:**
```javascript
RuntimePipeline.config.enableMemoryCaptureHook = true;
RuntimePipeline.config.enableGovernanceHook = true;
```

---

## Stage Logs

Every execution returns `stageLogs` showing what happened:

```javascript
result.stageLogs = [
  { stage: 'validate', status: 'passed' },
  { stage: 'buildPrompt', status: 'passed', messages: 3 },
  { stage: 'inference', status: 'passed', responseLength: 245 },
  { stage: 'validateOutput', status: 'passed', confidence: 0.95 },
  { stage: 'saveState', status: 'passed' }
]
```

**On failure:**
```javascript
result.stageLogs = [
  { stage: 'validate', status: 'passed' },
  { stage: 'buildPrompt', status: 'failed', reason: 'Error...' }
]
```

---

## Architecture: Before and After

### Before Section 7 (Scattered Logic)

```
ConversationController
├─ Display optimistic message
├─ Call ModelAdapter.send()
├─ Call OutputValidator.validate()
├─ Check AppState
├─ Display response
└─ Return result
```

**Problem:** Execution order is buried in ConversationController. Adding features means modifying multiple places.

### After Section 7 (Centralized Pipeline)

```
ConversationController
├─ Quick validation
├─ Display optimistic message
├─ Call RuntimePipeline.execute() ← SINGLE CALL
└─ Update UI

RuntimePipeline.execute()
├─ Stage 1: Validate input
├─ Stage 2: Build prompt
├─ Stage 3: Inference
├─ Stage 4: Validate output
├─ Stage 5: Save state
└─ Hooks: (Memory, Analytics, Governance, Streaming...)
```

**Benefit:** All execution order in one place. New features plug in as stages or hooks.

---

## How Future Modules Integrate

### Example: Memory Capture Module (Future)

Instead of modifying RuntimePipeline:

```javascript
// New module registers its hook
MemoryCaptureModule.initialize(() => {
  RuntimePipeline.config.enableMemoryCaptureHook = true;
  
  RuntimePipeline.registerHook('memoryCapture', async (context) => {
    const { userMessage, response } = context;
    const facts = this.extractFacts(userMessage, response);
    const memories = MemoryCaptureModule.addMemories(facts);
    console.log(`Captured ${memories.length} facts`);
  });
});
```

**No changes to RuntimePipeline code.** It just calls registered hooks.

### Example: Analytics Module (Future)

```javascript
AnalyticsModule.initialize(() => {
  RuntimePipeline.config.enableAnalyticsHook = true;
  
  RuntimePipeline.registerHook('analytics', async (context) => {
    const { success, executionId, duration } = context;
    AnalyticsModule.logExecution({
      executionId,
      success,
      duration,
      timestamp: new Date().toISOString()
    });
  });
});
```

### Example: Governance Module (Future)

```javascript
GovernanceModule.initialize(() => {
  RuntimePipeline.config.enableGovernanceHook = true;
  
  RuntimePipeline.registerHook('governance', async (context) => {
    const { message, confidence } = context;
    const decision = GovernanceModule.evaluateResponse(message, confidence);
    console.log(`Governance decision: ${decision.action}`);
  });
});
```

---

## ConversationController After Section 7

Now **extremely simple**:

```javascript
async sendMessage(text) {
  // 1. Quick validation
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'Empty message' };
  }

  // 2. Show optimistic message
  const userMsgElement = this._displayUserMessage(text);

  // 3. Execute pipeline (THE ONLY PLACE WE ORCHESTRATE)
  const result = await RuntimePipeline.execute(text);

  // 4. Update UI
  if (result.success) {
    this._displayAiMessage(result.message);
  } else {
    userMsgElement.remove();
  }

  return result;
}
```

**What ConversationController does NOT do anymore:**
- ❌ Build prompts
- ❌ Call models
- ❌ Validate output
- ❌ Save state
- ❌ Orchestrate execution

All of that is now in RuntimePipeline.

---

## Testing the Pipeline

### Test Successful Execution

```javascript
const result = await RuntimePipeline.execute("Hello!");
console.log(result);
// {
//   success: true,
//   message: "...",
//   confidence: 0.95,
//   stageLogs: [
//     { stage: 'validate', status: 'passed' },
//     { stage: 'buildPrompt', status: 'passed', messages: 3 },
//     { stage: 'inference', status: 'passed', responseLength: 245 },
//     { stage: 'validateOutput', status: 'passed', confidence: 0.95 },
//     { stage: 'saveState', status: 'passed' }
//   ]
// }
```

### Test Failed Stage

```javascript
const result = await RuntimePipeline.execute("");
console.log(result.stageLogs);
// [
//   { stage: 'validate', status: 'failed', reason: 'Empty message' }
// ]
```

### Test Hook System

```javascript
let hookCalled = false;

RuntimePipeline.registerHook('memoryCapture', async (context) => {
  hookCalled = true;
  console.log("Memory hook called!");
});

RuntimePipeline.config.enableMemoryCaptureHook = true;
await RuntimePipeline.execute("Test message");

console.log(hookCalled); // true
```

---

## Status

**✅ Section 7 Complete.**

- [x] RuntimePipeline module built
- [x] All 5 stages implemented
- [x] Hook system (7 hooks reserved)
- [x] ConversationController simplified
- [x] Execution diagram provided
- [x] Stage documentation complete
- [x] Extension points ready for future modules
- [x] Configuration system for enabling/disabling hooks

---

## Files

- **`aubs-shell.html`** — Complete with Sections 1-7
  - RuntimePipeline module (~240 lines)
  - Simplified ConversationController
  - All 5 stages + hook system

- **`RUNTIME_PIPELINE_DOCS.md`** — This file

---

## Next Architecture Evolution

### Future Section 8: Memory System
- Implement `MemoryCaptureHook`
- Auto-extract facts from conversations
- Implement `OutputValidator._checkMemoryConsistency`

### Future Section 9: Governance Engine
- Implement `GovernanceHook`
- Implement `OutputValidator._checkIdentityCoreAdherence`
- Decision logging

### Future Section 10: Analytics & Monitoring
- Implement `AnalyticsHook`
- Execution metrics
- Error tracking

### Future Section 11: Streaming (Advanced)
- Implement `StreamingHook`
- Progressive response display
- Token-by-token output

### Future Sections 12+
- Any future feature plugs in as a hook or stage
- No modification to RuntimePipeline required
- No modification to ConversationController required

---

## Key Achievement

**Execution order is now owned by ONE module.** 

Adding features doesn't scatter code across the system. They plug in cleanly as pipeline stages or hooks.

The architecture guarantees:
- ✅ Single source of truth for execution order
- ✅ Clean extension points (hooks)
- ✅ No modification to existing code for new features
- ✅ Full traceability (stage logs)
- ✅ Configuration-driven behavior
- ✅ Future streaming and cancellation ready

**Status: FULLY EXTENSIBLE.**
