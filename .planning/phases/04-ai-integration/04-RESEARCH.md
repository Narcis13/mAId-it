# Phase 4: AI Integration - Research

**Researched:** 2026-02-04
**Domain:** AI/LLM integration, structured output validation, schema DSL parsing
**Confidence:** HIGH

## Summary

This phase integrates AI model calling via the `@mariozechner/pi-ai` library with structured output validation using Zod schemas. The pi-ai library provides a unified interface for multiple LLM providers including OpenRouter, with built-in support for tool calling, streaming responses, and token tracking.

Key findings:
- **pi-ai handles the heavy lifting**: The library abstracts provider differences, handles authentication via environment variables, and provides consistent APIs for streaming and completion
- **Structured output via tool calling**: pi-ai uses TypeBox schemas with AJV validation for tool call arguments; we need to bridge from user's Zod-like DSL to a tool definition that forces JSON output
- **Custom model creation**: For OpenRouter with arbitrary model IDs, we can create custom `Model` objects with the `openai-completions` API

**Primary recommendation:** Use pi-ai's `complete()` function with a tool definition that describes the expected output schema. Parse the user's TypeScript-like DSL into a Zod schema, convert to JSON Schema, then use that as the tool parameters. On validation failure, retry with error feedback in a new user message.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mariozechner/pi-ai | ^0.51.6 | AI model calling | Unified API for multiple providers, built-in tool calling, token tracking |
| zod | ^4.3.6 | Schema validation | Already in project, native JSON Schema export in v4, TypeScript inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @sinclair/typebox | (via pi-ai) | Schema definition | pi-ai uses internally for tool parameters |
| ajv | (via pi-ai) | JSON Schema validation | pi-ai uses internally for tool validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pi-ai | Direct OpenAI/Anthropic SDKs | More control but must handle provider differences |
| Zod | TypeBox | pi-ai uses TypeBox internally, but Zod already in project and has better DSL |

**Installation:**
```bash
bun install @mariozechner/pi-ai
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  runtimes/
    ai/
      index.ts           # Export AI runtime
      runtime.ts         # AIRuntime class implementing NodeRuntime
      schema-dsl.ts      # Parse "{name: string}" to Zod schema
      retry.ts           # Retry logic with exponential backoff
      errors.ts          # AIError, SchemaValidationError classes
      types.ts           # AINodeConfig, AIResult interfaces
```

### Pattern 1: Tool-Based Structured Output
**What:** Use pi-ai's tool calling to force JSON output conforming to a schema
**When to use:** Every AI node that declares an `output-schema` attribute
**Example:**
```typescript
// Source: pi-ai documentation and types.ts
import { complete, getModel } from '@mariozechner/pi-ai';
import type { Context, Tool, Model } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import { z } from 'zod';

// Convert Zod schema to TypeBox for pi-ai tool definition
function zodToTypebox(zodSchema: z.ZodType): TSchema {
  // Use z.toJSONSchema() from Zod v4, then adapt to TypeBox
  const jsonSchema = z.toJSONSchema(zodSchema);
  return Type.Unsafe(jsonSchema);
}

// Define tool that extracts structured data
const outputTool: Tool = {
  name: 'output',
  description: 'Return the structured output matching the schema',
  parameters: zodToTypebox(userSchema),
};

const context: Context = {
  systemPrompt: systemPrompt,
  messages: [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
  tools: [outputTool],
};

const response = await complete(model, context, {
  maxTokens: 4096,
  apiKey: apiKey,
});

// Extract tool call arguments as the structured output
const toolCall = response.content.find(b => b.type === 'toolCall');
if (toolCall?.type === 'toolCall') {
  const output = toolCall.arguments; // Already validated by pi-ai/AJV
}
```

### Pattern 2: Custom OpenRouter Model
**What:** Create a Model object for arbitrary OpenRouter model IDs
**When to use:** When user specifies a model not in pi-ai's registry
**Example:**
```typescript
// Source: pi-ai types.ts Model interface
import type { Model } from '@mariozechner/pi-ai';

function createOpenRouterModel(modelId: string): Model<'openai-completions'> {
  return {
    id: modelId,                    // e.g., "anthropic/claude-3.5-sonnet"
    name: modelId,
    api: 'openai-completions',      // OpenRouter uses OpenAI-compatible API
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: false,
    input: ['text'],                // Assume text only
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },  // Unknown cost
    contextWindow: 128000,          // Conservative default
    maxTokens: 4096,
  };
}
```

### Pattern 3: Retry with Validation Error Feedback
**What:** Include validation errors in retry prompt so model can self-correct
**When to use:** When structured output validation fails
**Example:**
```typescript
// Retry prompt format for validation failures
function buildRetryPrompt(
  originalPrompt: string,
  failedOutput: unknown,
  validationError: string
): string {
  return `${originalPrompt}

