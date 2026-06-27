# AUBS Conversation Controller — Complete Documentation

## Overview

The **Conversation Controller** is the **single front door** for the entire chat system. It is the ONLY module the UI is allowed to call.

**Key principle:** Every chat interaction goes through ConversationController, which orchestrates everything else:
- PromptBuilder (for prompt assembly)
- ModelAdapter (for inference)
- AppState (for persistence)

```
UI calls ConversationController
         ↓
ConversationController orchestrates everything
         ↓
PromptBuilder.buildMessages()
         ↓
ModelAdapter.send()
         ↓
InferenceEngine (MockEngine, WebLLM, etc.)
         ↓
Messages saved to AppState
         ↓
UI updated with response
```

---

## Event Flow Diagram

### Complete Send Flow (Happy Path)

```
┌─────────────────────────────────────────────────────────────┐
│ UI                                                            │
│ User types message, hits send                                │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ handleSendMessage()
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ ConversationController.sendMessage(text)                    │
│                                                              │
│ 1. Validate input (not empty, is string)                   │
│ 2. Check system ready (isReady() == true)                  │
│ 3. Prevent duplicate sends (isSending == false)            │
│ 4. Set isSending = true                                    │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ ConversationController._displayUserMessage(text)            │
│                                                              │
│ OPTIMISTIC: Show user message immediately                  │
│ (doesn't wait for AI to respond)                           │
│                                                              │
│ Result: User sees their message in the chat                │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ ModelAdapter.send(userMessage)                              │
│                                                              │
│ 1. PromptBuilder.buildMessages(userMessage)                │
│ 2. Engine.send(messages)                                   │
│ 3. addChatMessage('user', userMessage)                     │
│ 4. addChatMessage('assistant', response)                   │
│ 5. Return { success, message, usage }                      │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ Response received
┌─────────────────────────────────────────────────────────────┐
│ ConversationController._displayAiMessage(response)          │
│                                                              │
│ Show AI response in chat                                   │
│                                                              │
│ Result: User sees full conversation                        │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ ConversationController                                      │
│                                                              │
│ Set isSending = false                                      │
│ Return { success: true, message, usage, timestamp }        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Failure Case (User Message Already Shown)

```
┌──────────────────────────────────────────────────┐
│ User message displayed (optimistic)              │
│ ConversationController.sendMessage() in progress│
│                                                  │
└────────────────┬─────────────────────────────────┘
                 │
                 │ ModelAdapter.send() fails
                 ↓
┌──────────────────────────────────────────────────┐
│ ERROR                                            │
│                                                  │
│ 1. Response.success == false                    │
│ 2. Remove user message from UI                  │
│ 3. DON'T save to AppState (ModelAdapter failed) │
│ 4. Show error message                           │
│ 5. Return { success: false, error }             │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Public API Reference

### `ConversationController.initialize()`

**Returns:** `Promise<{ success: boolean, error?: string }>`

**What it does:**
1. Initializes ModelAdapter
2. Verifies system is ready for inference
3. Called once at app startup

**Example:**
```javascript
async function startApp() {
  const result = await ConversationController.initialize();
  if (!result.success) {
    console.error('Failed to start:', result.error);
    return;
  }
  // System ready
}
```

**Must call before `sendMessage()`**

---

### `ConversationController.sendMessage(text)`

**Parameters:**
- `text` (string) — The user's message

**Returns:** `Promise<{ success: boolean, message?: string, error?: string, usage?: {...}, timestamp?: string }>`

**What it does:**
1. **Validates input** — Rejects empty strings
2. **Shows user message immediately** (optimistic) — User sees their message instantly
3. **Calls ModelAdapter.send(text)**
   - PromptBuilder builds messages
   - Model generates response
   - Both messages saved to AppState
4. **Displays AI response** — User sees full conversation
5. **Returns structured response** — With success status and metadata

**Important:** User message is shown immediately, even before AI responds. If inference fails, the user message is removed.

**Example:**
```javascript
const response = await ConversationController.sendMessage("Hello!");

if (response.success) {
  console.log("AI:", response.message);
  console.log("Tokens:", response.usage);
} else {
  console.error("Send failed:", response.error);
}
```

**Response structure on success:**
```javascript
{
  success: true,
  message: "AI's full response",
  usage: {
    prompt_tokens: 150,
    completion_tokens: 80
  },
  timestamp: "2026-06-27T15:30:00Z"
}
```

**Response structure on failure:**
```javascript
{
  success: false,
  error: "Reason for failure (e.g., 'Engine not ready')",
  timestamp: "2026-06-27T15:30:00Z"
}
```

---

### `ConversationController.cancel()`

**Returns:** `Promise<{ success: boolean, error?: string }>`

**Cancels an in-progress send operation**

**Example:**
```javascript
// User clicks cancel button
await ConversationController.cancel();
```

---

### `ConversationController.clearConversation()`

**Returns:** `{ success: boolean, error?: string }`

**Clears all chat history and refreshes the UI**

**Example:**
```javascript
ConversationController.clearConversation();
// Chat is now empty
```

---

### `ConversationController.isBusy()`

**Returns:** `boolean`

**Check if currently sending a message**

**Example:**
```javascript
if (ConversationController.isBusy()) {
  console.log("Wait for current send to finish");
}
```

---

### `ConversationController.getStatus()`

**Returns:** `object` — System status including initialization state and model info

**Example:**
```javascript
{
  initialized: true,
  ready: true,
  isSending: false,
  modelInfo: {
    name: "MockEngine",
    model: "mock-v1",
    isReady: true,
    isSending: false
  }
}
```

---

## What ConversationController Does

