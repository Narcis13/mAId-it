# Phase 4: AI Integration - Research

**Researched:** 2026-02-04
**Domain:** AI model integration via OpenRouter API with structured output validation
**Confidence:** HIGH

## Summary

This phase implements AI node functionality that calls OpenRouter's API to interact with various AI models (Claude, GPT, etc.) with structured output validation using zod schemas. The research covers three main areas: (1) OpenRouter API integration including request format, authentication, structured outputs, and rate limiting; (2) schema parsing and validation patterns for converting inline TypeScript-like DSL to zod schemas and then to JSON Schema for OpenRouter; and (3) retry strategies with exponential backoff and jitter for handling rate limits and validation failures.

The established NodeRuntime pattern from Phase 3 provides a solid foundation. The AI runtime will follow the same interface with type-safe config, execute method, and optional validation. Zod v4.3.6 is already installed and provides native JSON Schema conversion via `z.toJSONSchema()`, which is ideal for OpenRouter's structured output feature.

**Primary recommendation:** Implement AI runtime following existing NodeRuntime pattern, use zod for schema validation with native JSON Schema conversion for OpenRouter structured outputs, and implement full jitter exponential backoff for rate limit handling.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation | Already in project; native JSON Schema conversion via `z.toJSONSchema()` |
| Bun fetch | native | HTTP requests | Project uses Bun runtime; built-in fetch API sufficient |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | Built-in libraries sufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | openai SDK | SDK adds weight; raw API more flexible and already have fetch pattern |
| Native fetch | axios | Unnecessary; Bun fetch is sufficient and project avoids external HTTP clients |
| zod | joi/yup | Zod already installed, has native JSON Schema, TypeScript-first |

**Installation:**
```bash
# No new dependencies needed - zod 4.3.6 already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/runtimes/
  ai/
    index.ts           # Exports runtime and registration
    runtime.ts         # AiRuntime class implementing NodeRuntime
    schema-parser.ts   # Parse TypeScript-like DSL to zod schema
    openrouter.ts      # OpenRouter API client
    retry.ts           # Exponential backoff with jitter
    types.ts           # AiConfig, AiOutput interfaces
    errors.ts          # AiError, SchemaValidationError
```

### Pattern 1: AI Runtime as NodeRuntime
**What:** AI runtime implements the established NodeRuntime interface with typed config/input/output.
**When to use:** Always for AI transform nodes.
**Example:**
```typescript
// Source: Established pattern from src/runtimes/http/source.ts
interface AiConfig {
  model: string;                    // e.g., "anthropic/claude-3.5-sonnet"
  systemPrompt?: string;            // Template string with {{expressions}}
  userPrompt: string;               // Template string with {{expressions}}
  outputSchema?: string;            // TypeScript-like DSL: "{name: string, tags: string[]}"
  maxTokens?: number;               // Default: 4096
  timeout?: number;                 // Default: 60000ms
  maxRetries?: number;              // Default: 3
}

class AiRuntime implements NodeRuntime<AiConfig, unknown, unknown> {
  readonly type = 'ai:transform';

  async execute(params: ExecutionParams<AiConfig, unknown>): Promise<unknown> {
    // 1. Resolve template expressions in prompts
    // 2. Parse output schema to zod, then to JSON Schema
    // 3. Call OpenRouter API with retry logic
    // 4. Validate response against schema
    // 5. Return validated output
  }
}
```

### Pattern 2: Schema DSL Parser
**What:** Parse inline TypeScript-like schema DSL to zod schema at runtime.
**When to use:** When processing `output-schema="{name: string, tags: string[]}"` attributes.
**Example:**
```typescript
// Custom parser for TypeScript-like object literal syntax
// Supports: string, number, boolean, string[], number[], nested objects

function parseSchemaString(dsl: string): z.ZodSchema {
  // "{name: string, tags: string[], meta: {count: number}}"
  // ->
  // z.object({
  //   name: z.string(),
  //   tags: z.array(z.string()),
  //   meta: z.object({ count: z.number() })
  // })
}

// Convert zod schema to JSON Schema for OpenRouter
function toOpenRouterSchema(zodSchema: z.ZodSchema, name: string): object {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: z.toJSONSchema(zodSchema)
    }
  };
}
```