Your previous response did not match the required schema.

Previous output:
\`\`\`json
${JSON.stringify(failedOutput, null, 2)}
\`\`\`

Validation error:
${validationError}

Please try again, ensuring your response strictly matches the required schema.`;
}
```

### Pattern 4: Exponential Backoff with Jitter
**What:** Retry rate-limited requests with increasing delays and random jitter
**When to use:** When receiving 429 (rate limit) or 5xx errors
**Example:**
```typescript
// Source: AWS best practices for exponential backoff
function calculateBackoffMs(attempt: number, baseMs: number = 1000): number {
  // Exponential: 1s, 2s, 4s, 8s, 16s, ...
  const exponentialDelay = baseMs * Math.pow(2, attempt);

  // Cap at 32 seconds
  const cappedDelay = Math.min(exponentialDelay, 32000);

  // Add jitter: random value between 0 and delay
  // "Full jitter" strategy per AWS recommendations
  const jitter = Math.random() * cappedDelay;

  return Math.floor(jitter);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Anti-Patterns to Avoid
- **Don't parse AI text output as JSON directly**: Use tool calling to ensure structured output; text parsing is fragile
- **Don't retry indefinitely**: Set a maximum retry count (3 for validation, respect rate limit headers)
- **Don't expose API keys in error messages**: Sanitize errors before surfacing to users
- **Don't build raw HTTP requests to OpenRouter**: Use pi-ai which handles auth headers, retries, and API quirks

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API calls | Raw fetch to OpenRouter | pi-ai library | Handles streaming, auth, provider quirks, token counting |
| Schema validation | Manual JSON parsing | Zod + z.safeParse() | Type inference, detailed error messages, composable |
| JSON Schema generation | Manual schema building | z.toJSONSchema() | Native in Zod v4, handles edge cases |
| Retry logic | Simple while loop | Proper backoff with jitter | Thundering herd problem, rate limit compliance |
| Tool definitions | Custom format | pi-ai Tool interface | Consistent with library expectations |

**Key insight:** pi-ai already solves the hard problems of LLM integration (provider differences, streaming, tool calling). Focus implementation effort on the schema DSL parser and runtime orchestration, not on API plumbing.

## Common Pitfalls

### Pitfall 1: JSON in Text vs Tool Calling
**What goes wrong:** Asking the model to "return JSON" in text output leads to inconsistent formatting
**Why it happens:** Models may add markdown code blocks, explanations, or malformed JSON
**How to avoid:** Always use tool calling for structured output; pi-ai validates tool call arguments automatically
**Warning signs:** Getting responses like "Sure! Here's the JSON:" or ```json blocks in text

### Pitfall 2: Schema Mismatch Between Validation Layers
**What goes wrong:** User schema (Zod) doesn't match what pi-ai validates (TypeBox/JSON Schema)
**Why it happens:** Different schema libraries have subtle differences in how they express types
**How to avoid:** Use z.toJSONSchema() and validate the final output with Zod again after extraction
**Warning signs:** pi-ai accepts output but Zod rejects it (or vice versa)

### Pitfall 3: Rate Limit Retry Storms
**What goes wrong:** Multiple concurrent workflows all retry at the same time after rate limit
**Why it happens:** Exponential backoff without jitter means synchronized retry times
**How to avoid:** Always add jitter (random delay component) to backoff calculations
**Warning signs:** Seeing 429 errors in bursts after the first 429

### Pitfall 4: Infinite Retry Loops
**What goes wrong:** AI keeps producing invalid output, retries never succeed
**Why it happens:** Some prompts + schemas are fundamentally incompatible, or model can't follow instructions
**How to avoid:** Set hard limit (3 retries default), fail with descriptive error after limit
**Warning signs:** Same validation error repeatedly, token usage exploding

### Pitfall 5: Timeout Without Cleanup
**What goes wrong:** AI request times out but connection stays open, consuming resources
**Why it happens:** Not passing AbortSignal or not handling abort properly
**How to avoid:** Always use AbortSignal.timeout() and pass signal to pi-ai options
**Warning signs:** Memory growth, hanging requests, slow subsequent requests

### Pitfall 6: Empty or Null Tool Arguments
**What goes wrong:** Model returns empty object {} or null for tool arguments
**Why it happens:** Some models may not fully support tool calling, or schema is too complex
**How to avoid:** Validate that required fields exist in tool call arguments, treat empty as validation failure
**Warning signs:** Tool call present but arguments is {} or has missing fields

## Code Examples

Verified patterns from official sources:

### Complete AI Node Execution Flow
```typescript
// Source: Synthesized from pi-ai docs, types.ts, validation.ts
import { complete } from '@mariozechner/pi-ai';
import type { Context, Tool, Model, AssistantMessage } from '@mariozechner/pi-ai';
import { z } from 'zod';
import { Type } from '@sinclair/typebox';

interface AINodeConfig {
  model: string;              // e.g., "anthropic/claude-3.5-sonnet"
  systemPrompt: string;
  userPrompt: string;
  outputSchema: z.ZodType;
  maxTokens?: number;
  maxRetries?: number;
  timeout?: number;
}

interface AIResult<T> {
  output: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  retries: number;
}

async function executeAINode<T>(
  config: AINodeConfig,
  apiKey: string
): Promise<AIResult<T>> {
  const {
    model: modelId,
    systemPrompt,
    userPrompt,
    outputSchema,
    maxTokens = 4096,
    maxRetries = 3,
    timeout = 60000,
  } = config;

  // Create model (custom if not in registry)
  const model = createOpenRouterModel(modelId);

  // Convert Zod schema to JSON Schema for tool definition
  const jsonSchema = z.toJSONSchema(outputSchema);

  // Create tool that forces structured output
  const outputTool: Tool = {
    name: 'respond',
    description: 'Provide the structured response matching the required schema',
    parameters: Type.Unsafe(jsonSchema),
  };

  let currentPrompt = userPrompt;
  let lastError: Error | null = null;
  let totalRetries = 0;
  let totalUsage = { input: 0, output: 0, cost: 0 };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const context: Context = {
        systemPrompt,
        messages: [{ role: 'user', content: currentPrompt, timestamp: Date.now() }],
        tools: [outputTool],
      };

      const response = await complete(model, context, {
        maxTokens,
        apiKey,
        signal: AbortSignal.timeout(timeout),
      });

      // Accumulate usage
      totalUsage.input += response.usage.input;
      totalUsage.output += response.usage.output;
      totalUsage.cost += response.usage.cost.total;

      // Check for errors
      if (response.stopReason === 'error') {
        throw new Error(response.errorMessage || 'AI request failed');
      }

      // Extract tool call
      const toolCall = response.content.find(b => b.type === 'toolCall');
      if (!toolCall || toolCall.type !== 'toolCall') {
        throw new SchemaValidationError(
          'Model did not call the output tool',
          null,
          'Missing tool call in response'
        );
      }

      // Validate with Zod (double-check after pi-ai's validation)
      const parsed = outputSchema.safeParse(toolCall.arguments);
      if (!parsed.success) {
        throw new SchemaValidationError(
          'Output does not match schema',
          toolCall.arguments,
          parsed.error.format()
        );
      }

      return {
        output: parsed.data as T,
        usage: {
          inputTokens: totalUsage.input,
          outputTokens: totalUsage.output,
          totalCost: totalUsage.cost,
        },
        retries: totalRetries,
      };

    } catch (error) {
      lastError = error as Error;

      // Check if retryable
      if (error instanceof SchemaValidationError && attempt < maxRetries) {
        totalRetries++;
        currentPrompt = buildRetryPrompt(
          userPrompt,
          error.failedOutput,
          error.validationMessage
        );
        continue;
      }

      // Check for rate limiting (via pi-ai error)
      if (isRateLimitError(error) && attempt < maxRetries) {
        totalRetries++;
        const backoffMs = calculateBackoffMs(attempt);
        await sleep(backoffMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('AI execution failed after retries');
}

// Error classes
class SchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly failedOutput: unknown,
    public readonly validationMessage: string
  ) {
    super(message);
    this.name = 'SchemaValidationError';
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }
}

class AIError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'RATE_LIMIT' | 'VALIDATION' | 'API_ERROR',
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'AIError';
    Object.setPrototypeOf(this, AIError.prototype);
  }
}
```

### Schema DSL Parser
```typescript
// Source: Custom implementation based on Zod API
import { z } from 'zod';

