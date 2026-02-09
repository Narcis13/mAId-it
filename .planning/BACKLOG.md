# FlowScript v1.1 Backlog

**Strategy:** Sprint Batches (see STRATEGY.md)
**Source:** gaps.md (comprehensive spec gap analysis)
**Baseline:** v1.0 shipped — 60/60 requirements, 386+ tests, ~45% spec coverage
**Target:** v1.1 — ~70% spec coverage, all Tier 1-2 items complete

---

## Progress Tracker

| Batch | Name | Status | Items | Session Date |
|-------|------|--------|-------|-------------|
| 1 | Critical Bugfixes | done | 6/6 | 2026-02-09 |
| 2 | Parser Expansion | pending | 0/7 | — |
| 3 | Expression Hardening | pending | 0/6 | — |
| 4 | Temporal Primitives | pending | 0/5 | — |
| 5 | Execution Fixes | pending | 0/5 | — |
| 6 | Database Runtime | pending | 0/4 | — |
| 7 | Advanced Control Flow | pending | 0/5 | — |
| 8 | New Sink/Source Types | pending | 0/4 | — |
| 9 | Composition & CLI | pending | 0/4 | — |
| 10 | Self-Evolution | pending | 0/4 | — |

**Overall:** 6/50 items complete

---

## Dependency Graph

```
Batch 1 (Bugfixes) ──────────────────────────────┐
                                                   ├── Independent after 1
Batch 2 (Parser Expansion) ──┬── Batch 4 (Temporal)│
                              ├── Batch 7 (Control) │
                              └── Batch 9 (Compose) │
                                                     │
Batch 3 (Expression) ────────────────────────────────┤ Independent
Batch 5 (Execution) ─────────────────────────────────┤ Independent
Batch 6 (Database) ──────────────────────────────────┤ Independent (parser allows custom types)
Batch 8 (Sink/Source) ───────────────────────────────┤ Independent
                                                      │
Batch 10 (Self-Evolution) ───────── Needs all above ──┘
```

**Critical path:** Batch 1 → Batch 2 → {Batch 4, 7, 9} in parallel

---

## BATCH 1: Critical Bugfixes [Tier 1]

**Scope:** Fix known bugs that affect correctness and could cause silent failures
**Files:** `src/expression/functions/index.ts`, `src/execution/persistence.ts`, `src/execution/executor.ts`, `src/validator/structural.ts`
**Depends on:** none
**Estimated effort:** S (small — each fix is 1-10 lines)

### Items

- [x] **1.1 Fix `concat` function name collision** (low)
  - File: `src/expression/functions/index.ts`
  - Bug: `arrayFunctions.concat` overwrites `stringFunctions.concat` in flat namespace
  - Fix: Rename array version to `array_concat` or use explicit key assignment
  - Test: Verify `concat("a", "b")` returns `"ab"` and array concat still works

- [x] **1.2 Fix Error serialization in persistence** (low)
  - File: `src/execution/persistence.ts`
  - Bug: `JSON.stringify()` serializes Error objects as `{}`, losing message/stack
  - Fix: Custom replacer that extracts `{ name, message, stack, code }` from Error instances
  - Test: Save state with error, load it, verify error fields preserved

- [x] **1.3 Fix nodeContext mutation in fallback execution** (low)
  - File: `src/execution/executor.ts` (executeFallbackNode)
  - Bug: Directly mutates `state.nodeContext.$primaryError` — affects parallel executions
  - Fix: Clone state before fallback, or use spread to create new nodeContext
  - Test: Run parallel nodes where one falls back, verify other contexts unaffected

- [x] **1.4 Fix trigger validation mismatch** (low)
  - File: `src/validator/structural.ts`
  - Bug: Validator expects `trigger.type` to be a string, but spec uses nested object format
  - Fix: Accept both `trigger: manual` (string) and `trigger: { manual: true }` (object)
  - Test: Validate workflows with both trigger formats

- [x] **1.5 Fix fallback node still retrying** (low)
  - File: `src/execution/executor.ts` (executeFallbackNode)
  - Bug: Fallback calls `executeNode()` with `defaultRetryConfig`, could infinite-loop
  - Fix: Pass `undefined` or `{ maxRetries: 0 }` for retry config in fallback
  - Test: Verify fallback node executes exactly once even if it fails

