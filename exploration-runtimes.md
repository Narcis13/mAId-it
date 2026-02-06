# FlowScript Runtimes -- Deep Exploration Report

## Overview

The runtimes subsystem is the execution layer of FlowScript. Each runtime implements the `NodeRuntime` interface and is registered in a global `RuntimeRegistry` singleton. Runtimes are organized into six categories: **HTTP**, **File**, **AI**, **Transform**, **Control Flow**, and **Checkpoint**. A total of **16 runtimes** are registered.

All runtimes auto-register via side-effect imports in their respective `index.ts` barrel files, which are imported by the top-level `src/runtimes/index.ts`.

---

## 1. Core Types (`src/runtimes/types.ts`)

### NodeRuntime Interface

```ts
interface NodeRuntime<TConfig, TInput, TOutput> {
  type: string;                                          // Registry key
  execute(params: ExecutionParams<TConfig, TInput>): Promise<TOutput>;
  validate?(node: NodeAST): ValidationError[];           // Optional custom validation
}
```

### ExecutionParams

Every runtime receives:
- `node: NodeAST` -- the AST node being executed
- `input: TInput` -- output from the previous node (void for sources)
- `config: TConfig` -- resolved configuration for this node
- `state: ExecutionState` -- current execution state (secrets, context, nodeResults, etc.)

### AuthConfig

Used by HTTP runtimes:
- `type`: `'bearer' | 'basic' | 'none'`
- `token?`, `username?`, `password?` -- all support template expressions

---

## 2. Error Classes (`src/runtimes/errors.ts`)

| Error Class | Code | Properties |
|---|---|---|
| `HttpError` | `RUNTIME_HTTP_ERROR` | `status: number`, `body?: string`, `isRetryable` (429 or 5xx) |
| `FileError` | varies | `path?: string`, `code?: string` (system error code) |
| `TimeoutError` | `RUNTIME_TIMEOUT` | `timeout: number` |
| `PathTraversalError` | `RUNTIME_PATH_TRAVERSAL` | `path?: string` |

---

## 3. Runtime Registry (`src/runtimes/registry.ts`)

A singleton `RuntimeRegistry` backed by `Map<string, NodeRuntime>`.

Methods:
- `register(runtime)` -- stores by `runtime.type` key
- `get(type)` -- returns runtime or undefined
- `has(type)` -- boolean existence check
- `list()` -- all registered type strings
- `clear()` -- for testing

Convenience functions: `getRuntime(type)`, `hasRuntime(type)`.

---

## 4. HTTP Runtimes

### 4.1 HTTP Source (`src/runtimes/http/source.ts`)

**Registry Key:** `http:source`

**Purpose:** Fetches data from HTTP APIs.

**Config (`HttpSourceConfig`):**
| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | URL with template support |
| `method` | `'GET' \| 'POST'` | required | HTTP method |
| `headers?` | `Record<string,string>` | `{}` | Additional headers (templates resolved) |
| `params?` | `Record<string,string>` | `{}` | Query parameters (templates resolved) |
| `body?` | `unknown` | -- | Request body for POST (JSON serialized) |
| `auth?` | `AuthConfig` | -- | Authentication (bearer/basic/none) |
| `extract?` | `string` | -- | JMESPath expression for response extraction |
| `timeout?` | `number` | 30000 | Request timeout in ms |

**Input:** `void` (source node)
**Output:** `unknown` (parsed JSON, optionally JMESPath-extracted)

**Behavior:**
1. Resolves all template expressions in URL, headers, params, auth tokens
2. Builds URL with query parameters via `new URL()`
3. Adds auth headers (Bearer token or Basic b64 credentials)
4. For POST: JSON-serializes body, sets `Content-Type: application/json` if not set
5. Uses `AbortSignal.timeout()` for timeout
6. Validates response is JSON (`content-type` includes `application/json`)
7. Optionally applies JMESPath via `@jmespath-community/jmespath`

**Error Handling:**
- Non-OK response -> `HttpError` with status + body
- Non-JSON content type -> `HttpError`
- Timeout -> native AbortError

