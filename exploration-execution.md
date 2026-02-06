# Exploration Report: Execution & Scheduler Subsystem

## Overview

The Execution & Scheduler subsystem is responsible for transforming a parsed workflow AST into an executable plan and running it. It consists of two main modules:

- **Scheduler** (`src/scheduler/`): Converts AST nodes into a DAG, computes execution waves via topological sort, and provides concurrency primitives.
- **Execution** (`src/execution/`): Runs the execution plan, manages state, handles retries, persists checkpoints, supports resume, and produces execution logs.

---

## 1. Scheduler Module

### 1.1 AST to DAG (`src/scheduler/dag.ts`)

The `buildDependencyGraph()` function takes an array of top-level `NodeAST` objects and produces a `Map<string, Set<string>>` mapping each node ID to its set of dependency node IDs.

**Dependency extraction is simple**: only the `node.input` field is used. If node B has `input: 'A'`, then B depends on A. Each node gets an entry in the map (initialized to an empty `Set`), and then `input` references are added as dependencies.

**Key details:**
- Only **top-level nodes** participate in wave scheduling. Control flow nodes (loop, if, parallel, foreach) handle their body execution internally within the executor.
- Each node can have at most **one input dependency** (single `input` field, not an array). This is a structural limitation -- a node cannot depend on multiple upstream nodes simultaneously at the DAG level.
- Nodes without an `input` field have zero dependencies and will be scheduled in wave 0.

### 1.2 Wave Computation (`src/scheduler/waves.ts`)

The `computeWaves()` function implements **Kahn's algorithm** for topological ordering, grouping nodes into execution waves:

1. Start with all nodes in a `remaining` set and an empty `completed` set.
2. For each iteration, find all nodes in `remaining` whose dependencies are fully in `completed` -- these form the current wave.
3. Move those nodes to `completed`, increment wave number, repeat.
4. If `remaining` is non-empty but no nodes are ready, a **cycle** is detected and an error is thrown.

**Wave semantics:**
- Wave 0: all nodes with no dependencies (sources, independent nodes)
- Wave N: nodes whose dependencies are all in waves 0 through N-1
- Nodes within the same wave have **no mutual dependencies** and can run concurrently

**Example:** For a diamond pattern `A -> B, A -> C, B -> D`:
- Wave 0: `[A]`
- Wave 1: `[B, C]` (both depend only on A)
- Wave 2: `[D]` (depends on B)

### 1.3 Execution Plan (`src/scheduler/index.ts`)

The `buildExecutionPlan()` function is the entry point that combines DAG building and wave computation:

```
WorkflowAST -> buildDependencyGraph() -> computeWaves() -> ExecutionPlan
```

The `ExecutionPlan` contains:
- `workflowId`: from `ast.metadata.name`
- `totalNodes`: count of top-level nodes
- `waves`: ordered array of `ExecutionWave` objects (`{ waveNumber, nodeIds }`)
- `nodes`: `Map<string, NodeAST>` for O(1) node lookup during execution

### 1.4 Concurrency Control (`src/scheduler/concurrency.ts`)

The `Semaphore` class provides a standard counting semaphore for limiting concurrent async operations:

- **Constructor**: Takes a `capacity` (must be >= 1). Initializes `permits = capacity`.
- **`acquire()`**: If permits > 0, decrements and returns immediately. Otherwise, adds a resolver to `waitQueue` and returns a pending Promise.
- **`release()`**: If waiters exist, resolves the first waiter directly (no permit increment). Otherwise, increments permits.
- **`available`** / **`waiting`**: Getters for current state.

This is a classic FIFO semaphore -- permits are granted in order of request. The "direct handoff" pattern in `release()` (giving the permit to the next waiter rather than incrementing then decrementing) prevents race conditions.

### 1.5 Types (`src/scheduler/types.ts`)

Key types:
- `ExecutionWave`: `{ waveNumber: number, nodeIds: string[] }`
- `ExecutionPlan`: `{ workflowId, totalNodes, waves, nodes }`
- `ExecutionOptions`: `{ maxConcurrency?, timeout?, persistencePath?, errorHandler?, defaultRetryConfig?, logPath? }`
- `DEFAULT_MAX_CONCURRENCY = 10`

---

## 2. Execution Module

### 2.1 Main Executor (`src/execution/executor.ts`)

The `execute()` function is the core execution engine. Its flow:

