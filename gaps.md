# FlowScript: Implementation Gaps Analysis

A comprehensive audit of spec-defined features not yet implemented, missing capabilities, bugs, edge cases, and proposed work items. Synthesized from deep exploration of all five subsystems: Parser, Expression Engine, Runtimes, Execution/Scheduler, and CLI/Validator.

---

## 1. Spec Features Not Yet Implemented

### 1.1 Frontmatter Gaps

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| `trigger.watch` (file watcher) | Sec 2 | NOT IMPLEMENTED | Parser only recognizes manual, webhook, schedule |
| `trigger.queue` (queue consumer) | Sec 2 | NOT IMPLEMENTED | Parser only recognizes manual, webhook, schedule |
| `config` enum type | Sec 2 | NOT IMPLEMENTED | Parser only supports string, number, boolean, object, array |
| `input` schema | Sec 2 | NOT IMPLEMENTED | Not parsed from frontmatter |
| `output` schema | Sec 2 | NOT IMPLEMENTED | Not parsed from frontmatter |
| `runtime` settings (timeout, retry, concurrency, context_budget) | Sec 2 | NOT IMPLEMENTED | Not parsed |
| `evolution` section (generation, parent, fitness, learnings) | Sec 2 | NOT IMPLEMENTED | Not parsed |