**Limitations:**
- Only GET and POST methods (spec allows PUT, DELETE)
- Only JSON responses (no XML, CSV, etc.)
- No response schema validation (spec defines `<response><validate>`)
- No retry logic at HTTP source level (spec defines per-node retry)

### 4.2 HTTP Sink (`src/runtimes/http/sink.ts`)

**Registry Key:** `http:sink`

**Purpose:** Sends data to HTTP endpoints.

**Config (`HttpSinkConfig`):**
| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | URL with template support |
| `method?` | `'POST' \| 'PUT' \| 'PATCH'` | `'POST'` | HTTP method |
| `headers?` | `Record<string,string>` | `{}` | Additional headers |
| `auth?` | `AuthConfig` | -- | Authentication |
| `timeout?` | `number` | 30000 | Request timeout in ms |

**Input:** `unknown` (data from previous node, JSON-serialized as body)
**Output:** `HttpSinkResult` (`status`, `statusText`, `headers`)

**Behavior:**
1. Resolves template expressions in URL
2. JSON-serializes input as request body
3. Sets `Content-Type: application/json` by default
4. Auth headers merged after custom headers

**Limitations:**
- No DELETE method support
- Always sends JSON body (no form-data, multipart, etc.)

---

## 5. File Runtimes

### 5.1 File Source (`src/runtimes/file/source.ts`)

**Registry Key:** `file:source`

**Purpose:** Reads data from local files.

**Config (`FileSourceConfig`):**
| Field | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | required | File path with template support |
| `format?` | `'json' \| 'text' \| 'auto'` | `'auto'` | File format |

**Input:** `void` (source node)
**Output:** `unknown` (parsed JSON object or text string)

**Behavior:**
1. Resolves template path (validates against path traversal)
2. Uses `Bun.file()` for optimized file handle
3. Checks existence, throws `FileError` if not found
4. Auto-detects format from `.json` extension
5. Uses `Bun.file().json()` for optimized JSON parsing

**Error Handling:**
- File not found -> `FileError` with code `ENOENT`
- Path traversal -> `PathTraversalError`

### 5.2 File Sink (`src/runtimes/file/sink.ts`)

**Registry Key:** `file:sink`

**Purpose:** Writes data to local files.

**Config (`FileSinkConfig`):**
| Field | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | required | File path with template support |
| `format?` | `'json' \| 'text'` | auto (json for objects) | Output format |
| `pretty?` | `boolean` | `true` | Pretty-print JSON |
| `createDir?` | `boolean` | `true` | Create parent directories |

**Input:** `unknown` (data from previous node)
**Output:** `FileSinkResult` (`path`, `bytes`)

**Behavior:**
1. Resolves template path
2. Creates parent directories with `mkdir -p` if needed
3. Objects default to JSON format; primitives to text
4. Uses `Bun.write()` for optimized file writing

### 5.3 Path Utilities (`src/runtimes/file/path.ts`)

**Security Validation (`validatePath`):**
- Blocks `../` and `..\` (path traversal)
- Blocks absolute paths (starting with `/`)
- Blocks Windows absolute paths (`C:\`)

**Template Resolution (`resolveTemplatePath`):**
- Evaluates `{{expression}}` templates in paths
- Validates result is a string
- Runs security validation on resolved path

**Format Detection (`detectFormat`):**
- `.json` extension -> `'json'`
- Everything else -> `'text'`

**Limitations:**
- No CSV, YAML, lines format (spec defines these)
- No file watching (spec defines `<watch>`)

---

## 6. AI Runtime (`src/runtimes/ai/`)

### 6.1 AI Runtime (`src/runtimes/ai/runtime.ts`)

**Registry Key:** `ai`

**Purpose:** Executes LLM-powered nodes via OpenRouter API with structured output.

**Config (from node):**
| Field | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | required | OpenRouter model ID |
| `system?` | `string` | `''` | System prompt template |
| `user?` | `string` | `''` | User prompt template |
| `output-schema?` | `string` | -- | Schema DSL string |
| `max-tokens?` | `number` | 4096 | Max response tokens |
| `max-retries?` | `number` | 3 | Max retry attempts |
| `timeout?` | `number` | 60000 | Request timeout ms |

**Input:** `unknown` (data from previous node, available as `input` in templates)
**Output:** `AIResult` (`output`, `usage`, `retries`)

**Behavior:**
1. Retrieves `OPENROUTER_API_KEY` from `state.secrets`
2. Resolves template expressions in system/user prompts
3. Parses `output-schema` DSL string to Zod schema via `parseSchemaDSL`
4. If schema provided: uses tool calling to force structured JSON output
   - Defines an `output` tool with JSON Schema parameters derived from Zod
   - Forces `tool_choice: { type: 'function', function: { name: 'output' } }`
5. Validates AI response against Zod schema
6. On validation failure: builds retry prompt with error feedback, re-attempts
7. On rate limit (429): exponential backoff with jitter
8. On timeout: wraps as `AIError` with code `TIMEOUT`

**API Integration:**
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Headers: `Authorization: Bearer`, `HTTP-Referer: https://flowscript.dev`, `X-Title: FlowScript`
- Without schema: tries to parse response as JSON, falls back to string