### Pattern 3: OpenRouter API Client
**What:** Thin wrapper for OpenRouter chat completions API.
**When to use:** All AI model calls.
**Example:**
```typescript
// Source: https://openrouter.ai/docs/api/reference/overview
interface OpenRouterRequest {
  model: string;                          // "anthropic/claude-3.5-sonnet"
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: object;
    };
  };
}

async function callOpenRouter(
  request: OpenRouterRequest,
  apiKey: string,
  timeout: number
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeout),
  });
  // Handle response...
}
```

### Pattern 4: Full Jitter Exponential Backoff
**What:** Retry failed requests with randomized exponential delays.
**When to use:** Rate limit (429) responses and schema validation retries.
**Example:**
```typescript
// Source: AWS Architecture Blog patterns
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Full jitter: random value between 0 and capped delay
  return Math.random() * cappedDelay;
}

// Base: 1000ms, Max: 32000ms for rate limits
// Delays: ~0-1s, ~0-2s, ~0-4s, ~0-8s, ~0-16s, ~0-32s
```

### Anti-Patterns to Avoid
- **Hand-rolling JSON Schema:** Use `z.toJSONSchema()` instead of manual JSON Schema construction
- **Fixed retry delays:** Always use jitter to prevent thundering herd
- **Ignoring Retry-After:** Check response headers for rate limit guidance
- **Retrying non-idempotent failures:** Only retry on rate limits (429) and validation errors, not business logic failures
- **Parsing JSON without try/catch:** Always wrap JSON.parse in try/catch and treat failures as validation errors

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema generation | Manual schema objects | `z.toJSONSchema()` | Zod v4 has native, tested conversion |
| Schema validation | Custom validation logic | `zodSchema.safeParse()` | Comprehensive error messages with paths |
| Error formatting | String concatenation | `z.prettifyError()` | Clean multi-line format |
| Exponential backoff timing | Simple 2^n | Full jitter algorithm | Prevents thundering herd, reduces server load |

**Key insight:** Zod v4 provides end-to-end schema workflow: define schema -> validate data -> convert to JSON Schema -> format errors. Don't rebuild these wheels.

## Common Pitfalls

### Pitfall 1: Schema Validation Message Not Model-Friendly
**What goes wrong:** Validation errors are formatted for developers, not for AI self-correction.
**Why it happens:** Using raw ZodError messages that include technical paths like `issues[0].path`.
**How to avoid:** Format errors to clearly explain what the model got wrong and what's expected.
**Warning signs:** AI retries fail repeatedly with the same error.

```typescript
// Bad: Raw zod error
"Expected string, received number at path: data.name"

// Good: Model-friendly format
"Validation failed. You returned { name: 123 } but name must be a string.
Expected schema: { name: string, tags: string[] }
Please try again with the correct types."
```

### Pitfall 2: Not Handling Non-JSON Responses
**What goes wrong:** AI returns markdown or explanatory text instead of pure JSON.
**Why it happens:** Prompt doesn't explicitly request JSON-only response.
**How to avoid:** Include explicit JSON instruction in system prompt; strip markdown code fences if present.
**Warning signs:** JSON.parse failures on responses that contain valid JSON wrapped in text.

```typescript
// Handle markdown code fences in response
function extractJson(response: string): string {
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  return jsonMatch ? jsonMatch[1].trim() : response.trim();
}
```

### Pitfall 3: Rate Limit Response Headers Ignored
**What goes wrong:** Fixed exponential backoff doesn't respect server guidance.
**Why it happens:** OpenRouter may return Retry-After header with specific wait time.
**How to avoid:** Check Retry-After header first; use calculated backoff as fallback.
**Warning signs:** Getting 429 errors immediately after retry.