- [x] **1.6 Fix map/filter iteration variable inconsistency** (low)
  - Files: `src/runtimes/transform/filter.ts`
  - Bug: Map provides `$item, $index, $first, $last, $items` but filter only `$item, $index`
  - Fix: Add `$first`, `$last`, `$items` to filter iteration context
  - Test: Use `$first` and `$last` in a filter condition

---

## BATCH 2: Parser Expansion [Tier 2]

**Scope:** Extend the XML body parser to recognize new node types defined in the spec. This unlocks Batches 4, 7, and 9.
**Files:** `src/parser/body.ts`, `src/parser/body.test.ts` (new), `src/types/ast.ts`
**Depends on:** none (but should follow Batch 1 for clean foundation)
**Estimated effort:** M (medium — ~200 lines of parser code + tests)

### Items

- [ ] **2.1 Add body parser test coverage** (medium)
  - File: `src/parser/body.test.ts` (new file)
  - Currently: Only frontmatter tests exist. Body parsing is untested.
  - Add: Tests for each existing node type parsing (source, sink, transform, ai, control flow)
  - This provides a regression safety net before we modify the parser.

- [ ] **2.2 Parse `<phase>` element** (medium)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<phase name="gather">...</phase>` — logical grouping of nodes
  - Add PhaseNode to AST types, parse children as nodes within phase scope
  - Validator should treat phase as transparent wrapper (nodes visible globally)

- [ ] **2.3 Parse `<context>` element** (low)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<context id="global"><set key="x" value="y"/></context>`
  - Add ContextNode to AST with key-value pairs
  - Execution: Inject into nodeContext at the start of relevant scope

- [ ] **2.4 Parse `<set>` element** (low)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<set var="name" value="{{expr}}"/>` — variable assignment
  - Standalone element that can appear inside loops, phases, etc.
  - Execution: Evaluate expression and store in nodeContext

- [ ] **2.5 Parse `<delay>` element** (low)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<delay duration="5s"/>` — pause execution
  - Simple node type with a single `duration` attribute