### 6.2 AI Types (`src/runtimes/ai/types.ts`)

- `AIErrorCode`: `'TIMEOUT' | 'RATE_LIMIT' | 'VALIDATION' | 'API_ERROR'`
- `AINodeConfig`: Full config interface (model, prompts, schema, limits)
- `AIUsage`: `inputTokens`, `outputTokens`, `totalCost` (cost always 0 -- placeholder)
- `AIResult<T>`: `output`, `usage`, `retries`

### 6.3 AI Errors (`src/runtimes/ai/errors.ts`)

| Error Class | Properties |
|---|---|
| `AIError` | `code: AIErrorCode`, `retryable: boolean` |
| `SchemaValidationError` | `failedOutput: unknown`, `validationMessage: string` |

Helper: `isRateLimitError(error)` -- detects 429 status or "rate limit" in message.

### 6.4 Retry Logic (`src/runtimes/ai/retry.ts`)

- `calculateBackoffMs(attempt, baseMs=1000)`: Exponential backoff with full jitter, capped at 32s
  - Formula: `random(0, min(32000, base * 2^attempt))`
- `sleep(ms)`: Promise-based delay
- `buildRetryPrompt(original, failedOutput, validationError)`: Appends error feedback to original prompt

### 6.5 Schema DSL (`src/runtimes/ai/schema-dsl.ts`)

Parses TypeScript-like syntax to Zod schemas:
- Primitives: `string`, `number`, `boolean`
- Arrays: `string[]`, `number[]`, `{name: string}[]`
- Objects: `{key: Type, key2: Type2}`
- Nested: `{user: {name: string}, tags: string[]}`

**Limitations:**
- No optional fields (all fields are required)
- No union types
- No enum types
- No `any` / `unknown` / `Date` / `null` types
- No tuple types
- The `zodToJsonSchema` helper in `runtime.ts` is a manual implementation that only handles basic types (string, number, boolean, array, object)

---

## 7. Transform Runtimes

### 7.1 Template Runtime (`src/runtimes/transform/template.ts`)

**Registry Key:** `transform:template`

**Purpose:** Renders template strings with `{{expression}}` placeholders.

**Config (`TemplateConfig`):**
- `template: string` -- template string with `{{expression}}` placeholders

**Input:** `unknown` (available as `input` in expressions)
**Output:** `string` (rendered template)

**Behavior:**
1. Adds input to `nodeContext` for template resolution
2. Builds evaluation context
3. Evaluates template using the expression engine

**Limitations:**
- No Handlebars-style helpers (`{{#each}}`, `{{#if}}`) as defined in spec
- Output is always a string

### 7.2 Map Runtime (`src/runtimes/transform/map.ts`)

**Registry Key:** `transform:map`

**Purpose:** Transforms each item in an array using an expression.

**Config (`MapConfig`):**
- `expression: string` -- expression evaluated per item

**Input:** `unknown[]` (array; single values auto-wrapped)
**Output:** `unknown[]` (transformed array)

