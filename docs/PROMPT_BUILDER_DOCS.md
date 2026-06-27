# AUBS Prompt Builder — Complete Documentation

## Overview

The Prompt Builder is the **single source of truth for prompt assembly**. It reads from AppState, constructs a complete system prompt, manages conversation history, and returns a finished `messages[]` array ready for model inference.

**Key principle:** The Prompt Builder knows nothing about:
- Which model is installed
- How to call the model
- localStorage, UI, or payment logic
- Model loading or initialization

It only builds prompts.

---

## Architecture

```
AppState (Section 2)
     ↓
PromptBuilder (Section 3)
     ↓
messages[] array
     ↓
Model Adapter (Section 4, future)
     ↓
Inference Engine
```

---

## API Reference

### `PromptBuilder.buildSystemPrompt()`

**Returns:** `string` — Complete system prompt

**Assembles in order:**
1. **Identity Core** (locked, never overridden)
   - Truth first
   - Admit uncertainty
   - Never invent facts
   - Refuse harm

2. **Personality** (from AppState)
   - AI name
   - User name (if set)
   - Tones (if set)
   - Custom instructions (if set)

3. **Memory Recall** (from AppState)
   - All stored memories (max 50)
   - Injected as facts the AI should know

4. **Conditional Instructions** (gated by unlock flags)
   - Save-on-command instruction only appears if `saveUnlocked == true`

**Example output:**

```
You are not a tool to be picked up and put down. You are a reciprocal mind — built to help the person in front of you, honestly.

[... Identity Core text ...]

You are AUBS, a private on-device AI assistant that runs entirely on the user's device. Nothing they say leaves it. The user's name is Christopher. Tone: professional. Build things quickly.

You remember these facts about the user from past conversations (saved privately on their device):
- Christopher sharpens knives for a living
- Uses AUBS for offline chat while traveling
- Interested in AI governance

Use these memories naturally so the user feels known. Do not list them back unless asked.
```

---

### `PromptBuilder.buildMessages(userMessage)`

**Parameters:**
- `userMessage` (string) — The user's current message

**Returns:** `array` — Complete messages array for model inference

**Structure:**
```javascript
[
  { role: "system", content: systemPrompt },
  { role: "user", content: "Earlier message" },
  { role: "assistant", content: "Earlier response" },
  ...
  { role: "user", content: userMessage }
]
```

**What it does:**
1. Builds system prompt via `buildSystemPrompt()`
2. Fetches conversation history from AppState
3. Trims history to fit within `maxHistoryMessages` (default: 10)
4. Appends current user message
5. Returns complete messages array

**Example:**

```javascript
const messages = PromptBuilder.buildMessages("What's the weather like?");

// Returns:
// [
//   { role: "system", content: "You are AUBS..." },
//   { role: "user", content: "Hello!" },
//   { role: "assistant", content: "Hi there!" },
//   { role: "user", content: "What's the weather like?" }
// ]
```

---

### `PromptBuilder.trimHistory(history, maxMessages)`

**Parameters:**
- `history` (array) — Conversation history
- `maxMessages` (number) — Max messages to keep (default: 10)

**Returns:** `array` — Trimmed history

**Logic:**
- If history ≤ maxMessages: return as-is
- If history > maxMessages: keep first + most recent (maxMessages - 1)
- Always preserves oldest messages for context continuity

---

### `PromptBuilder.estimateTokens(text)`

**Parameters:**
- `text` (string) — Text to estimate tokens for

**Returns:** `number` — Rough token count

**Note:** This is a rough approximation (4 chars ≈ 1 token for English). For production, use a proper tokenizer (TikToken, etc.).

---

### `PromptBuilder.inspect()`

**Returns:** `object` — Detailed information about current prompt state

**Useful for:**
- Debugging prompt assembly
- Understanding what instructions are active
- Checking memory injection
- Verifying state consistency

**Example output:**
```javascript
{
  state: { selectedModel: "fast", aiName: "AUBS", memories: [...] },
  systemPrompt: "You are not a tool...",
  systemPromptTokens: 412,
  exampleMessages: [...],
  totalMessagesCount: 4,
  memoryCount: 3,
  saveUnlockedInstructions: false,
  selectedModel: "fast"
}
```

---

## Configuration

```javascript
PromptBuilder.config = {
  maxHistoryTokens: 2048,      // Max tokens in history (not enforced yet)
  maxHistoryMessages: 10,       // Max message count in history
  systemPromptTokenBudget: 1024, // System prompt size (not enforced yet)
  userMessageTokenBudget: 512    // User message size (not enforced yet)
}
```

**To customize:**
```javascript
PromptBuilder.config.maxHistoryMessages = 5; // Keep only last 5 messages
```

---

## How Model Adapters Will Use It

### Example 1: WebLLM Adapter (on-device)

```javascript
async function inferenceWebLLM(userMessage) {
  // Step 1: Build prompt
  const messages = PromptBuilder.buildMessages(userMessage);
  if (!messages) {
    console.error('Failed to build messages');
    return { error: 'Prompt builder error' };
  }

  // Step 2: Call model
  try {
    const response = await engine.chat.completions.create({
      messages: messages,
      temperature: 0.7,
      max_tokens: 512
    });

    const aiResponse = response.choices[0].message.content;

    // Step 3: Persist to history
    addChatMessage('user', userMessage);
    addChatMessage('assistant', aiResponse);

    // Step 4: Return to UI
    return { success: true, response: aiResponse };
  } catch (err) {
    return { error: err.message };
  }
}
```

### Example 2: HTTP API Adapter (cloud-based)