- [ ] **2.6 Parse `<timeout>` wrapper element** (low)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<timeout duration="30s" on-timeout="fallback">...</timeout>`
  - Wrapper node with child nodes and timeout/fallback configuration

- [ ] **2.7 Parse per-node `<on-error>` element** (medium)
  - File: `src/parser/body.ts`, `src/types/ast.ts`
  - Spec: `<on-error><retry when="..." max="3" backoff="exponential"/></on-error>`
  - Extract retry config, fallback config from `<on-error>` children
  - Store as optional `errorConfig` on the parent NodeAST

---

## BATCH 3: Expression Hardening [Tier 2]

**Scope:** Fix expression engine limitations and add missing functions
**Files:** `src/expression/parser.ts`, `src/expression/evaluator.ts`, `src/expression/context.ts`, `src/expression/functions/*.ts`
**Depends on:** none
**Estimated effort:** M

### Items

- [ ] **3.1 Fix template regex for nested `}}`** (low)
  - File: `src/expression/parser.ts`
  - Bug: `/\{\{(.+?)\}\}/g` fails when expression contains `}}`
  - Fix: Use balanced bracket matching or escape-aware regex
  - Also add: escape mechanism for literal `{{` (e.g., `\{\{` or `{{{`)

- [ ] **3.2 Add expression syntax validation pass** (medium)
  - File: `src/validator/expressions.ts` (new), `src/validator/index.ts`
  - Parse (don't evaluate) all template expressions at validation time
  - Catches syntax errors before runtime (currently only caught during execution)
  - Adds new validation pass after structural, before refs

- [ ] **3.3 Add `$env.VAR` environment variable access** (low)
  - File: `src/expression/context.ts`
  - Add `$env` to EvalContext using `process.env` (or `Bun.env`)
  - Security: Consider allowlisting or prefixing for sensitive vars

- [ ] **3.4 Add `duration()` function** (low)
  - File: `src/expression/functions/time.ts`
  - Parse ISO durations ("P1D", "PT1H30M") and human durations ("5s", "1m", "2h")
  - Return milliseconds or Luxon Duration object
  - Needed by temporal primitives in Batch 4

- [ ] **3.5 Add `switch()` function** (low)
  - File: `src/expression/functions/type.ts`
  - `switch(val, { "a": 1, "b": 2 }, defaultVal)` — dictionary lookup with default
  - Simple object key lookup, no pattern matching needed

- [ ] **3.6 Improve `hash()` with sha256/md5** (low)
  - File: `src/expression/functions/string.ts`
  - Current: Only djb2 hash
  - Add: `hash(s, "sha256")`, `hash(s, "md5")` using `Bun.CryptoHasher`
  - Default to sha256 when algorithm specified, keep djb2 for backward compat

---

## BATCH 4: Temporal Primitives [Tier 2]

**Scope:** Implement time-based workflow controls
**Files:** `src/runtimes/temporal/` (new directory), `src/execution/executor.ts`
**Depends on:** Batch 2 (parser expansion for `<delay>` and `<timeout>`), Batch 3 (duration function)
**Estimated effort:** M

### Items

- [ ] **4.1 Duration parsing utility** (low)
  - File: `src/runtimes/temporal/duration.ts` (new)
  - Parse: ISO ("PT30S", "P1D"), human ("5s", "1m", "2h", "500ms"), number (milliseconds)
  - Return: milliseconds (number)
  - Reusable across all temporal primitives

- [ ] **4.2 Implement `<delay>` runtime** (low)
  - File: `src/runtimes/temporal/delay.ts` (new)
  - Simple: `await Bun.sleep(parseDuration(config.duration))`
  - Register as `temporal:delay`
  - Pass-through: input data flows through unchanged

- [ ] **4.3 Implement `<timeout>` wrapper runtime** (medium)
  - File: `src/runtimes/temporal/timeout.ts` (new)
  - Wrap child node execution with `AbortSignal.timeout()`
  - On timeout: route to `on-timeout` fallback node
  - Register as `temporal:timeout`

- [ ] **4.4 Wire global execution timeout** (low)
  - File: `src/execution/executor.ts`
  - `ExecutionOptions.timeout` exists but is never used
  - Add: `AbortController` wrapping the main `execute()` function
  - On timeout: throw `TimeoutError` with elapsed time info

- [ ] **4.5 Pass AbortSignal to runtimes** (low)
  - File: `src/execution/executor.ts`, `src/runtimes/types.ts`
  - Add `signal?: AbortSignal` to `ExecutionParams`
  - Thread it through from `executeWithRetry()` → `runtime.execute()`
  - Runtimes can check `signal.aborted` for cooperative cancellation

---

## BATCH 5: Execution Fixes [Tier 1-2]

**Scope:** Fix execution engine bugs and add missing reliability features
**Files:** `src/execution/executor.ts`, `src/execution/resume.ts`, `src/scheduler/dag.ts`, `src/runtimes/http/source.ts`
**Depends on:** none
**Estimated effort:** M

### Items

- [ ] **5.1 Fix resume wave gap** (medium)
  - File: `src/execution/resume.ts`
  - Bug: If wave 2 had 5 nodes and 3 completed, resume skips to wave 3 (2 nodes lost)
  - Fix: Re-execute unstarted/failed nodes in the current wave before proceeding
  - Test: Partially complete wave 2, resume, verify all wave 2 nodes execute

- [ ] **5.2 Fix wave-level error discarding** (low)
  - File: `src/execution/executor.ts` (executeWave)
  - Bug: Only first error thrown, subsequent errors silently lost
  - Fix: Collect all errors, throw `AggregateError` if multiple
  - Test: Wave with 3 nodes, 2 fail — verify both errors reported

- [ ] **5.3 Add multi-input DAG dependencies** (medium)
  - File: `src/scheduler/dag.ts`
  - Current: Nodes declare single `input` dependency
  - Add: Scan template expressions in node configs for `{{nodeId.output}}` references
  - Build edges for all detected dependencies, not just the `input` attribute
  - Prevents race conditions in diamond dependency patterns

- [ ] **5.4 HTTP source: support non-JSON responses** (low)
  - File: `src/runtimes/http/source.ts`
  - Current: Rejects anything that isn't JSON
  - Add: Content-type detection — `text/plain` → string, `text/xml` → string, `application/json` → parsed
  - Fallback: If no content-type, try JSON parse, then return as string

- [ ] **5.5 File path traversal hardening** (low)
  - File: `src/runtimes/file/path.ts`
  - Current: String-based `../` check (bypassable with encoding)
  - Fix: `path.resolve()` the final path, check it's within allowed base directory
  - Test: Try `..%2F`, `./foo/../../etc/passwd`, symlink escapes

---

## BATCH 6: Database Runtime [Tier 2]

**Scope:** Implement database source and sink nodes using Bun's built-in database APIs
**Files:** `src/runtimes/database/` (new directory)
**Depends on:** none (parser already allows unknown types with warnings)
**Estimated effort:** L (large — new subsystem with connection management)

### Items

- [ ] **6.1 Database connection manager** (medium)
  - File: `src/runtimes/database/connection.ts` (new)
  - Parse connection URLs: `postgres://...`, `sqlite:///path`
  - Use `Bun.sql` for Postgres, `bun:sqlite` for SQLite
  - Connection lifecycle: create, health check, close
  - Store as reusable across source/sink in same workflow

- [ ] **6.2 Database source runtime** (medium)
  - File: `src/runtimes/database/source.ts` (new)
  - Config: `connection` (URL or secret ref), `query` (SQL), `params` (optional)
  - Parameterized queries only (prevent SQL injection)
  - Return: Array of row objects
  - Register as `database:source`

- [ ] **6.3 Database sink runtime** (medium)
  - File: `src/runtimes/database/sink.ts` (new)
  - Config: `connection`, `operation` (insert/upsert/update), `table`, `batch` size
  - Parameterized INSERT/UPDATE statements
  - Batch support: chunk input array, execute in batches
  - Register as `database:sink`

- [ ] **6.4 Database parser + validator support** (low)
  - File: `src/parser/body.ts`, `src/validator/structural.ts`
  - Add `database` to allowed source/sink types
  - Validate required fields: `connection`, `query` (source) or `table` (sink)
  - Add to structural validator's type check

---

## BATCH 7: Advanced Control Flow [Tier 2-3]

**Scope:** Extend control flow nodes with spec-defined features
**Files:** `src/runtimes/control/parallel.ts`, `src/runtimes/control/types.ts`, `src/runtimes/transform/reduce.ts` (new)
**Depends on:** Batch 2 (parser for new elements)
**Estimated effort:** M

### Items

- [ ] **7.1 Parallel wait strategies** (medium)
  - File: `src/runtimes/control/parallel.ts`, `src/execution/executor.ts`
  - Current: Always waits for all branches (`Promise.all`)
  - Add: `wait="any"` → `Promise.any`, `wait="n(2)"` → first N to resolve
  - Cancel remaining branches on early resolution (AbortController)

- [ ] **7.2 Parallel merge strategies** (medium)
  - File: `src/runtimes/control/parallel.ts`
  - Current: Returns array of branch outputs
  - Add: `merge="concat"` (flatten arrays), `merge="object"` (merge as keyed object)
  - Custom merge via expression: `merge="{{...}}"` evaluated with branch results

- [ ] **7.3 Reduce transform runtime** (medium)
  - File: `src/runtimes/transform/reduce.ts` (new)
  - Config: `initial` (starting accumulator), `expression` (reducer applied per item)
  - Iteration: For each item, evaluate expression with `$acc` and `$item` in context
  - Optional `finalize` expression applied to final result
  - Register as `transform:reduce`

- [ ] **7.4 Checkpoint action routing** (medium)
  - File: `src/runtimes/checkpoint/runtime.ts`
  - Current: Approve/reject/input only
  - Add: Named actions with `goto` routing (spec: `<action id="edit"><goto node="apply-edits"/>`)
  - Return action ID and optional input data for downstream routing

- [ ] **7.5 Checkpoint conditional display** (low)
  - File: `src/runtimes/checkpoint/runtime.ts`
  - Current: Always shows the checkpoint prompt
  - Add: `condition` attribute — evaluate expression, skip checkpoint if false
  - Spec: `<condition>draft.word_count > 1000</condition>`

---

## BATCH 8: New Sink/Source Types [Tier 3]

**Scope:** Add commonly needed I/O integrations
**Files:** `src/runtimes/http/source.ts`, `src/runtimes/http/sink.ts`, `src/runtimes/file/source.ts`, `src/runtimes/email/` (new)
**Depends on:** none
**Estimated effort:** M

### Items

- [ ] **8.1 Email sink runtime (SendGrid)** (medium)
  - File: `src/runtimes/email/sink.ts` (new)
  - SendGrid API integration (HTTP-based, no SDK needed)
  - Config: `api_key` (secret ref), `from`, `to`, `subject`, `html`/`text`
  - Template resolution for all fields
  - Register as `email:sink`

- [ ] **8.2 CSV/YAML file format support** (low)
  - File: `src/runtimes/file/source.ts`, `src/runtimes/file/sink.ts`
  - CSV: Use Bun's text parsing or simple split-based CSV
  - YAML: Use `Bun.YAML` (already available in parser)
  - Add `format: csv | yaml` to file source/sink

- [ ] **8.3 HTTP PUT/DELETE methods** (low)
  - File: `src/runtimes/http/source.ts`, `src/runtimes/http/sink.ts`
  - Source: Add PUT, DELETE to allowed methods
  - Sink: Add DELETE to allowed methods (POST, PUT, PATCH already exist)

- [ ] **8.4 OAuth2 authentication** (high)
  - File: `src/runtimes/http/auth.ts` (new)
  - OAuth2 client credentials flow: token endpoint, client ID/secret
  - Token caching with automatic refresh on 401
  - Add `auth: { type: oauth2, token_url, client_id, client_secret }` to HTTP config

---

## BATCH 9: Composition & CLI [Tier 3]

**Scope:** Workflow reuse and developer tooling
**Files:** `src/runtimes/composition/` (new), `src/cli/`
**Depends on:** Batch 2 (parser for `<include>`, `<call>`)
**Estimated effort:** L

### Items

- [ ] **9.1 `<include>` workflow composition** (high)
  - File: `src/runtimes/composition/include.ts` (new)
  - Parse included workflow file, execute as sub-workflow
  - Bind inputs via `<bind>` elements
  - Output available as `includeId.output` in parent scope
  - Cycle detection: prevent recursive includes

- [ ] **9.2 `<call>` workflow invocation** (medium)
  - File: `src/runtimes/composition/call.ts` (new)
  - Like include but function-call semantics
  - Pass args, receive output, isolated execution context
  - Register as `composition:call`

- [ ] **9.3 `flowscript inspect` command** (medium)
  - File: `src/cli/inspect.ts` (new), `src/cli/index.ts`
  - Parse workflow, display structure: nodes, dependencies, types
  - `--deps` flag: show dependency graph (text-based DAG)
  - `--schema` flag: show input/output schemas

- [ ] **9.4 `flowscript test` command** (high)
  - File: `src/cli/test.ts` (new), `src/cli/index.ts`
  - Define test cases inline in workflow or in `.test.flow.md` files
  - Mock sources (provide fixture data instead of HTTP calls)
  - Assert on sink outputs, node results, execution path
  - Report: pass/fail per test case

---

## BATCH 10: Self-Evolution [Tier 4 — v2.0]

**Scope:** Workflows that learn and improve from their own execution history
**Files:** `src/execution/evolution/` (new), `src/parser/frontmatter.ts`
**Depends on:** All prior batches (stable execution foundation required)
**Estimated effort:** L

### Items

- [ ] **10.1 Parse evolution frontmatter section** (low)
  - File: `src/parser/frontmatter.ts`
  - Spec: `evolution: { generation, parent, fitness, learnings[] }`
  - Parse and include in WorkflowMetadata

- [ ] **10.2 Execution log learnings tracking** (medium)
  - File: `src/execution/logging.ts`, `src/execution/evolution/tracker.ts` (new)
  - After each run: compare metrics to historical baseline
  - Detect patterns: recurring failures, performance degradation, output drift
  - Append learnings to markdown footer in structured format

- [ ] **10.3 Behavior versioning** (medium)
  - File: `src/execution/evolution/behavior.ts` (new)
  - Track output characteristics: length, sentiment distribution, entity density
  - Compare to golden baseline, flag drift beyond thresholds
  - Auto-bump behavior version suffix when drift detected

- [ ] **10.4 Feedback loop mechanism** (high)
  - File: `src/execution/evolution/feedback.ts` (new)
  - Wire: Run complete → Collect metrics → Compare to baseline → Suggest improvements
  - Optional: AI-powered prompt improvement suggestions
  - Store feedback history for trend analysis

---

## Discovered Items (added during execution)

*Items found during batch implementation that don't fit current batches. Add here, then promote to a batch during milestone review.*

<!-- (empty — populated as work progresses) -->

---

## Session Log

*Updated after each session. Newest first.*

### Session 2026-02-09 — Batch 1: Critical Bugfixes
**Duration:** ~10m
**Items completed:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
**Items deferred:** none
**Learnings:** Items 1.3 and 1.5 shared the same code path (executeFallbackNode) — fixed together
**Next:** Batch 2 (Parser Expansion)