/**
 * Parse TypeScript-like schema DSL to Zod schema.
 *
 * Supported syntax:
 *   - Primitives: string, number, boolean
 *   - Arrays: string[], number[], Type[]
 *   - Objects: {name: string, age: number}
 *   - Nested: {user: {name: string}, tags: string[]}
 *   - Optional: name?: string (NOT YET - mark as v2)
 *
 * Example: "{name: string, tags: string[], metadata: {count: number}}"
 */
function parseSchemaDSL(dsl: string): z.ZodType {
  const trimmed = dsl.trim();

  // Primitive types
  if (trimmed === 'string') return z.string();
  if (trimmed === 'number') return z.number();
  if (trimmed === 'boolean') return z.boolean();

  // Array types: Type[]
  if (trimmed.endsWith('[]')) {
    const elementType = trimmed.slice(0, -2);
    return z.array(parseSchemaDSL(elementType));
  }

  // Object types: {key: Type, ...}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const shape: Record<string, z.ZodType> = {};

    // Parse comma-separated key: Type pairs
    // Handle nested objects by tracking brace depth
    const pairs = splitByCommaRespectingBraces(inner);

    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) {
        throw new Error(`Invalid schema syntax: missing colon in "${pair}"`);
      }

      const key = pair.slice(0, colonIndex).trim();
      const valueType = pair.slice(colonIndex + 1).trim();
      shape[key] = parseSchemaDSL(valueType);
    }

    return z.object(shape);
  }

  throw new Error(`Unknown schema type: "${trimmed}"`);
}