**Iteration Variables:**
| Variable | Type | Description |
|---|---|---|
| `$item` | `unknown` | Current item |
| `$index` | `number` | Zero-based index |
| `$first` | `boolean` | True for first item |
| `$last` | `boolean` | True for last item |
| `$items` | `unknown[]` | Full input array |

### 7.3 Filter Runtime (`src/runtimes/transform/filter.ts`)

**Registry Key:** `transform:filter`

**Purpose:** Filters array items based on a condition expression.

**Config (`FilterConfig`):**
- `condition: string` -- expression that must be truthy to include item

**Input:** `unknown[]` (array; single values auto-wrapped)
**Output:** `unknown[]` (filtered array -- original items, not booleans)

**Iteration Variables:**
- `$item` -- current item
- `$index` -- zero-based index

**Important:** Returns original items, not the boolean condition results. Filter has `$item` and `$index` but NOT `$first`, `$last`, `$items` (unlike map).

---

## 8. Control Flow Runtimes

All control flow runtimes return **metadata** for the executor to handle. They do NOT execute body nodes directly. The executor interprets the result to determine which child nodes to execute.

### 8.1 Branch Runtime (`src/runtimes/control/branch.ts`)

**Registry Key:** `control:branch`

**Purpose:** Pattern matching -- evaluates cases in order, returns first match.

**Config:** `BranchConfig` (empty -- cases come from AST)

**Input:** `unknown`
**Output:** `BranchResult`
- `matched: boolean`
- `caseIndex?: number`
- `bodyNodeIds: string[]`
- `useDefault: boolean`

**Behavior:**
1. Iterates cases in order
2. Evaluates each `condition` expression in execution context
3. First truthy match wins
4. Falls back to `default` if no case matches
5. Returns `{ matched: false }` if no case and no default

### 8.2 If Runtime (`src/runtimes/control/if.ts`)

**Registry Key:** `control:if`

**Purpose:** Simple conditional with then/else branches.

**Config:** `IfConfig` (`condition: string`)

**Output:** `IfResult`
- `condition: boolean` -- evaluation result
- `bodyNodeIds: string[]` -- IDs of then or else nodes
- `branch: 'then' | 'else' | 'none'`

**Behavior:**
1. Evaluates condition expression from AST node (not config)
2. Uses JavaScript truthiness (`Boolean(result)`)
3. Returns then/else/none branch selection

### 8.3 Loop Runtime (`src/runtimes/control/loop.ts`)

**Registry Key:** `control:loop`

**Purpose:** Fixed iteration loop with optional break condition.

**Config (`LoopConfig`):**
- `maxIterations?: number` (default: 1000 via `DEFAULT_MAX_ITERATIONS`)
- `breakCondition?: string` -- expression to evaluate for early exit

**Output:** `LoopResult`
- `maxIterations: number`
- `breakCondition?: string`
- `bodyNodeIds: string[]`

**Priority for maxIterations:** AST node > config > DEFAULT_MAX_ITERATIONS (1000)

### 8.4 While Runtime (`src/runtimes/control/while.ts`)

**Registry Key:** `control:while`

**Purpose:** Condition-based loop with safety bound.

**Config (`WhileConfig`):**
- `condition: string` -- must be true to continue (required)
- `maxIterations?: number` (default: 1000)

**Output:** `WhileResult`
- `condition: string` -- the expression (not its evaluation)
- `maxIterations: number`
- `bodyNodeIds: string[]`

### 8.5 Foreach Runtime (`src/runtimes/control/foreach.ts`)

**Registry Key:** `control:foreach`

**Purpose:** Collection iteration with item/index variable injection.

**Config (`ForeachConfig`):**
- `collection: string` -- expression evaluating to array
- `itemVar?: string` (default: `'item'`)
- `indexVar?: string` (default: `'index'`)
- `maxConcurrency?: number` (default: 1 = sequential)

**Output:** `ForeachResult`
- `collection: unknown[]` -- evaluated array
- `itemVar: string`
- `indexVar: string`
- `maxConcurrency: number`
- `bodyNodeIds: string[]`

**Behavior:**
1. Evaluates collection expression to get array
2. Non-array values auto-wrapped in `[value]`
3. Returns metadata for executor to iterate with context injection

