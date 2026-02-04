---
phase: 04-ai-integration
plan: 03
subsystem: runtimes
tags:
  - ai
  - openrouter
  - tool-calling
  - structured-output
  - retry
  - rate-limit
dependency-graph:
  requires:
    - 04-01 (types, errors, retry)
    - 04-02 (schema DSL)
  provides:
    - AI runtime for workflow execution
    - Tool-based structured output
    - Validation with retry feedback
  affects:
    - 04-04 (integration testing)
tech-stack:
  added: []
  patterns:
    - Tool calling for forced JSON structure
    - Zod schema validation after extraction
    - Exponential backoff with jitter for rate limits
file-tracking:
  created:
    - src/runtimes/ai/runtime.ts
    - src/runtimes/ai/index.ts
  modified:
    - src/runtimes/index.ts
decisions:
  - Tool calling forces structured output via OpenRouter API
  - Prompts extracted from config.system and config.user (parser child elements)
  - Input added to nodeContext for template resolution
  - AbortSignal.timeout for request timeout (native API)
  - Validation happens after tool call extraction, not during
metrics:
  duration: 2 min
  completed: 2026-02-05
---

# Phase 4 Plan 3: AI Runtime Summary

**One-liner:** AI runtime with OpenRouter tool calling, Zod validation, and retry with error feedback

## What Was Done

1. **AIRuntime class implementation** (`src/runtimes/ai/runtime.ts`)
   - Implements NodeRuntime interface with type = 'ai'
   - Uses fetch to call OpenRouter chat completions API
   - Extracts prompts from config.system and config.user (set by parser's extractChildElements)
   - Resolves template expressions via evaluateTemplateInContext
   - Adds input to nodeContext for template resolution

2. **Tool-based structured output**
   - Builds tool definition from Zod schema via zodToJsonSchema helper
   - Forces tool calling with tool_choice parameter
   - Extracts JSON from tool call arguments
   - Falls back to content parsing if no tool call

3. **Validation and retry logic**
   - Validates extracted output against Zod schema
   - On validation failure, builds retry prompt with error feedback
   - Maximum 3 retries (configurable via max-retries)
   - Exponential backoff with jitter on rate limits (429)

4. **Error handling**
   - OPENROUTER_API_KEY from secrets (required)
   - TimeoutError detection for AbortSignal timeout
   - Rate limit detection (status 429)
   - Proper AIError classification (TIMEOUT, RATE_LIMIT, VALIDATION, API_ERROR)

5. **Barrel export and registration** (`src/runtimes/ai/index.ts`)
   - Exports all AI types, errors, retry utilities, schema DSL
   - Auto-registers aiRuntime on import
   - Updated runtimes/index.ts to include AI module

## Key Implementation Details

```typescript
// Prompts come from parser's extractChildElements:
// <system>...</system> -> config.system
// <user>...</user> -> config.user

// Input available in templates via nodeContext:
const stateWithInput = {
  ...state,
  nodeContext: { ...state.nodeContext, input }
};
const userPrompt = resolveTemplate(config.user, stateWithInput);

// Tool calling forces structured output:
body.tools = [buildOutputTool(outputSchema)];
body.tool_choice = { type: 'function', function: { name: 'output' } };

// Validation happens after extraction:
const output = extractToolCallOutput(response);
const validation = outputSchema.safeParse(output);
if (!validation.success) {
  throw new SchemaValidationError(...);
}
```

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Tool calling for structured output | More reliable than asking for JSON in prompt; forces model to return valid structure |
| Prompts from config.system/config.user | Parser's extractChildElements stores child element content in config |
| Input in nodeContext | Allows {{input.field}} template expressions in prompts |
| AbortSignal.timeout | Native API for timeout control; cleaner than manual timeout race |
| Validation after extraction | Tool call may return valid JSON but wrong shape; Zod validates shape |

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

| File | Change |
|------|--------|
| `src/runtimes/ai/runtime.ts` | Created AI runtime implementation |
| `src/runtimes/ai/index.ts` | Created barrel export with auto-registration |
| `src/runtimes/index.ts` | Added AI module import and re-exports |

## Verification Results

```bash
# Typecheck
$ bun run typecheck
$ tsc --noEmit
# (no errors)

# Registry verification
$ echo "..." | bun run -
Registered runtimes: [ "http:source", "http:sink", "file:source", "file:sink", "ai" ]
Has AI: true

# Tests
$ bun test
200 pass, 0 fail, 412 expect() calls
```

## Next Phase Readiness

**Ready for 04-04:** Integration testing with real OpenRouter API calls.

**Prerequisites met:**
- [x] AIRuntime implements NodeRuntime interface
- [x] aiRuntime.type === 'ai'
- [x] Prompts extracted from config.system and config.user
- [x] Templates resolved via evaluateTemplateInContext
- [x] Tool calling forces structured JSON output
- [x] Validation with Zod schema from parseSchemaDSL
- [x] Retry on validation failure with error feedback
- [x] Exponential backoff on rate limits
- [x] AI runtime registered in runtimeRegistry