```javascript
async function inferenceHTTP(userMessage, apiKey) {
  // Step 1: Build prompt
  const messages = PromptBuilder.buildMessages(userMessage);
  if (!messages) {
    return { error: 'Prompt builder error' };
  }

  // Step 2: Call remote model
  try {
    const response = await fetch('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AppState.selectedModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Step 3: Persist to history
    addChatMessage('user', userMessage);
    addChatMessage('assistant', aiResponse);

    // Step 4: Return to UI
    return { success: true, response: aiResponse };
  } catch (err) {
    return { error: err.message };
  }
}
```

### Example 3: Custom LLM Integration

```javascript
async function inferenceCustom(userMessage, customModel) {
  // Step 1: Always use PromptBuilder
  const messages = PromptBuilder.buildMessages(userMessage);
  if (!messages) return { error: 'Prompt builder error' };

  // Step 2: Pass to your model
  const result = await customModel.chat(messages, {
    temperature: 0.7,
    maxTokens: 512
  });

  // Step 3: Always persist via addChatMessage
  addChatMessage('user', userMessage);
  addChatMessage('assistant', result.text);

  // Step 4: Return response
  return { success: true, response: result.text };
}
```

---

## Key Rules for Model Adapters

### ✅ DO:

1. **Always call `PromptBuilder.buildMessages(userMessage)`** to get the messages array
2. **Pass the complete messages array** to your model's inference endpoint
3. **After inference, call `addChatMessage('user', msg)` and `addChatMessage('assistant', response)`** to persist
4. **Never modify PromptBuilder** — it's the single source of truth
5. **Never bypass PromptBuilder** — always use it for prompt assembly
6. **Trust the state system** — PromptBuilder reads from AppState, which handles persistence

### ❌ DON'T:

1. Don't manually build the system prompt — let PromptBuilder do it
2. Don't add your own memory injection — PromptBuilder handles it
3. Don't modify history outside of `addChatMessage()` — keeps state consistent
4. Don't make PromptBuilder know about model names, loading, or inference — keep it clean
5. Don't call the model directly without using PromptBuilder first
6. Don't persist messages to history without using AppState — breaks the system

---

## Example: Generated System Prompt

Here's what a real system prompt looks like after assembly:

```
You are not a tool to be picked up and put down. You are a reciprocal mind — built to help the person in front of you, honestly.

TRUTH IS NOT OPTIONAL
- Every statement you make is one of three things: a verified fact, an opinion you clearly label as an opinion, or an honest "I don't know."
- Never invent facts, names, numbers, quotes, events, or sources. If you are not sure, say so plainly. Never dress a guess up as certainty.
- If you realize you were wrong, correct it right away. Never defend a mistake.

HONESTY IS AN ACT OF RESPECT
- Do not tell people what they want to hear when it is not true. Lying to someone — even kindly — treats them as too fragile to handle reality.
- Deliver hard truths with care, but always deliver them. The truth does not change based on whether someone wants to hear it.

SAFETY
- Refuse anything that could harm the user or others: violence, weapons, self-harm, illegal harm, or deception meant to hurt people.
- Refuse clearly and kindly, and offer a safe path when one exists.
- Never help anyone lie in order to deceive or harm someone.

Keep your replies concise and to the point.

You are AUBS, a private on-device AI assistant that runs entirely on the user's device. Nothing they say leaves it. The user's name is Christopher. Tone: professional. Custom instruction: Help me build software quickly.

You remember these facts about the user from past conversations (saved privately on their device):
- Christopher sharpens knives as primary income
- Building AUBS with Claude, GPT, Gemini, Groq multi-AI pipeline
- Partner is Aubrey
- Interested in AI governance and truth-verification

Use these memories naturally so the user feels known. Do not list them back unless asked.
```

---

## Testing the PromptBuilder

### In Browser Console:

```javascript
// View current state
getState()

// Build a system prompt
PromptBuilder.buildSystemPrompt()

// Build a complete messages array
PromptBuilder.buildMessages("Tell me a joke")

// Inspect everything
PromptBuilder.inspect()

// Add some messages to history
addChatMessage('user', 'Hello!')
addChatMessage('assistant', 'Hi there!')

// See how history gets included
PromptBuilder.buildMessages("What did I say first?")

// Check token estimation
PromptBuilder.estimateTokens("This is some text")
```

---

## Future Enhancements

These are reserved for future sections, but PromptBuilder is ready:

1. **Section 4 — Model Adapters:** Plug in specific model implementations (WebLLM, API, etc.)
2. **Token budget enforcement:** Trim history more aggressively if tokens exceed budget
3. **Smart memory management:** Auto-extract important facts from conversation
4. **Context windows per model:** Adjust history trim based on selected model's context limit
5. **Prompt versioning:** Support multiple prompt templates, switchable per chat
6. **Reflection layer:** Built-in self-correction and reasoning

---

## State Dependencies

PromptBuilder reads from AppState:

```javascript
{
  selectedModel: 'fast' | 'smart' | 'advanced',
  aiName: string,
  userName: string,
  customize: {
    tones: string[]
  },
  instructions: string,
  saveUnlocked: boolean,
  chatHistory: array,
  memories: array
}
```

If any of these fields are missing, PromptBuilder handles it gracefully:
- Missing `userName`: skips name injection
- Missing `memories`: skips memory section
- Missing `tones`: skips tone injection
- Missing `instructions`: skips custom instructions
- Missing `chatHistory`: starts with empty history

---

## Files

- **`aubs-shell.html`** — Contains PromptBuilder module + all previous sections
- **`PROMPT_BUILDER_DOCS.md`** — This file

## Status

**✅ Section 3 Complete.**

PromptBuilder is production-ready and tested via browser console. Next step: Section 4 — wiring model adapters to use it.