### 8.6 Parallel Runtime (`src/runtimes/control/parallel.ts`)

**Registry Key:** `control:parallel`

**Purpose:** Concurrent execution of multiple branches.

**Config (`ParallelConfig`):**
- `maxConcurrency?: number` -- limit parallel branches

**Output:** `ParallelResult`
- `branches: NodeAST[][]` -- array of branch node arrays
- `branchCount: number`
- `maxConcurrency?: number`

**Limitations:**
- No `wait for="all | any | n(2)"` strategy (spec defines this)
- No merge strategy (spec defines concat, object, custom)
- State isolation handled by executor, not runtime

### 8.7 Break Runtime (`src/runtimes/control/break.ts`)

**Registry Key:** `control:break`

**Purpose:** Exit enclosing loop.

**Config (`BreakConfig`):**
- `loop?: string` -- optional target loop ID for breaking outer loops

**Behavior:** Always throws `BreakSignal(config.loop)`. Never returns normally.

### 8.8 Goto Runtime (`src/runtimes/control/goto.ts`)

**Registry Key:** `control:goto`

**Purpose:** Jump to a specific node.

**Config (`GotoConfig`):**
- `target: string` -- target node ID (required)

**Behavior:** Always throws `GotoSignal(config.target)`. Never returns normally.

### 8.9 Control Flow Signals (`src/runtimes/control/signals.ts`)

- `BreakSignal extends Error` -- `targetLoopId?: string`
- `GotoSignal extends Error` -- `targetNodeId: string`

Both use `Object.setPrototypeOf` for proper `instanceof` checks.

### 8.10 Constants

- `DEFAULT_MAX_ITERATIONS = 1000` -- safety bound for all loops

---

## 9. Checkpoint Runtime (`src/runtimes/checkpoint/`)

**Registry Key:** `checkpoint`

**Purpose:** Human-in-the-loop approval/rejection/input at workflow execution points.

### 9.1 Types (`src/runtimes/checkpoint/types.ts`)

**CheckpointAction:** `'approve' | 'reject' | 'input'`

**CheckpointConfig:**
- `message: string` -- displayed to user
- `timeout?: number` -- ms before default action
- `defaultAction?: 'approve' | 'reject'` (default: `'reject'`)
- `allowInput?: boolean` (default: `false`)

**CheckpointResult:**
- `action: CheckpointAction`
- `input?: string` -- user's text (if allowInput + input action)
- `timedOut: boolean`
- `respondedAt: number` -- timestamp

### 9.2 Runtime (`src/runtimes/checkpoint/runtime.ts`)

**Behavior:**

1. **Non-TTY environments** (CI/tests): Returns default action immediately, no prompting
2. **TTY environments**: Interactive readline prompt
   - Displays message with `[A]pprove / [R]eject` (+ `[I]nput` if allowInput)
   - Accepts: `a`, `approve`, `r`, `reject`, `i`, `input`
   - Invalid input: retries up to 3 times (`MAX_ATTEMPTS`), then uses default
   - SIGINT (Ctrl+C): returns `reject`
   - Readline close: returns default action
   - Timeout: returns default action with `timedOut: true`
3. If user selects `input`: prompts for text with "Enter your input:"

---

## 10. Complete Registry Key Map

| Registry Key | Runtime Class | Category |
|---|---|---|
| `http:source` | `HttpSourceRuntime` | HTTP |
| `http:sink` | `HttpSinkRuntime` | HTTP |
| `file:source` | `FileSourceRuntime` | File |
| `file:sink` | `FileSinkRuntime` | File |
| `ai` | `AIRuntime` | AI |
| `transform:template` | `TemplateRuntime` | Transform |
| `transform:map` | `MapRuntime` | Transform |
| `transform:filter` | `FilterRuntime` | Transform |
| `control:branch` | `BranchRuntime` | Control |
| `control:if` | `IfRuntime` | Control |
| `control:loop` | `LoopRuntime` | Control |
| `control:while` | `WhileRuntime` | Control |
| `control:foreach` | `ForeachRuntime` | Control |
| `control:parallel` | `ParallelRuntime` | Control |
| `control:break` | `BreakRuntime` | Control |
| `control:goto` | `GotoRuntime` | Control |
| `checkpoint` | `CheckpointRuntime` | Checkpoint |