```
execute(plan, state, options)
  state.status = 'running'
  for each wave in plan.waves:
    executeWave(wave, nodes, state, maxConcurrency, retryConfig)
    if persistencePath: saveState(state, persistencePath)
  state.status = 'completed'
  if persistencePath: saveState (final)
  if logPath: appendExecutionLog
```

**Error handling in `execute()`:**
1. On failure: sets `state.status = 'failed'`, persists state, calls `errorHandler` if provided
2. Error handler failures are caught and logged (don't mask original error)
3. The original error is re-thrown after handler execution
4. Logging happens in `finally` block -- runs on both success and failure
5. Log write failures are caught and logged (don't mask execution result)

#### Wave Execution (`executeWave`)

Each wave creates a **new Semaphore** with the configured `maxConcurrency`. All node IDs in the wave are mapped to async tasks that:
1. `await semaphore.acquire()`
2. Look up the node from the map
3. Execute the node via `executeNode()`
4. Record the result in state
5. If result status is 'failed', throw the error
6. `semaphore.release()` in `finally`

All tasks are started with `Promise.all()`, but the semaphore limits actual concurrency. Errors are collected into an array, and after all tasks settle, the first error is thrown (fail-fast per wave).

#### Node Execution (`executeNode`)

The `executeNode()` function handles individual node execution:

1. **Input resolution**: If `node.input` is set, looks up the previous node's result from `state.nodeResults`.
2. **Runtime type mapping**: `getNodeRuntimeType()` maps AST node types to registry keys:
   - `source` -> `source:{sourceType}` (e.g., `source:http`)
   - `sink` -> `sink:{sinkType}`
   - `transform` -> `transform:{transformType}`
   - `branch/if/loop/while/foreach/parallel` -> `control:{type}`
   - `checkpoint` -> `checkpoint`
3. **State cloning**: Creates an isolated state copy via `cloneStateForNode()` with `input` injected into context.
4. **Config resolution**: `resolveNodeConfig()` recursively processes config values, evaluating template strings (`{{...}}`) via `evaluateTemplateInContext()`. Only string values are evaluated; nested objects are recursed; other types pass through unchanged.
5. **Retry wrapping**: If retry config exists (node-level from `config.retry` or default from options), wraps execution in `executeWithRetry()`. On exhaustion, tries fallback node if specified.
6. **Runtime execution**: Calls `runtime.execute({ node, input, config, state })`.
7. **Post-execution handling**:
   - If output is a `ParallelResult`, delegates to `handleParallelResult()`
   - If output is a `ForeachResult`, delegates to `handleForeachResult()`
8. **Result recording**: The `recordNodeResult()` function in executor.ts (local, not from state.ts) additionally exposes the output in `state.nodeContext[nodeId] = { output }` for expression access.

#### Parallel Branch Execution (`handleParallelResult`)

When a `control:parallel` node returns a `ParallelResult`, the executor:

1. Creates a semaphore with branch-specific limit (or global `maxConcurrency`)
2. For each branch (array of NodeAST):
   - Clones state via `cloneStateForBranch()` (adds `$branch` index to nodeContext)
   - Executes all nodes in the branch **sequentially** (within-branch ordering preserved)
   - Copies results back to main state's `nodeResults` and `nodeContext`
3. Collects results by branch index into an ordered array
4. Returns array of last outputs from each branch

**Important**: The parallel runtime itself does NOT execute branches. It returns metadata (`ParallelResult`), and the executor handles actual concurrent execution. This separation keeps runtimes stateless and simple.

#### Foreach Iteration Execution (`handleForeachResult`)

When a `control:foreach` node returns a `ForeachResult`, the executor handles iteration:

**Sequential mode** (`maxConcurrency = 1`, default):
- Iterates collection items one by one
- Clones state for each iteration with `itemVar` and `indexVar` injected
- Executes all body nodes sequentially per iteration
- Catches `BreakSignal` to stop iteration early
- Results array maintains index order

**Parallel mode** (`maxConcurrency > 1`):
- Creates semaphore with `iterLimit`
- All iterations start as async tasks
- Each iteration gets its own cloned state
- `BreakSignal` in parallel only stops the current iteration (not others)
- Results maintain index order via direct array assignment

**Body node resolution**: `ForeachResult.bodyNodeIds` contains string IDs. The executor looks up actual `NodeAST` objects from the nodes map.

#### Fallback Node Execution (`executeFallbackNode`)

When all retries fail and a `fallbackNodeId` is specified:
1. Looks up the fallback node from the nodes map
2. Injects `$primaryError` and `$primaryInput` into `state.nodeContext`
3. Executes the fallback node (importantly: **without retry** to avoid infinite loops)
4. If fallback also fails, throws the fallback error

#### Break Signal Detection

The `isBreakSignal()` helper checks for the `BreakSignal` by duck-typing: looks for `error.name === 'BreakSignal'`. This avoids import dependencies on the signals module.

### 2.2 State Management (`src/execution/state.ts`)

#### State Creation

`createExecutionState(options)` creates a fresh `ExecutionState`:
- Generates `runId` via `crypto.randomUUID()` if not provided
- Initializes `status: 'pending'`, `currentWave: 0`
- Sets `startedAt: Date.now()`
- Creates empty `nodeResults` Map and context objects
- Applies provided `config`, `secrets`, and `globalContext`

#### Context Layers

The execution state maintains three context layers with clear hierarchy:

1. **`globalContext`**: Workflow-wide variables. Set at creation, read-only during execution.
2. **`phaseContext`**: Per-phase variables. Updated when entering new phases via `setPhaseContext()`.
3. **`nodeContext`**: Per-node variables. Updated before each node via `setNodeContext()`. Also receives node outputs during execution (`nodeId: { output }` entries).

Additional special prefixes are added during expression evaluation (in `context.ts`):
- `$config`: workflow configuration
- `$secrets`: secret values
- `$context`: merged view of all three context layers

#### State Cloning for Parallel Isolation

`cloneStateForNode(state, contextOverrides)`:
- **Deep clones `nodeContext`** via `structuredClone()` to prevent parallel mutation
- **Shallow copies** `phaseContext` and `globalContext` (read-only during execution)
- **Shares `nodeResults`** Map reference -- writes are isolated by unique nodeId keys
- **Shares** `config` and `secrets` references (read-only)
- Applies `contextOverrides` on top of cloned nodeContext

There are also specialized cloning functions in executor.ts:
- `cloneStateForBranch()`: adds `$branch` index variable
- `cloneStateForIteration()`: adds `itemVar` and `indexVar` variables

#### Status Management

Utility functions: `markRunning()`, `markCompleted()`, `markFailed()`. The `markCompleted` and `markFailed` functions also set `completedAt = Date.now()`.

### 2.3 Execution Types (`src/execution/types.ts`)

**`NodeResult`**: Per-node execution outcome
- `status`: `'success' | 'failed' | 'skipped'`
- `output?`: any value produced
- `error?`: Error if failed
- `duration`: milliseconds
- `startedAt` / `completedAt`: timestamps

**`ExecutionState`**: Full workflow execution state
- Identity: `workflowId`, `runId`
- Progress: `status` (pending/running/completed/failed/cancelled), `currentWave`
- Timing: `startedAt`, `completedAt?`
- Results: `nodeResults: Map<string, NodeResult>`
- Context: `globalContext`, `phaseContext`, `nodeContext`
- Configuration: `config`, `secrets`

**`RetryConfig`**: Per-node retry settings
- `maxRetries?`: default 3
- `backoffBase?`: default 1000ms
- `timeout?`: default 30000ms
- `fallbackNodeId?`: node to execute if all retries fail

**`PersistedState`**: JSON-serializable version of ExecutionState where `nodeResults` is `Array<[string, NodeResult]>` instead of Map.

### 2.4 Retry Mechanism (`src/execution/retry.ts`)

#### Error Classification (`isRetryableError`)

Determines which errors should trigger retries:
- **Retryable**: `HttpError` with `isRetryable` (429 or 5xx), `AIError` with `retryable=true`, `TimeoutError` (including DOMException-like objects)
- **NOT retryable**: `AbortError` (user cancellation), generic `Error`, non-Error values, 4xx HttpErrors (except 429)

#### Retry Wrapper (`executeWithRetry`)

```
attempt = 0
while attempt <= maxRetries:
  try:
    signal = AbortSignal.timeout(timeout)
    return await fn(signal)
  catch error:
    if not retryable: throw immediately
    if attempts exhausted: break
    await sleep(calculateBackoffMs(attempt, backoffBase))
    attempt++

if onFallback: return await onFallback()
throw lastError
```

Key behavior:
- Creates an `AbortSignal.timeout()` for each attempt
- Non-retryable errors throw immediately (no retry, no fallback)
- Only retryable errors consume retry attempts
- The signal is passed to the function but **not yet used by runtimes** (noted in code)

#### Exponential Backoff with Jitter (from `src/runtimes/ai/retry.ts`)

`calculateBackoffMs(attempt, baseMs)`:
- Formula: `random(0, min(32000, base * 2^attempt))`
- Uses AWS "full jitter" strategy
- Sequence: base * 1, 2, 4, 8, 16, 32 (capped at 32s)
- Jitter: random value between 0 and calculated delay
- Prevents thundering herd problem

### 2.5 Persistence (`src/execution/persistence.ts`)

#### State Path Convention

`getStatePath(workflowId, runId)` -> `.maidit-state/{workflowId}/{runId}.json`

#### Save State (`saveState`)

1. Converts `ExecutionState` to `PersistedState` via `toPersistedState()`:
   - `nodeResults` Map -> `Array.from(map.entries())` (array of `[nodeId, result]` tuples)
   - All other fields copied as-is
2. Serializes to JSON with 2-space indentation
3. Creates parent directories via `Bun.$\`mkdir -p ${dir}\`.quiet()`
4. Writes file via `Bun.write(filePath, json)`

**Note**: Error objects in `NodeResult.error` will lose their stack traces during JSON serialization (they serialize to `{}`). This is a known limitation of JSON.stringify with Error objects.

#### Load State (`loadState`)

1. Checks file existence via `Bun.file(filePath).exists()`
2. Parses JSON via `file.json()`
3. Converts `PersistedState` back to `ExecutionState` via `fromPersistedState()`:
   - `nodeResults` array -> `new Map(array)` (restores Map from tuples)
   - Applies optional `config` and `secrets` overrides
4. Throws `FileError` for missing files or parse errors

### 2.6 Resume (`src/execution/resume.ts`)

#### Resume Check (`canResume`)

Checks if a workflow can be resumed:
1. File must exist
2. Status must be `'failed'` or `'cancelled'`
3. Returns false for `'completed'`, `'running'`, `'pending'`, or invalid files

#### Resume Workflow (`resumeWorkflow`)

1. Loads persisted state via `loadState()` with optional config/secrets overrides
2. Sets `state.status = 'running'`
3. Rebuilds full execution plan from original AST via `buildExecutionPlan()`
4. Filters waves to only those **after** the last completed wave: `wave.waveNumber > state.currentWave`
5. Creates a `resumePlan` with remaining waves only
6. Calls `execute(resumePlan, state, options)`
7. Returns the final state

**Important design note**: Resume re-uses the node results from the persisted state. Already-completed nodes have their outputs available for downstream nodes in remaining waves. The wave filtering uses `>` (strictly greater than), so the wave that was executing when the failure occurred is **not re-executed**. This means nodes that completed in the failing wave retain their results, but any nodes that didn't complete in that wave are skipped.

### 2.7 Execution Logging (`src/execution/logging.ts`)

#### Log Format (`formatExecutionLog`)

Produces a markdown-formatted log entry:

```markdown
---

## Execution Log

**Run ID:** `{runId}`
**Workflow:** {workflowId}
**Timestamp:** {ISO timestamp}
**Duration:** {seconds}s
**Status:** completed|failed
**Waves:** {currentWave + 1}

### Node Results

| Node | Status | Duration | Output |
|------|--------|----------|--------|
| nodeId | success | 1.50s | {"data":...} |
```

Features:
- Nodes sorted by `startedAt` (execution order)
- Output truncated to 50 characters max
- Pipe characters escaped for markdown table compatibility
- Failed nodes show `Error: {message}` in output column

#### Log Append (`appendExecutionLog`)

1. Reads existing workflow file content
2. If a `## Execution Log` section exists: finds the `---` separator before it and replaces everything from there onward
3. If no existing log section: appends the new log with a newline separator
4. Writes the updated content back to the file

This means **only the most recent execution log is kept** -- each run replaces the previous one.

### 2.8 Template Evaluation in Execution Context (`src/execution/index.ts`)

#### `evaluateInContext(expression, state)`

Evaluates a raw expression (without `{{ }}` delimiters) in the workflow's execution context:
1. Builds evaluation context from state via `buildEvaluationContext()` (from `expression/context.ts`)
2. Calls `evaluate(expression, context)` from the expression engine
3. On error: enriches `ExpressionError` with redacted context info (variable names only, no values)

#### `evaluateTemplateInContext(template, state)`

Evaluates a template string containing `{{...}}` expressions:
1. Builds evaluation context from state
2. Calls `evaluateTemplate(template, context)` from the expression engine
3. Same error enrichment as above

#### Context Building (`src/expression/context.ts`)

`buildEvaluationContext(state)` constructs the evaluation context with the variable hierarchy:

1. **Layer 1** (base): `globalContext` variables
2. **Layer 2** (overrides global): `phaseContext` variables
3. **Layer 3** (overrides phase): `nodeContext` variables
4. **Special prefixes**:
   - `$config`: workflow config object
   - `$secrets`: workflow secrets object
   - `$context`: merged view of all three context layers
5. **Node outputs**: For each successfully executed node, adds `nodeId: { output: value }` -- enabling expressions like `fetch.output.data`

---

## 3. Data Flow Summary

```
WorkflowAST
    |
    v
buildDependencyGraph(nodes)         -- Extract input dependencies
    |
    v
Map<nodeId, Set<depIds>>            -- DAG representation
    |
    v
computeWaves(nodes, dependencies)   -- Kahn's algorithm
    |
    v
ExecutionWave[]                     -- Topologically ordered waves
    |
    v
ExecutionPlan { waves, nodes }      -- Ready for execution
    |
    v
execute(plan, state, options)
    |
    +-- for each wave (sequential):
    |     |
    |     +-- Semaphore(maxConcurrency)
    |     |
    |     +-- for each node in wave (concurrent):
    |     |     |
    |     |     +-- resolveInput() from previous nodeResults
    |     |     +-- cloneStateForNode()
    |     |     +-- resolveNodeConfig() (template evaluation)
    |     |     +-- getRuntime(type)
    |     |     +-- executeWithRetry() if retry config
    |     |     |     +-- exponential backoff with jitter
    |     |     |     +-- fallback node execution
    |     |     +-- runtime.execute()
    |     |     +-- handle ParallelResult -> handleParallelResult()
    |     |     +-- handle ForeachResult -> handleForeachResult()
    |     |     +-- recordNodeResult()
    |     |
    |     +-- saveState() if persistencePath (after each wave)
    |
    +-- appendExecutionLog() if logPath (in finally block)
```

---

## 4. Test Coverage Analysis

### Scheduler Tests (`src/scheduler/scheduler.test.ts`)

- **Semaphore**: capacity validation, acquire/release, blocking behavior, concurrent limit enforcement
- **DAG Builder**: empty deps, single input dependency, dependency chains
- **Wave Computation**: single node, independent nodes (same wave), dependent nodes (next wave), chains, diamond pattern
- **Execution Plan**: empty workflow, node lookup, correct wave computation
- **Constants**: DEFAULT_MAX_CONCURRENCY value

### Executor Tests (`src/execution/executor.test.ts`)

- **Wave execution**: single wave, sequential waves, concurrency limits
- **Map transform**: template output with JSON encoding
- **State tracking**: timing info, wave progress, node output exposure in context
- **Error handling**: failed state marking on errors
- **Retry integration**: default retry config, node-level override
- **Persistence integration**: save after each wave, persist on failure
- **Error handler integration**: handler called on failure, original error preserved, handler errors don't mask
- **Logging integration**: log on success, log on failure, log errors don't mask
- **Combined features**: persistence + logging together, all features on failure

### Retry Tests (`src/execution/retry.test.ts`)

- **isRetryableError**: HttpError (429, 5xx retryable; 4xx not), AIError (retryable flag), TimeoutError, AbortError (not retryable), generic Error, non-Error values, DOMException-like TimeoutError
- **executeWithRetry**: first success, retry + succeed, exhaust retries, non-retryable immediate throw, fallback on exhaustion, no fallback for non-retryable, AbortSignal passing, defaults, AIError retry, AbortError no retry, timeout retry, non-Error conversion

### Persistence Tests (`src/execution/persistence.test.ts`)

- **Path generation**: correct pattern, special characters
- **Save**: JSON file creation, Map serialization to array, directory creation, all fields preserved
- **Load**: basic load, Map restoration, FileError on missing, config overrides, secrets overrides
- **Round-trip**: full state preservation, complex nested output values

### Logging Tests (`src/execution/logging.test.ts`)

- **Format**: markdown header, ISO timestamp, duration, status, wave count, per-node table, execution order sorting, long output truncation, pipe escaping, error messages
- **Append**: new file, existing file without log, replace existing log, handle no trailing newline

### Resume Tests (`src/execution/resume.test.ts`)

- **canResume**: non-existent file, failed status (true), cancelled status (true), completed status (false), running status (false), invalid JSON (false)
- **resumeWorkflow**: basic state loading verification, config overrides, secrets overrides

---

## 5. Limitations, Edge Cases, and Potential Issues

### 5.1 Single Input Dependency

Each node can only declare one `input` dependency. The DAG builder only looks at `node.input` (singular). This means a node cannot explicitly depend on multiple upstream nodes. In practice, if a node needs data from two sources, it must either:
- Be placed after both in the wave ordering (which happens naturally if one depends on the other)
- Use expression references like `nodeA.output` and `nodeB.output` in its config (but the scheduler won't know about these implicit dependencies)

This creates a risk: if node C uses `{{nodeA.output}}` in its template but doesn't declare `input="nodeA"`, C might execute before A completes if they land in the same wave.

### 5.2 Error Objects Not Preserved Through Persistence

When `NodeResult.error` is serialized to JSON, `Error` objects become `{}` (JSON.stringify doesn't serialize Error properties). The error message, stack trace, and name are lost. After loading persisted state, `nodeResult.error` will be an empty object rather than a proper Error.

### 5.3 Wave-Level Fail-Fast vs All-Settle

The current implementation collects errors in an array and throws the first one after `Promise.all()`. This means all nodes in the wave complete (or fail) before the error propagates. However, only the **first** error is surfaced -- subsequent errors are silently discarded.

### 5.4 Resume Wave Gap

Resume filters waves with `waveNumber > state.currentWave`. If a wave partially completed (some nodes succeeded, some failed), the resume will skip the entire wave and move to the next one. This means:
- Nodes that failed in the partial wave are NOT retried on resume
- Nodes that were never started in the partial wave are skipped
- Only waves strictly after the failing wave are executed

This could be problematic if the failing wave had critical nodes that were skipped.

### 5.5 Foreach Body Node ID Lookup

`handleForeachResult()` looks up body node IDs from the top-level `nodes` map. However, foreach body nodes are typically children of the foreach node, not top-level nodes. The code handles this by silently skipping IDs not found in the map:
```typescript
const node = nodes.get(id);
if (node) { bodyNodes.push(node); }
```
This means if body nodes are NOT in the top-level nodes map, the foreach loop will execute with an empty body, producing no results. The parallel runtime has similar behavior -- it passes the actual `NodeAST` objects from `parallelNode.branches`, which are already resolved.

### 5.6 Parallel/Foreach Node Result Merging

When parallel branches or foreach iterations execute nodes, results are written back to the shared `state.nodeResults` map. If different branches contain nodes with the same ID (unlikely but possible with poorly designed workflows), the last one to complete overwrites earlier results.

### 5.7 Fallback Node Retry

The fallback node execution calls `executeNode()` with the same `defaultRetryConfig`. This means the fallback node could itself have retry logic applied (either from its own config or the default). The code comments say "without retry to avoid infinite loops" but the implementation still passes `defaultRetryConfig` through. If the fallback node has no explicit retry config AND no default retry config is set, it runs once. But with a default retry config, the fallback will also retry.

### 5.8 No Global Timeout

The `timeout` field in `ExecutionOptions` is defined but **never used** in the executor. There's no mechanism to abort an entire workflow after a timeout. The only timeout is per-attempt within `executeWithRetry()`.

### 5.9 Semaphore Per Wave

A new `Semaphore` is created for each wave in `executeWave()`. This means the concurrency limit is per-wave, not global. If a wave has 100 nodes with `maxConcurrency: 10`, exactly 10 run at once. But there's no inter-wave concurrency (waves are sequential).

### 5.10 AbortSignal Not Used by Runtimes

The `executeWithRetry()` creates an `AbortSignal.timeout()` and passes it to the function, but the actual runtime `execute()` method doesn't receive or use the signal. The comment in code notes: "signal available for timeout, but runtime.execute doesn't yet use it." This means per-attempt timeouts only work at the Promise level (race condition), not through cooperative cancellation.

### 5.11 nodeContext Mutation in Fallback

`executeFallbackNode()` directly mutates `state.nodeContext.$primaryError` and `$primaryInput`. This modifies the original state object, not a clone, which could affect other parallel executions sharing the state.

### 5.12 Logging Replaces Previous Runs

`appendExecutionLog()` replaces existing log sections rather than accumulating them. Only the most recent execution log is preserved in the workflow file. Historical execution data is lost unless persisted state files are kept separately.