function splitByCommaRespectingBraces(str: string): string[] {
  const pairs: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of str) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === ',' && depth === 0) {
      pairs.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    pairs.push(current.trim());
  }

  return pairs;
}
```

### Retry Prompt Format
```typescript
// Recommended format for validation error feedback
function buildRetryPrompt(
  originalPrompt: string,
  failedOutput: unknown,
  validationError: string | object
): string {
  const errorStr = typeof validationError === 'string'
    ? validationError
    : JSON.stringify(validationError, null, 2);

  return `${originalPrompt}

---

Your previous response did not match the required output schema.

Your output:
\`\`\`json
${JSON.stringify(failedOutput, null, 2)}
\`\`\`

Schema validation error:
${errorStr}

Please provide a corrected response that strictly matches the required schema. Return ONLY the structured data via the respond tool.`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON parsing from text | Tool calling with schema validation | 2024 | Reliable structured output |
| zod-to-json-schema package | z.toJSONSchema() native | Zod v4 (Nov 2025) | One less dependency |
| Provider-specific SDKs | Unified libraries (pi-ai, Vercel AI SDK) | 2024-2025 | Simplified multi-provider support |
| Retry without jitter | Exponential backoff + full jitter | Always was best practice | Prevents thundering herd |

**Deprecated/outdated:**
- `zod-to-json-schema` package: Use native `z.toJSONSchema()` in Zod v4 instead
- Direct OpenRouter HTTP calls: Use pi-ai's abstraction layer
- Text-based JSON extraction: Use tool calling exclusively

## Open Questions

Things that couldn't be fully resolved:

1. **TypeBox to Zod Schema Compatibility**
   - What we know: pi-ai uses TypeBox internally, Zod schemas convert to JSON Schema
   - What's unclear: Are there edge cases where JSON Schema from Zod doesn't work with pi-ai's TypeBox validation?
   - Recommendation: Double-validate with Zod after extraction; test with complex nested schemas

2. **OpenRouter Model Discovery**
   - What we know: We can create custom Model objects for any model ID
   - What's unclear: Should we pre-populate known models vs. always use dynamic creation?
   - Recommendation: Use dynamic creation since OpenRouter adds models frequently; model ID validation is done by OpenRouter itself

3. **Token Budget Enforcement**
   - What we know: pi-ai's `maxTokens` option controls output tokens
   - What's unclear: How to enforce total budget (input + output) when input varies?
   - Recommendation: For v1, just use maxTokens for output; total budget tracking is deferred

## Sources

### Primary (HIGH confidence)
- pi-ai GitHub repository: https://github.com/badlogic/pi-mono/tree/main/packages/ai
  - README.md - API overview, streaming, tool calling
  - src/types.ts - Context, Message, Tool, Model interfaces
  - src/stream.ts - stream(), complete() functions
  - src/models.ts - getModel(), Model creation
  - src/utils/validation.ts - validateToolCall(), AJV setup
  - src/providers/openai-completions.ts - OpenRouter API handling

- Zod official documentation: https://zod.dev/
  - https://zod.dev/api - Schema types reference
  - https://zod.dev/json-schema - Native JSON Schema export in v4

### Secondary (MEDIUM confidence)
- AWS Architecture Blog - Exponential Backoff and Jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- exponential-backoff npm: https://www.npmjs.com/package/exponential-backoff

### Tertiary (LOW confidence)
- Various blog posts on LLM structured output retry patterns (synthesized approach)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pi-ai source code reviewed, Zod already in project
- Architecture: HIGH - Based on pi-ai's actual API and types
- Schema DSL: MEDIUM - Custom implementation, needs thorough testing
- Pitfalls: HIGH - Documented in pi-ai issues and LLM best practices

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (pi-ai under active development, check for updates)