### 1.2 XML Body Gaps -- Node Types

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| `<context>` global/scoped context | Sec 3.6 | NOT IMPLEMENTED | Unknown node type error in parser |
| `<phase>` grouping | Sec 3.1 | NOT IMPLEMENTED | Unknown node type error in parser |
| `<delay>` temporal primitive | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<throttle>` rate limiter | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<debounce>` event batching | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<batch>` time/count windowing | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<timeout>` wrapper | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<schedule>` trigger | Sec 3.4 | NOT IMPLEMENTED | Unknown node type |
| `<on-error>` per-node error handling | Sec 3.5 | NOT IMPLEMENTED | Not parsed |
| `<on-workflow-error>` global error handling | Sec 3.5 | NOT IMPLEMENTED | Unknown node type |
| `<state>` persistence | Sec 3.6 | NOT IMPLEMENTED | Unknown node type |
| `<include>` workflow composition | Sec 3.7 | NOT IMPLEMENTED | Unknown node type |
| `<call>` workflow invocation | Sec 3.7 | NOT IMPLEMENTED | Unknown node type |
| `<schema>` type definitions | Sec 5 | NOT IMPLEMENTED | Unknown node type |
| `<output>` element | Sec 3.1 | NOT IMPLEMENTED | Unknown node type |
| `<set>` variable assignment | Sec 3.3 | NOT IMPLEMENTED | Unknown node type |
| `<break>` as standalone element | Sec 3.3 | NOT IMPLEMENTED | Only `break` attribute on `<loop>` |
| `<goto>` navigation | Sec 3.3 | RUNTIME ONLY | Runtime exists (`control:goto`) but parser does not parse `<goto>` elements |
| `<ai>` as standalone tag | Sec 3.2 | NOT IMPLEMENTED | Must use `<transform type="ai">` |
| Markdown footer (execution log) | Sec 6 | PARTIAL | Logging writes to file, but no learnings/evolution tracking |

### 1.3 Source/Sink/Transform Type Gaps

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| `<source type="database">` | Sec 3.2 | NOT IMPLEMENTED | Parser only allows http, file |
| `<source type="queue">` | Sec 3.2 | NOT IMPLEMENTED | Parser only allows http, file |
| `<sink type="email">` | Sec 3.2 | NOT IMPLEMENTED | Parser only allows http, file |
| `<sink type="database">` | Sec 3.2 | NOT IMPLEMENTED | Parser only allows http, file |
| `<transform type="reduce">` | Sec 3.2 | NOT IMPLEMENTED | Parser only allows ai, template, map, filter |
| HTTP methods PUT, DELETE on source | Sec 3.2 | NOT IMPLEMENTED | Source runtime only supports GET, POST |
| HTTP method DELETE on sink | Sec 3.2 | NOT IMPLEMENTED | Sink supports POST, PUT, PATCH only |
| OAuth2 authentication | Sec 3.2 | NOT IMPLEMENTED | Only bearer and basic auth implemented |
| HMAC authentication | Sec 3.2 | NOT IMPLEMENTED | Only bearer and basic auth |
| File formats: CSV, YAML, lines | Sec 3.2 | NOT IMPLEMENTED | Only json and text supported |
| File watching | Sec 3.2 | NOT IMPLEMENTED | No `<watch>` support |
| Response validation schemas | Sec 3.2 | NOT IMPLEMENTED | No `<response><validate>` |

### 1.4 Control Flow Gaps

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| `<branch>` with `<match pattern>` | Sec 3.3 | NOT IMPLEMENTED | Uses `<case when>` condition expressions instead of pattern matching syntax |
| `<branch>` with `<otherwise>` | Sec 3.3 | NOT IMPLEMENTED | Uses `<default>` instead |
| `<parallel>` wait strategy (`all \| any \| n(2)`) | Sec 3.3 | NOT IMPLEMENTED | Always waits for all branches |
| `<parallel>` merge strategy (`concat \| object \| custom`) | Sec 3.3 | NOT IMPLEMENTED | Returns array of branch outputs, no merge logic |
| Checkpoint actions with goto routing | Sec 3.3 | NOT IMPLEMENTED | Only approve/reject/input, no action routing |
| Checkpoint conditional (`<condition>`) | Sec 3.3 | NOT IMPLEMENTED | Always shows prompt |
| Pattern matching syntax (`{ type: 'urgent', priority: > 8 }`) | Sec 4 | NOT IMPLEMENTED | No pattern matching DSL |

### 1.5 Error Handling Gaps

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| Per-node `<retry>` with conditional (`when`) | Sec 3.5 | PARTIAL | Retry exists in executor but not configurable per-node via XML; only AI has built-in retry |
| `<fallback>` with conditional routing | Sec 3.5 | PARTIAL | FallbackNodeId exists in RetryConfig but cannot be set from workflow XML |
| `<circuit-breaker>` (threshold, window, cooldown) | Sec 3.5 | NOT IMPLEMENTED | No state machine |
| Dead letter queue (`<dlq>`) | Sec 3.5 | NOT IMPLEMENTED | No DLQ mechanism |
| Compensating transactions (`<compensate>`) | Sec 3.5 | NOT IMPLEMENTED | No rollback capability |
| Workflow-level error handler (`<on-workflow-error>`) | Sec 3.5 | NOT IMPLEMENTED | ErrorHandler callback exists in options but no XML parsing |
| Alert/notification on error | Sec 3.5 | NOT IMPLEMENTED | No alert channels (Slack, PagerDuty, etc.) |
| Debug snapshot on error | Sec 3.5 | NOT IMPLEMENTED | State persistence exists but no automatic snapshots |

### 1.6 Expression Language Gaps

| Spec Feature | Spec Section | Status | Notes |
|---|---|---|---|
| `$env.VAR` environment variable access | Sec 4 | NOT IMPLEMENTED | No $env prefix in context |
| `$state.key` persistent state access | Sec 4 | NOT IMPLEMENTED | No state system |
| `$input.field` workflow input access | Sec 4 | PARTIAL | Input is in global context but not under $input prefix |
| `$output.field` current node output | Sec 4 | NOT IMPLEMENTED | No $output prefix |
| `phase.node.output` cross-phase reference | Sec 4 | NOT IMPLEMENTED | No phase scoping |
| `duration(spec)` function | Sec 4 | NOT IMPLEMENTED | Not in built-in functions |
| `switch(val, cases, default)` function | Sec 4 | NOT IMPLEMENTED | Not in built-in functions |
| `hash(s, algorithm)` with algorithm parameter | Sec 4 | PARTIAL | `hash()` exists but uses djb2 only, not md5/sha256 |
| `filter(arr, predicate)` as expression function | Sec 4 | NOT USABLE | Function exists but lambdas cannot be written in expressions |
| `map(arr, transform)` as expression function | Sec 4 | NOT IMPLEMENTED | No map function in built-in functions |
| `reduce(arr, reducer, init)` as expression function | Sec 4 | NOT IMPLEMENTED | No reduce function |
| Handlebars-style template helpers (`{{#each}}`, `{{#if}}`) | Sec 3.2 | NOT IMPLEMENTED | Simple `{{expression}}` interpolation only |

### 1.7 CLI Command Gaps

| Spec Command | Spec Section | Status |
|---|---|---|
| `flowscript watch` | Sec 7 | NOT IMPLEMENTED |
| `flowscript test` | Sec 7 | NOT IMPLEMENTED |
| `flowscript debug` | Sec 7 | NOT IMPLEMENTED |
| `flowscript replay` | Sec 7 | NOT IMPLEMENTED |
| `flowscript inspect` | Sec 7 | NOT IMPLEMENTED |
| `flowscript publish` | Sec 7 | NOT IMPLEMENTED |
| `flowscript install` | Sec 7 | NOT IMPLEMENTED |
| `flowscript search` | Sec 7 | NOT IMPLEMENTED |

### 1.8 Type System Gaps

| Spec Feature | Spec Section | Status |
|---|---|---|
| `datetime` type | Sec 5 | NOT IMPLEMENTED |
| `duration` type | Sec 5 | NOT IMPLEMENTED |
| `null` type | Sec 5 | NOT IMPLEMENTED in schema DSL |
| `Type?` optional types | Sec 5 | NOT IMPLEMENTED in schema DSL |
| `Type \| OtherType` union types | Sec 5 | NOT IMPLEMENTED in schema DSL |
| `enum[a, b, c]` enumeration | Sec 5 | NOT IMPLEMENTED in schema DSL |
| `<schema>` XML definitions | Sec 5 | NOT IMPLEMENTED |
| Named schema references | Sec 5 | NOT IMPLEMENTED |

---

## 2. Missing Runtimes

### 2.1 Database Runtime (High Priority)

**Spec defines:** `<source type="database">` and `<sink type="database">`

**What's needed:**
- Connection pooling with URL-based configuration (`$secrets.DATABASE_URL`)
- SQL query execution with parameterized queries (prevent SQL injection)
- Read operations: SELECT with parameter binding
- Write operations: INSERT, UPSERT, UPDATE with batch support
- Transaction support for multi-statement operations
- Driver support: PostgreSQL (via `Bun.sql`), SQLite (via `bun:sqlite`)
- Connection lifecycle management (acquire, release, health checks)

### 2.2 Queue Runtime (High Priority)

**Spec defines:** `<source type="queue">` with batch and visibility

**What's needed:**
- Queue consumption with configurable batch size
- Visibility timeout for processing guarantees
- Message acknowledgment/rejection
- Dead letter queue integration
- Support for at least one provider (Redis via `Bun.redis`, SQS, etc.)
- Backpressure handling

### 2.3 Email Sink Runtime (Medium Priority)

**Spec defines:** `<sink type="email">` with SendGrid/SMTP/SES providers

**What's needed:**
- Multi-provider support (SendGrid API, SMTP, AWS SES)
- Template-resolved to/from/subject/body fields
- HTML and plain text body support
- Batch sending with rate limiting
- Delivery status tracking

### 2.4 Reduce Transform Runtime (Medium Priority)

**Spec defines:** `<transform type="reduce">` with initial/reducer/finalize

**What's needed:**
- Initial accumulator value
- Per-item reducer execution (requires expression evaluation per step)
- Optional finalize step
- Support for both expression-based and function-based reducers

---

## 3. Missing Temporal Primitives

### 3.1 Delay (Low Complexity)

**Spec:** `<delay duration="5s"/>`
- Simple `setTimeout`/`Bun.sleep()` wrapper
- Duration parsing (ISO or human-readable like "5s", "1m")
- Needs: parser support, runtime, duration parser utility

### 3.2 Throttle (Medium Complexity)

**Spec:** `<throttle rate="10/1m">` -- Rate limiter
- Token bucket or sliding window rate limiter
- Configurable rate: count per time window
- Queue incoming items, release at controlled rate
- Needs: parser support, runtime, rate limiter implementation

### 3.3 Debounce (Medium Complexity)

**Spec:** `<debounce quiet="30s">` -- Wait for quiet period
- Timer reset on each new event
- Flush when quiet period expires
- Needs: parser support, runtime, timer management

### 3.4 Batch (Medium Complexity)

**Spec:** `<batch window="5m" max-size="100" flush-on="either">`
- Collect items over time window or until count threshold
- Flush trigger: time, count, or either
- Needs: parser support, runtime, buffer with dual trigger

### 3.5 Timeout Wrapper (Low Complexity)

**Spec:** `<timeout duration="30s" on-timeout="fallback">`
- Wraps child nodes with AbortSignal timeout
- Routes to fallback on timeout
- Note: `AbortSignal.timeout()` is already used in retry logic but not exposed as a node primitive

### 3.6 Duration Parsing Utility

All temporal primitives need a duration parser. The spec uses various formats:
- ISO 8601: `P1D`, `PT1H`, `PT30S`
- Human-readable: `5s`, `1m`, `30s`, `5m`, `24h`
- Cron expressions: `0 9 * * MON`

Currently the only duration support is in Luxon (via time functions) for ISO durations.

---

## 4. Missing Error Handling Patterns

### 4.1 Circuit Breaker (High Complexity)

**Spec:** `<circuit-breaker threshold="5" window="1m" cooldown="5m">`

State machine with three states:
- **Closed** (normal): Track failures within time window. If threshold exceeded, transition to Open.
- **Open** (failing): Immediately route to `<on-open>` handler. After cooldown, transition to Half-Open.
- **Half-Open** (testing): Allow one request. If success, go Closed. If failure, go Open.

**Needs:**
- State machine implementation with time-based transitions
- Per-node failure tracking with sliding window
- Integration with executor retry logic
- Parser support for `<circuit-breaker>` element

### 4.2 Dead Letter Queue (Medium Complexity)

**Spec:** `<dlq when="retries-exhausted">`

- Capture failed messages/inputs after retry exhaustion
- Route to configurable sink (file, queue, HTTP)
- Include error context (error message, stack, retry count, timestamps)
- Alert integration (Slack, email, PagerDuty)

### 4.3 Compensating Transactions (High Complexity)

**Spec:** `<compensate>` within `<on-workflow-error>`

- Saga pattern: define rollback actions for each step
- Execute compensations in reverse order on failure
- Track compensation success/failure
- Idempotent compensation operations

### 4.4 Per-Node Error Handling XML Integration

The executor already supports `RetryConfig` with `maxRetries`, `backoffBase`, `timeout`, and `fallbackNodeId`. However, there is no way to configure these from the workflow XML:
- Parser does not parse `<on-error>` child elements
- No way to set retry/fallback per-node from the workflow file
- The only retry that works is the default retry config passed via CLI options

---

## 5. Bugs, Edge Cases, and Potential Issues

### 5.1 Expression Engine Issues

**5.1.1 `concat` Function Name Collision (Bug)**
- File: `src/expression/functions/index.ts`
- Both `stringFunctions.concat` and `arrayFunctions.concat` are spread into the flat namespace
- Array version overwrites string version since `arrayFunctions` comes after `stringFunctions`
- Users expecting `concat("a", "b")` to produce `"ab"` will get unexpected behavior
- **Fix:** Rename one function (e.g., `array_concat`) or prefix them

**5.1.2 No Lambda/Arrow Function Support (Design Limitation)**
- Functions accepting predicates (`every`, `some`, `find`, `count`) cannot be used from expressions
- `add_time(date, {days: 1})` cannot receive object literals from expressions
- No `map`, `filter`, `reduce` as expression functions due to this
- **Impact:** Significantly limits array transformation capabilities within expressions

**5.1.3 Template Regex Non-Greedy Limitation**
- File: `src/expression/parser.ts:52`
- Regex `/\{\{(.+?)\}\}/g` fails on expressions containing `}}`
- No escaping mechanism for literal `{{` or `}}` in templates
- Empty `{{}}` expressions are silently ignored (`.+?` requires 1+ chars)

### 5.2 Execution Engine Issues

**5.2.1 Single Input Dependency (Design Limitation)**
- File: `src/scheduler/dag.ts`
- Each node can only declare one `input` dependency
- If a node uses `{{nodeA.output}}` in its config but declares `input="nodeB"`, it has an implicit dependency on nodeA that the scheduler doesn't know about
- Could cause race conditions: nodeA might not be finished when the node evaluates `{{nodeA.output}}`
- **Impact:** Workflows with diamond dependencies may produce incorrect results

**5.2.2 Error Objects Lost During Persistence (Bug)**
- File: `src/execution/persistence.ts`
- `JSON.stringify()` serializes Error objects as `{}` (losing message, stack, name)
- After resume, `nodeResult.error` is an empty object
- **Fix:** Serialize errors as `{ name, message, stack, code }` explicitly

**5.2.3 Resume Skips Partial Wave (Design Issue)**
- File: `src/execution/resume.ts`
- Resume filters waves with `waveNumber > state.currentWave`
- If wave 2 had 5 nodes and only 3 completed before failure, resume starts at wave 3
- The 2 nodes that never started in wave 2 are permanently skipped
- **Fix:** Resume should re-execute failed/unstarted nodes in the current wave

**5.2.4 Global Timeout Not Implemented**
- File: `src/execution/executor.ts`
- `ExecutionOptions.timeout` is defined in types but never used in the executor
- No mechanism to abort an entire workflow after a global timeout
- **Fix:** Add AbortController-based timeout to the main `execute()` function

**5.2.5 AbortSignal Not Passed to Runtimes**
- File: `src/execution/retry.ts`
- `executeWithRetry()` creates `AbortSignal.timeout()` per attempt
- But `runtime.execute()` does not receive or use the signal
- Per-attempt timeouts only work at the Promise level, not cooperatively
- **Fix:** Add `signal` parameter to `ExecutionParams` and pass it through

**5.2.6 nodeContext Mutation in Fallback**
- File: `src/execution/executor.ts` (executeFallbackNode)
- Directly mutates `state.nodeContext.$primaryError` and `$primaryInput`
- This modifies the original state, not a clone, which could affect parallel executions
- **Fix:** Clone state before fallback execution

**5.2.7 Foreach Body Nodes May Not Resolve**
- File: `src/execution/executor.ts` (handleForeachResult)
- Body node IDs are looked up from the top-level `nodes` map
- Foreach body nodes are children of the foreach node, potentially not in the top-level map
- Silently skips unresolved IDs, producing empty iteration bodies
- **Impact:** Foreach loops could execute with no body nodes

**5.2.8 Wave-Level Error Discarding**
- File: `src/execution/executor.ts` (executeWave)
- All nodes in a wave run to completion, but only the first error is thrown
- Subsequent errors are silently discarded
- **Fix:** Collect and report all errors, or use `AggregateError`

### 5.3 Runtime Issues

**5.3.1 HTTP Source JSON-Only Response**
- File: `src/runtimes/http/source.ts`
- Rejects non-JSON responses even when they contain valid data
- Text/plain, XML, CSV APIs would fail
- **Fix:** Support content-type-based response parsing

**5.3.2 File Path Traversal Bypass Risk**
- File: `src/runtimes/file/path.ts`
- Path traversal detection is string-based (`../` check)
- URL-encoded traversal (`..%2F`) could bypass the check depending on OS path resolution
- **Fix:** Resolve path with `path.resolve()` and check if it's within the allowed directory

**5.3.3 AI Cost Tracking Placeholder**
- File: `src/runtimes/ai/runtime.ts`
- `totalCost` is always 0 -- no actual cost calculation
- **Fix:** Implement per-model cost lookup based on token counts

**5.3.4 AI zodToJsonSchema Manual Implementation**
- File: `src/runtimes/ai/runtime.ts`
- Hand-rolled Zod-to-JSON-Schema converter only handles basic types
- Complex Zod types (unions, optionals, enums) produce empty `{}` JSON schemas
- Could cause AI to generate output that doesn't match the intended schema
- **Fix:** Use `zod-to-json-schema` library or expand the manual implementation

**5.3.5 Map/Filter Iteration Variable Inconsistency**
- Map provides: `$item`, `$index`, `$first`, `$last`, `$items`
- Filter provides: `$item`, `$index` only
- Missing `$first`, `$last`, `$items` from filter could confuse users
- **Fix:** Align iteration variables between map and filter

**5.3.6 Fallback Node May Still Retry**
- File: `src/execution/executor.ts` (executeFallbackNode)
- Code comments say "without retry to avoid infinite loops"
- But `executeNode()` is called with `defaultRetryConfig`, which could trigger retries
- **Fix:** Pass `undefined` for retry config when executing fallback nodes

### 5.4 Parser Issues

**5.4.1 Approximate Source Location End Positions**
- File: `src/parser/body.ts` (findNodeLocation)
- End position is estimated as `offset + tagName.length + 1`
- Does not track actual tag close position
- Error reporting points to correct start but inaccurate end

**5.4.2 No Test Coverage for Body Parsing**
- Only frontmatter tests exist in the parser test suite
- No tests for XML body parsing, individual node type parsing, or source location accuracy
- **Impact:** Parser bugs in body parsing would go undetected

### 5.5 CLI/Validator Issues

**5.5.1 Dry-Run Does Not Validate Config/Input**
- File: `src/cli/run.ts`
- `--dry-run` returns before parsing config overrides and input JSON
- Invalid input JSON silently passes in dry-run mode
- **Fix:** Validate config and input even in dry-run mode

**5.5.2 No Expression Validation at Compile Time**
- The validator does not check expression syntax in `condition`, `when`, `collection`, or template attributes
- Invalid expressions are only caught at runtime during execution
- **Fix:** Add an expression syntax validation pass that parses (but doesn't evaluate) all expressions

**5.5.3 Trigger Validation Mismatch**
- Structural validator expects `trigger.type` to be `manual | webhook | schedule`
- But spec defines triggers as nested objects (`trigger: { manual: true, schedule: "..." }`)
- Example workflows use the spec format, which doesn't have an explicit `type` field
- **Impact:** Valid workflows per spec may fail validation

**5.5.4 Cycle Detection Ignores Nested Scope**
- The cycle detector treats all node IDs as globally scoped
- Nodes inside loops, branches, or parallel blocks are mixed with top-level nodes
- Could miss cycles within nested structures or produce false positives

**5.5.5 YAML Output Not Functional**
- `parse` command advertises YAML output but falls back to JSON with a message
- **Fix:** Implement YAML serialization or remove the option

---

## 6. Proposed Tasks for Future Iterations

### Tier 1: Critical Foundation (Must-Have for v1.1)

| Task | Complexity | Justification |
|---|---|---|
| Fix `concat` name collision | Low | Bug -- unexpected behavior for string concatenation |
| Fix Error serialization in persistence | Low | Bug -- errors lost after resume |
| Fix resume wave gap (re-execute partial waves) | Medium | Bug -- nodes permanently skipped |
| Add expression syntax validation pass | Medium | Prevents runtime failures that could be caught early |
| Fix trigger validation mismatch | Low | Validator rejects valid workflows |
| Add body parser test coverage | Medium | No tests for core parsing logic |
| Fix nodeContext mutation in fallback | Low | Potential race condition in parallel execution |

### Tier 2: High-Value Features (v1.1-v1.2)

| Task | Complexity | Justification |
|---|---|---|
| Implement `<delay>` primitive | Low | Simple and high-value temporal control |
| Implement `<timeout>` wrapper | Low | Essential for reliability |
| Implement per-node `<on-error>` XML parsing | Medium | Retry/fallback exist but are not configurable from workflows |
| Implement `<phase>` grouping | Medium | Organizational primitive used in spec examples |
| Implement `<context>` element | Medium | Variable management primitive |
| Implement `<set>` variable assignment | Low | Required for loops and state management |
| Implement database source/sink | High | Critical for real-world data pipelines |
| Implement global execution timeout | Low | Already defined in options, just needs wiring |
| Pass AbortSignal to runtimes | Low | Already created, just needs plumbing |
| Add `map`/`filter`/`reduce` expression functions | Medium | Core array operations missing from expressions |

### Tier 3: Feature Completeness (v1.2-v2.0)

| Task | Complexity | Justification |
|---|---|---|
| Implement email sink runtime | Medium | Common workflow output channel |
| Implement queue source runtime | High | Required for event-driven workflows |
| Implement reduce transform runtime | Medium | Data aggregation primitive |
| Implement parallel wait/merge strategies | Medium | Current parallel always waits for all |
| Implement circuit breaker | High | Advanced reliability pattern |
| Implement dead letter queue | Medium | Error handling for production workflows |
| Implement `<throttle>` rate limiter | Medium | Required for API-heavy workflows |
| Implement `<batch>` windowing | Medium | Required for event stream processing |
| Add OAuth2 authentication | High | Required for many API integrations |
| Add CSV/YAML file format support | Low-Medium | Common data formats |
| Implement `<include>` / `<call>` composition | High | Workflow reuse and modularity |
| Add HTTP response validation | Medium | Schema-based response checking |
| Implement pattern matching DSL | High | Spec-defined but complex alternative to expression conditions |
| Implement Handlebars-style template helpers | Medium | Richer template engine |
| Implement `flowscript inspect` command | Medium | Structure and dependency visualization |
| Implement `flowscript test` command | High | Workflow testing framework |

### Tier 4: Advanced / Long-term (v2.0+)

| Task | Complexity | Justification |
|---|---|---|
| Implement compensating transactions | High | Saga pattern for multi-step rollbacks |
| Implement evolution/learnings tracking | High | Self-improving workflow capability |
| Implement `flowscript debug` with breakpoints | High | Developer experience |
| Implement `flowscript watch` mode | Medium | Live workflow development |
| Implement workflow registry (publish/install/search) | High | Sharing and reuse ecosystem |
| Lambda/arrow function support in expressions | High | Would require jsep plugin or custom parser |
| Multi-input dependencies in DAG | Medium | Allow nodes to explicitly depend on multiple upstream nodes |

---

## 7. Summary Statistics

| Category | Implemented | Spec-Defined | Coverage |
|---|---|---|---|
| Frontmatter fields | 5/12 | 12 | 42% |
| Node types (parser) | 10/20+ | 20+ | ~50% |
| Source types | 2/4 | 4 | 50% |
| Sink types | 2/4 | 4 | 50% |
| Transform types | 4/5 | 5 | 80% |
| Temporal primitives | 0/6 | 6 | 0% |
| Error handling patterns | 1/5 | 5 | 20% (retry only) |
| CLI commands | 3/10 | 10 | 30% |
| Expression functions | 60+/65+ | 65+ | ~90% |
| Auth methods | 2/4 | 4 | 50% |
| File formats | 2/5 | 5 | 40% |
| Type system features | 3/8 | 8 | 38% |

**Overall estimated spec coverage: ~40-45%**

The implementation provides a solid, working foundation for basic workflows (HTTP source -> transform -> file/HTTP sink) with good expression evaluation, scheduling, retry logic, and state persistence. The main gaps are in advanced features: temporal primitives (0%), error handling patterns (20%), database/queue/email integrations, workflow composition, and the type system. The expression engine is the most complete subsystem at ~90% coverage.