**Total: 17 registered runtimes** (including checkpoint).

---

## 11. Spec vs. Implementation Gap Analysis

### Implemented Features

| Spec Feature | Status | Notes |
|---|---|---|
| HTTP source (GET/POST) | Implemented | Missing PUT/DELETE |
| HTTP sink (POST/PUT/PATCH) | Implemented | Missing DELETE |
| HTTP auth (bearer, basic) | Implemented | Missing oauth2, hmac |
| HTTP JMESPath extraction | Implemented | |
| File source (json, text) | Implemented | Missing csv, yaml, lines |
| File sink (json, text) | Implemented | |
| AI transform with structured output | Implemented | Via OpenRouter + tool calling |
| AI retry with backoff | Implemented | Exponential + jitter |
| AI schema DSL | Implemented | string/number/boolean/array/object |
| Template transform | Implemented | No Handlebars helpers |
| Map transform | Implemented | Full iteration variables |
| Filter transform | Implemented | |
| Branch (pattern matching) | Implemented | Expression-based, not pattern syntax |
| If/then/else | Implemented | |
| Loop with break | Implemented | |
| While loop | Implemented | |
| Foreach with concurrency | Implemented | |
| Parallel branches | Implemented | No wait/merge strategies |
| Break with target | Implemented | |
| Goto | Implemented | |
| Checkpoint (human-in-loop) | Implemented | Terminal-only |

### NOT Implemented (Defined in Spec)

| Spec Feature | Spec Section | Complexity |
|---|---|---|
| **Database source** (`type="database"`) | 3.2 | High -- needs connection pooling, SQL/NoSQL drivers |
| **Database sink** (`type="database"`, insert/upsert/update) | 3.2 | High |
| **Queue source** (`type="queue"`) | 3.2 | High -- needs message queue integration |
| **Email sink** (`type="email"`) | 3.2 | Medium -- SendGrid/SMTP/SES |
| **Reduce transform** (`type="reduce"`) | 3.2 | Medium -- accumulator + finalize |
| **Delay primitive** (`<delay duration="5s"/>`) | 3.4 | Low -- simple setTimeout |
| **Throttle primitive** (`<throttle rate="10/1m">`) | 3.4 | Medium -- rate limiter |
| **Debounce primitive** (`<debounce quiet="30s">`) | 3.4 | Medium -- event batching |
| **Batch primitive** (`<batch window="5m" max-size="100">`) | 3.4 | Medium -- time/count window |
| **Timeout wrapper** (`<timeout duration="30s">`) | 3.4 | Low -- AbortSignal wrapper |
| **Schedule trigger** (`<schedule cron="...">`) | 3.4 | Medium -- cron scheduler |
| **Per-node retry** (`<on-error><retry>`) | 3.5 | Medium -- exists for AI only |
| **Fallback** (`<on-error><fallback>`) | 3.5 | Medium |
| **Circuit breaker** | 3.5 | High -- state machine with threshold/window/cooldown |
| **Dead letter queue** | 3.5 | Medium |
| **Workflow-level on-error** | 3.5 | Medium |
| **Compensating transactions** (`<compensate>`) | 3.5 | High |
| **Parallel wait strategy** (`all \| any \| n(2)`) | 3.3 | Medium |
| **Parallel merge strategy** (`concat \| object \| custom`) | 3.3 | Medium |
| **File watch** (`<watch>boolean</watch>`) | 3.2 | Medium |
| **OAuth2 auth** | 3.2 | High -- token refresh flow |
| **HMAC auth** | 3.2 | Low |
| **CSV/YAML/lines file formats** | 3.2 | Low-Medium |
| **Checkpoint actions with goto** (spec: approve->goto publish) | 3.3 | Medium -- more complex than current approve/reject |
| **Checkpoint conditional** (`<condition>expr</condition>`) | 3.3 | Low |
| **Set variable** (`<set var="x" value="..."/>`) | 3.3 | Low |

---