```typescript
// Check Retry-After header first
const retryAfter = response.headers.get('Retry-After');
const delay = retryAfter
  ? parseInt(retryAfter, 10) * 1000
  : calculateJitteredDelay(attempt);
```

### Pitfall 4: Schema Parser Too Limited or Too Complex
**What goes wrong:** Parser either fails on valid TypeScript-like syntax or becomes a full TypeScript parser.
**Why it happens:** Scope creep or under-scoping the DSL.
**How to avoid:** Define clear subset: primitives (string, number, boolean), arrays (T[]), and nested objects. No unions, optionals, or generics initially.
**Warning signs:** Users confused about what syntax is supported.

### Pitfall 5: Missing Timeout on AI Calls
**What goes wrong:** AI calls hang indefinitely on slow responses.
**Why it happens:** Forgetting AbortSignal.timeout or not handling timeout errors.
**How to avoid:** Always use timeout (default 60s per CONTEXT.md); wrap in TimeoutError.
**Warning signs:** Tests hang; workflows never complete.

## Code Examples

Verified patterns from official sources:

### OpenRouter Chat Completion Request
```typescript
// Source: https://openrouter.ai/docs/api/reference/overview
const request = {
  model: "anthropic/claude-3.5-sonnet",
  messages: [
    { role: "system", content: "You are a helpful assistant. Return JSON only." },
    { role: "user", content: "Extract the name and age from: John is 30 years old" }
  ],
  max_tokens: 4096,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "extraction",
      strict: true,
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name", "age"],
        additionalProperties: false
      }
    }
  }
};

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(request),
  signal: AbortSignal.timeout(60000)
});

const data = await response.json();
const content = data.choices[0].message.content;
```

### Zod Schema to JSON Schema
```typescript
// Source: https://zod.dev/json-schema
import { z } from "zod";

const schema = z.object({
  name: z.string(),
  age: z.number(),
  tags: z.array(z.string())
});

const jsonSchema = z.toJSONSchema(schema);
// Output:
// {
//   type: "object",
//   properties: {
//     name: { type: "string" },
//     age: { type: "number" },
//     tags: { type: "array", items: { type: "string" } }
//   },
//   required: ["name", "age", "tags"],
//   additionalProperties: false
// }
```

### Schema Validation with Error Formatting
```typescript
// Source: https://zod.dev/api
import { z } from "zod";

const schema = z.object({
  name: z.string(),
  age: z.number()
});

const result = schema.safeParse({ name: 123, age: "thirty" });

if (!result.success) {
  // z.prettifyError for human-readable format
  const formatted = z.prettifyError(result.error);
  // Or access issues directly for model feedback
  const issues = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    expected: issue.expected,
    received: issue.received,
    message: issue.message
  }));
}
```

### Full Jitter Backoff Implementation
```typescript
// Source: AWS Architecture Blog best practices
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;    // milliseconds
  maxDelay: number;     // milliseconds
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  isRetryable: (error: unknown) => boolean
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === config.maxAttempts - 1) {
        throw error;
      }

      // Full jitter: random(0, min(cap, base * 2^attempt))
      const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
      const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
      const jitteredDelay = Math.random() * cappedDelay;

      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError;
}

// Usage for rate limits: base 1s, max 32s, 5 attempts
const result = await withRetry(
  () => callOpenRouter(request),
  { maxAttempts: 5, baseDelay: 1000, maxDelay: 32000 },
  (error) => error instanceof HttpError && error.status === 429
);
```