### ✅ Responsibilities

- **Receive messages from UI** — `sendMessage(text)`
- **Validate input** — Reject empty messages, non-strings
- **Prevent duplicates** — Block sends while one is in progress
- **Optimistic display** — Show user message immediately
- **Call ModelAdapter** — Orchestrate full inference pipeline
- **Display responses** — Show AI message in chat
- **Error handling** — Gracefully handle failures
- **Support cancellation** — `cancel()` stops in-progress send

### ❌ What It Does NOT Do

- ❌ Build prompts (PromptBuilder does that)
- ❌ Call models directly (ModelAdapter does that)
- ❌ Read/write localStorage (AppState does that)
- ❌ Contain model-specific code
- ❌ Handle payment logic
- ❌ Manage customization

**It orchestrates. That's it.**

---

## How the UI Uses It

### The Send Button

```html
<button onclick="handleSendMessage()">Send</button>
```

### The Handler (the ONLY UI handler for chat)

```javascript
async function handleSendMessage() {
  const box = document.getElementById('box');
  const text = box.value.trim();

  if (!text) return; // Ignore empty

  // Clear input immediately
  box.value = '';

  // Call ConversationController
  const response = await ConversationController.sendMessage(text);

  if (!response.success) {
    // Show error to user
    displayError(response.error);
  }

  box.focus(); // Focus back to input
}
```

**That's it.** The UI doesn't know about:
- PromptBuilder
- ModelAdapter
- AppState details
- Model loading
- Inference

It just calls `ConversationController.sendMessage()` and waits for a response.

---

## Architecture Guarantee

**The UI must never:**
- Call PromptBuilder directly
- Call ModelAdapter directly
- Call AppState directly
- Read/write localStorage
- Know about models or inference
- Build prompts
- Manage history

**The UI must always:**
- Call ConversationController ONLY
- Check `isBusy()` before sending again
- Handle error responses gracefully
- Display messages (which ConversationController provides)

---

## State Management

ConversationController maintains:
- `isInitialized` — Has initialize() been called?
- `isSending` — Is a send in progress?
- `messageQueue` — (Reserved for future batching)

This state prevents:
- Double sends
- Sending before initialization
- Cancelling non-existent sends

---

## Error Handling

ConversationController returns structured errors:

```javascript
const response = await ConversationController.sendMessage("Hi");

if (!response.success) {
  switch(response.error) {
    case 'Empty message':
      console.log('User sent empty text');
      break;
    case 'System not ready':
      console.log('Call initialize() first');
      break;
    case 'Send in progress':
      console.log('Wait for previous send to finish');
      break;
    default:
      console.error('Unknown error:', response.error);
  }
}
```

---

## Startup Flow

```javascript
// 1. App loads
// 2. initializeApp() calls loadState() and applyStateToUI()
// 3. Initialize ConversationController
await ConversationController.initialize();

// 4. System ready
if (ConversationController.isReady()) {
  // Show "ready to chat" indicator
  // Enable send button
  // User can now send messages
}
```

---

## Testing Guide

### Test Basic Send

```javascript
// Initialize
await ConversationController.initialize();

// Check ready
console.log(ConversationController.isReady()); // true

// Send message
const response = await ConversationController.sendMessage("Hello!");
console.log(response.message); // AI response

// Check history was saved
console.log(getState().chatHistory.length); // 2 (user + AI)
```

### Test Validation

```javascript
// Empty message
const r1 = await ConversationController.sendMessage("");
console.log(r1.error); // "Empty message"

// Before initialization
const r2 = await ConversationController.sendMessage("test");
console.log(r2.error); // "System not ready"
```

### Test Duplicate Prevention

```javascript
// Start two sends simultaneously
const p1 = ConversationController.sendMessage("msg1");
const p2 = ConversationController.sendMessage("msg2");

// p1 succeeds, p2 gets error
const r1 = await p1; // { success: true, ... }
const r2 = await p2; // { success: false, error: "Send in progress" }
```

### Test Cancellation

```javascript
const sendPromise = ConversationController.sendMessage("slow message");

// Cancel immediately
await ConversationController.cancel();

const response = await sendPromise;
// Response is cancelled
```

---

## Files

- **`aubs-shell.html`** — Complete with Sections 1-5: UI, State, PromptBuilder, ModelAdapter, ConversationController
- **`CONVERSATION_CONTROLLER_DOCS.md`** — This file
- **`MODEL_ADAPTER_DOCS.md`** — ModelAdapter reference
- **`PROMPT_BUILDER_DOCS.md`** — PromptBuilder reference

---

## Status

**✅ Section 5 Complete.**

- [x] ConversationController module built
- [x] Public API implemented (initialize, sendMessage, cancel, clearConversation, isBusy, getStatus)
- [x] Event flow diagrams documented
- [x] Optimistic UI updates (show user message immediately)
- [x] Error handling (rollback on failure)
- [x] UI integration (handleSendMessage wired to send button)
- [x] State validation (prevents duplicate sends)
- [x] Complete documentation

**Architecture complete:** The entire chat system is now fully scaffolded and documented. All 5 sections are in place.

---

## Next Steps (Section 6+)

These sections would extend the system:

1. **Output Validation Layer** — Check AI responses for truthfulness, consistency, safety
2. **Voice Integration** — Speech-to-text input, text-to-speech output
3. **Memory Auto-Capture** — Extract important facts from conversations
4. **Real Model Loading** — Load actual WebLLM or API models
5. **Payment System** — Unlock features, manage subscriptions
6. **Admin Panel** — Debug tools, unlock code generation

But the **core infrastructure is production-ready.** Any of these can be added without changing the existing architecture.