## 12. Design Patterns and Architecture Notes

### Pattern: Metadata-Returning Control Flow
All control flow runtimes (branch, if, loop, while, foreach, parallel) return **metadata** rather than directly executing child nodes. This separation of concerns keeps runtimes simple and delegates orchestration to the executor. The executor interprets LoopResult, IfResult, etc. to manage iteration, branching, and parallel execution.

### Pattern: Signal-Based Flow Control
Break and Goto use exception-based signaling (`BreakSignal`, `GotoSignal`). These are thrown during execution and caught by the executor at the appropriate control structure boundary. This approach:
- Naturally unwinds the call stack
- Allows nested loop break (via `targetLoopId`)
- Enables arbitrary jumps (via `targetNodeId`)

### Pattern: Template Resolution
Multiple runtimes resolve `{{expression}}` templates via `evaluateTemplateInContext()` or `evaluateInContext()` from the expression engine. This provides a consistent way to reference runtime data in configurations.

### Pattern: Auto-Registration
Each runtime module auto-registers when imported via side-effect imports in index.ts files. The top-level `src/runtimes/index.ts` chains all imports.

### Code Duplication
HTTP source and sink both define identical `resolveValue`, `resolveRecord`, and `buildAuthHeaders` helper functions. These could be extracted to a shared HTTP utilities module.

---

## 13. Edge Cases and Potential Issues

1. **HTTP Source JSON-only**: Rejects non-JSON responses even when they contain valid data. A text/plain API would fail.

2. **File path security**: Path traversal detection is string-based (`../` check). A path like `data/..%2F..%2Fetc/passwd` with URL-encoded traversal would bypass the check (though this depends on the OS resolving the path).

3. **AI cost tracking**: `totalCost` is always 0 -- placeholder. No actual cost calculation based on model pricing.

4. **AI `zodToJsonSchema` manual implementation**: The runtime has a hand-rolled Zod-to-JSON-Schema converter that only handles basic types. Complex Zod types (unions, optionals, enums) would produce empty `{}` JSON schemas, potentially causing the AI to generate invalid output.

5. **Map/Filter single-value coercion**: Both map and filter auto-wrap non-array inputs in `[input]`. This is a useful convenience but could mask bugs where an upstream node returns a single object instead of an expected array.

6. **Control flow runtimes cast AST nodes**: Several runtimes cast `node` to specific AST types (`as unknown as BranchNode`). This relies on the parser correctly populating the AST and offers no runtime type safety.

7. **Foreach collection evaluation**: If the collection expression throws, the error is not wrapped -- it propagates as a raw expression evaluation error.

8. **Checkpoint readline cleanup**: The checkpoint runtime correctly handles timeout, SIGINT, and close events with a `resolved` guard to prevent double-resolution.

9. **DEFAULT_MAX_ITERATIONS = 1000**: This is the safety bound for all loops. A while loop with a slow body could run for a very long time within 1000 iterations.

10. **Filter missing $first/$last/$items**: Unlike map, filter only provides `$item` and `$index` in its iteration context. This inconsistency could confuse users.

---

## 14. Test Coverage Summary

| Test File | Runtimes Tested | Key Areas |
|---|---|---|
| `schema-dsl.test.ts` | Schema DSL parser | Primitives, arrays, objects, nesting, errors, whitespace, JSON Schema export |
| `transform.test.ts` | Template, Map, Filter | Template rendering (input access, nested, null/undefined, JSON), Map (all iteration vars, empty/single coercion), Filter (conditions, original items returned, combined conditions) |
| `control.test.ts` | All control runtimes | Signals (instanceof, properties), Break/Goto (signal throwing), Branch (case matching, default, ordering), If (truthy/falsy), Loop (maxIterations priority, breakCondition), While (condition, bounds), Foreach (collection eval, variable names, concurrency) |
| `runtime.test.ts` | Checkpoint | Non-TTY behavior, default actions, config options, result structure |

**Not tested in isolation:** HTTP source/sink (would need HTTP mocking), File source/sink (would need filesystem mocking), AI runtime (would need OpenRouter API mocking), Parallel runtime (no dedicated tests found).