### Schema DSL Parser (Recommended Approach)
```typescript
// Simple recursive descent parser for TypeScript-like object literals
// Supports: string, number, boolean, T[], nested objects

type PrimitiveType = 'string' | 'number' | 'boolean';

function parseSchemaString(dsl: string): z.ZodSchema {
  const trimmed = dsl.trim();

  // Primitive types
  if (trimmed === 'string') return z.string();
  if (trimmed === 'number') return z.number();
  if (trimmed === 'boolean') return z.boolean();

  // Arrays: T[]
  if (trimmed.endsWith('[]')) {
    const elementType = trimmed.slice(0, -2);
    return z.array(parseSchemaString(elementType));
  }

  // Objects: { key: type, ... }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const properties = parseObjectProperties(inner);
    const shape: Record<string, z.ZodSchema> = {};
    for (const [key, value] of properties) {
      shape[key] = parseSchemaString(value);
    }
    return z.object(shape);
  }

  throw new Error(`Unsupported schema type: ${trimmed}`);
}

function parseObjectProperties(inner: string): [string, string][] {
  // Parse "key: type, key2: type2" handling nested braces
  // Implementation handles brace depth counting for nested objects
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| zod-to-json-schema package | `z.toJSONSchema()` native | Zod v4 (2024-2025) | No external dependency needed |
| Manual JSON Schema | OpenRouter structured outputs | 2025 | Server-side validation, better reliability |
| Fixed exponential delays | Full jitter | AWS recommended (2015+) | Prevents thundering herd |
| Simple retry loops | Retry-After header awareness | Standard practice | Respects server guidance |

**Deprecated/outdated:**
- `zod-to-json-schema` npm package: Deprecated November 2025, use native `z.toJSONSchema()`
- JSON mode without schema: Use `json_schema` type instead of `json_object` for strict validation

## Open Questions

Things that couldn't be fully resolved:

1. **TypeScript DSL Parser Edge Cases**
   - What we know: Basic types and arrays are straightforward
   - What's unclear: How to handle optional properties (`name?: string`) - should we support them?
   - Recommendation: Start without optionals; all fields required by default. Add later if needed.

2. **Retry Strategy for Validation Failures vs Rate Limits**
   - What we know: Both need retry, but reasons differ
   - What's unclear: Should validation retries use same backoff as rate limits?
   - Recommendation: Use shorter delays for validation retries (immediate first retry, then 1s, 2s) since these aren't server-side rate limits. Use full jitter backoff for 429s.

3. **Model Support for Structured Outputs**
   - What we know: OpenAI GPT-4o, Anthropic Claude 3.5/4, Google Gemini support it
   - What's unclear: Exact list of OpenRouter models supporting `json_schema` response format
   - Recommendation: Add runtime check - if model doesn't support structured output, fall back to JSON mode + client-side validation.

## Sources

### Primary (HIGH confidence)
- [OpenRouter API Reference](https://openrouter.ai/docs/api/reference/overview) - Endpoint, authentication, request format
- [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs) - json_schema response format
- [OpenRouter API Parameters](https://openrouter.ai/docs/api/reference/parameters) - max_tokens, temperature, response_format
- [OpenRouter Rate Limits](https://openrouter.ai/docs/api/reference/limits) - Rate limit behavior
- [OpenRouter Error Handling](https://openrouter.ai/docs/api/reference/errors-and-debugging) - Error codes, 429 handling
- [Zod v4 JSON Schema](https://zod.dev/json-schema) - z.toJSONSchema() usage and options
- [Zod API Reference](https://zod.dev/api) - .parse(), .safeParse(), error handling
- [Zod v4 Release Notes](https://zod.dev/v4) - z.prettifyError(), native JSON Schema

### Secondary (MEDIUM confidence)
- [AWS Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) - Full jitter algorithm (verified industry standard)
- Existing codebase patterns from `src/runtimes/http/source.ts`, `src/runtimes/types.ts`, `src/runtimes/registry.ts`

### Tertiary (LOW confidence)
- WebSearch results on TypeScript DSL parsing - needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using already-installed zod v4 with documented features
- Architecture: HIGH - Following established NodeRuntime pattern from Phase 3
- Pitfalls: HIGH - Based on official documentation and industry best practices
- Schema DSL parser: MEDIUM - Custom implementation needed; design verified but untested

**Research date:** 2026-02-04
**Valid until:** 30 days (OpenRouter API stable, zod v4 stable)
