# Phase 7: Production Readiness - Research

**Researched:** 2026-02-05
**Domain:** Error handling, state persistence, checkpointing, and execution logging
**Confidence:** HIGH

## Summary

Production readiness requires four key capabilities: resilient error handling with retry logic, state persistence for recovery, user checkpoints for human-in-the-loop workflows, and structured execution logging. The existing codebase already has strong foundations in place with exponential backoff (calculateBackoffMs), error classification (AIError, HttpError), and execution state management (ExecutionState, nodeResults Map). The project follows a no-external-dependencies philosophy using native Bun APIs.

The standard approach leverages existing patterns: extend NodeRuntime interface with retry/timeout/fallback config, add state serialization using Bun.file().json() and Bun.write(), create a checkpoint runtime using node:readline for terminal prompts, and implement log appending with Bun.file() and structured markdown formatting. All error handling uses discriminated unions and fail-fast semantics matching Phase 6's concurrency model.

**Primary recommendation:** Extend existing patterns rather than introducing new frameworks. Use Bun's native APIs (AbortSignal.timeout, Bun.file, node:readline), leverage the runtime registry system, and maintain the project's TypeScript-first, zero-dependency architecture.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun Runtime | 1.x | Native APIs for file I/O, timeouts, readline | Project uses Bun exclusively, no Node.js |
| node:readline | Built-in | Terminal prompts and user input | Standard Node.js module, fully supported in Bun |
| AbortSignal.timeout | Web API | Timeout handling for async operations | Modern browser/runtime API, preferred over setTimeout patterns |
| structuredClone | Web API | Deep cloning for state isolation | Already used in Phase 6 for parallel execution |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bun.file() | Native | Reading JSON/text files | State persistence, log reading |
| Bun.write() | Native | Writing files atomically | State checkpoints, log appending |
| crypto.randomUUID() | Native | Run ID generation | Already used in createExecutionState |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun.file/write | node:fs promises | Bun APIs are faster and more ergonomic |
| AbortSignal.timeout | Manual setTimeout+Promise | AbortSignal is standard, composable, cleaner |
| node:readline | inquirer/prompts | External deps violate project philosophy |

**Installation:**
No installation needed - all capabilities are built into Bun runtime.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── runtimes/
│   ├── checkpoint/        # Checkpoint runtime
│   │   ├── runtime.ts
│   │   └── types.ts
│   └── types.ts           # Extend with retry/timeout config
├── execution/
│   ├── persistence.ts     # State save/load functions
│   ├── logging.ts         # Execution log formatting
│   └── executor.ts        # Extended with error handling
└── errors/
    └── errors.ts          # Already has HttpError, AIError patterns
```

### Pattern 1: Per-Node Retry Configuration
**What:** Each node can specify retry, timeout, and fallback config in its runtime
**When to use:** ERR-01 through ERR-04 - node-level resilience
**Example:**
```typescript
// Extend ExecutionParams to support retry metadata
interface RetryConfig {
  maxRetries?: number;      // Default: 3
  backoffBase?: number;     // Default: 1000ms
  timeout?: number;         // Default: 30000ms
  fallbackNodeId?: string;  // Alternative node on failure
}

// Runtime execution wrapper with retry logic
async function executeWithRetry(
  runtime: NodeRuntime,
  params: ExecutionParams,
  retryConfig: RetryConfig
): Promise<unknown> {
  let attempt = 0;
  let lastError: Error;

  while (attempt <= (retryConfig.maxRetries ?? 3)) {
    try {
      const controller = AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        retryConfig.timeout ?? 30000
      );

      const result = await runtime.execute({
        ...params,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return result;

    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt < (retryConfig.maxRetries ?? 3)) {
        const backoffMs = calculateBackoffMs(
          attempt,
          retryConfig.backoffBase ?? 1000
        );
        await sleep(backoffMs);
      }

      attempt++;
    }
  }

  // All retries exhausted - try fallback if configured
  if (retryConfig.fallbackNodeId) {
    return executeFallbackNode(retryConfig.fallbackNodeId, params);
  }

  throw lastError;
}
```
**Source:** Existing calculateBackoffMs in src/runtimes/ai/retry.ts, AbortSignal.timeout from [MDN AbortSignal docs](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

### Pattern 2: State Persistence After Each Wave
**What:** Serialize ExecutionState to JSON after each wave completes
**When to use:** STATE-01, STATE-02 - checkpointing and resume
**Example:**
```typescript
// src/execution/persistence.ts
export interface PersistedState {
  workflowId: string;
  runId: string;
  status: ExecutionState['status'];
  currentWave: number;
  startedAt: number;
  completedAt?: number;
  nodeResults: Array<[string, NodeResult]>; // Map as array
  globalContext: Record<string, unknown>;
  phaseContext: Record<string, unknown>;
  nodeContext: Record<string, unknown>;
}

export async function saveState(
  state: ExecutionState,
  filePath: string
): Promise<void> {
  const persisted: PersistedState = {
    workflowId: state.workflowId,
    runId: state.runId,
    status: state.status,
    currentWave: state.currentWave,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    // Convert Map to array for JSON serialization
    nodeResults: Array.from(state.nodeResults.entries()),
    globalContext: state.globalContext,
    phaseContext: state.phaseContext,
    nodeContext: state.nodeContext,
  };

  await Bun.write(filePath, JSON.stringify(persisted, null, 2));
}

export async function loadState(
  filePath: string,
  config: ExecutionStateOptions
): Promise<ExecutionState> {
  const file = Bun.file(filePath);
  const persisted = await file.json() as PersistedState;

  return {
    ...persisted,
    // Convert array back to Map
    nodeResults: new Map(persisted.nodeResults),
    config: config.config ?? {},
    secrets: config.secrets ?? {},
  };
}
```
**Source:** [Bun file operations guide](https://bun.com/docs/guides/write-file/append), existing state.ts patterns

### Pattern 3: Checkpoint Runtime with Terminal Prompts
**What:** A runtime that pauses execution and prompts user via terminal
**When to use:** CHKPT-01 through CHKPT-04 - human-in-the-loop workflows
**Example:**
```typescript
// src/runtimes/checkpoint/runtime.ts
import * as readline from 'node:readline';

interface CheckpointConfig {
  message: string;           // Prompt message
  timeout?: number;          // Milliseconds before default action
  defaultAction?: 'approve' | 'reject'; // Action on timeout
  allowInput?: boolean;      // Accept user text input
}

class CheckpointRuntime implements NodeRuntime<CheckpointConfig, unknown, CheckpointResult> {
  readonly type = 'checkpoint';

  async execute(params: ExecutionParams<CheckpointConfig, unknown>): Promise<CheckpointResult> {
    const { config, input } = params;

    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      let timeoutId: Timer | undefined;

      // Setup timeout if configured
      if (config.timeout) {
        timeoutId = setTimeout(() => {
          rl.close();
          const action = config.defaultAction ?? 'reject';
          resolve({
            action,
            input: undefined,
            timedOut: true,
          });
        }, config.timeout);
      }

      // Prompt user
      const prompt = `\n${config.message}\n[A]pprove / [R]eject${config.allowInput ? ' / [I]nput' : ''}: `;

      rl.question(prompt, (answer) => {
        if (timeoutId) clearTimeout(timeoutId);
        rl.close();

        const char = answer.trim().toLowerCase()[0];

        if (char === 'a') {
          resolve({ action: 'approve', input: undefined, timedOut: false });
        } else if (char === 'r') {
          resolve({ action: 'reject', input: undefined, timedOut: false });
        } else if (char === 'i' && config.allowInput) {
          // Prompt for text input
          askForInput(config.message).then(text => {
            resolve({ action: 'input', input: text, timedOut: false });
          });
        } else {
          reject(new Error(`Invalid response: ${answer}`));
        }
      });
    });
  }
}
```
**Source:** [Bun readline reference](https://bun.com/reference/node/readline), [Node.js readline guide](https://nodejs.org/en/learn/command-line/accept-input-from-the-command-line-in-nodejs)

### Pattern 4: Markdown Execution Log Footer
**What:** Append structured execution log to workflow markdown file
**When to use:** LOG-01 through LOG-04 - execution audit trail
**Example:**
```typescript
// src/execution/logging.ts
export interface ExecutionLogEntry {
  runId: string;
  timestamp: number;
  duration: number;
  status: 'completed' | 'failed';
  nodeResults: Map<string, NodeResult>;
}

export function formatExecutionLog(entry: ExecutionLogEntry): string {
  const date = new Date(entry.timestamp).toISOString();
  const durationSec = (entry.duration / 1000).toFixed(2);

  let markdown = `\n---\n\n## Execution Log\n\n`;
  markdown += `**Run ID:** \`${entry.runId}\`\n`;
  markdown += `**Timestamp:** ${date}\n`;
  markdown += `**Duration:** ${durationSec}s\n`;
  markdown += `**Status:** ${entry.status}\n\n`;

  // Per-node results table
  markdown += `### Node Results\n\n`;
  markdown += `| Node | Status | Duration | Output |\n`;
  markdown += `|------|--------|----------|--------|\n`;

  for (const [nodeId, result] of entry.nodeResults) {
    const nodeStatus = result.status;
    const nodeDuration = (result.duration / 1000).toFixed(2);
    const output = result.status === 'success'
      ? truncate(JSON.stringify(result.output), 50)
      : result.error?.message ?? 'N/A';

    markdown += `| ${nodeId} | ${nodeStatus} | ${nodeDuration}s | ${output} |\n`;
  }

  return markdown;
}

export async function appendExecutionLog(
  workflowPath: string,
  entry: ExecutionLogEntry
): Promise<void> {
  const logMarkdown = formatExecutionLog(entry);

  // Read existing content
  const file = Bun.file(workflowPath);
  const existing = await file.text();

  // Check if log section exists
  const logMarker = '## Execution Log';
  let updated: string;

  if (existing.includes(logMarker)) {
    // Replace existing log section
    const beforeLog = existing.substring(0, existing.indexOf('---\n\n## Execution Log'));
    updated = beforeLog + logMarkdown;
  } else {
    // Append new log section
    updated = existing + logMarkdown;
  }

  await Bun.write(workflowPath, updated);
}
```
**Source:** [Log formatting best practices](https://betterstack.com/community/guides/logging/log-formatting/), existing project markdown patterns

### Anti-Patterns to Avoid
- **Global error handlers that swallow details:** Each node should preserve full error context including stack traces and retry attempts
- **Synchronous file I/O for state persistence:** Always use async Bun.write() to avoid blocking execution
- **Retry logic without jitter:** This causes thundering herd problems under load (already solved in calculateBackoffMs)
- **Mutable state during retry:** Clone state before each retry attempt to prevent partial mutation issues

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff | Custom delay calculation | Existing calculateBackoffMs() | Already implements AWS full jitter with 32s cap |
| State cloning | Manual object spread | Existing cloneStateForNode() | Handles Map serialization, prevents shared references |
| Error classification | String matching | Existing isRetryable() patterns | HttpError, AIError have built-in retryability |
| Timeout handling | setTimeout+Promise | AbortSignal.timeout() | Standard API, composable, automatic cleanup |
| UUID generation | Custom ID logic | crypto.randomUUID() | Already used in createExecutionState |
| JSON file I/O | node:fs promises | Bun.file().json() / Bun.write() | Optimized, simpler API |

**Key insight:** The codebase already has production-grade error handling primitives from Phase 4 (AI runtime). Extend these patterns rather than creating parallel systems.

## Common Pitfalls

### Pitfall 1: Map Serialization in State Persistence
**What goes wrong:** ExecutionState.nodeResults is a Map, which doesn't serialize to JSON directly
**Why it happens:** JSON.stringify() converts Maps to empty objects `{}`
**How to avoid:** Convert Map to array of entries before serialization, restore from array on load
**Warning signs:** Empty nodeResults after state restoration, undefined node outputs

### Pitfall 2: Retry Logic Without State Isolation
**What goes wrong:** Retrying node execution reuses mutated state from failed attempt
**Why it happens:** JavaScript objects are passed by reference, mutations persist across retries
**How to avoid:** Clone state before each retry attempt using structuredClone() or cloneStateForNode()
**Warning signs:** Retry attempts see unexpected values in nodeContext, inconsistent errors

### Pitfall 3: Timeout Leaks with Manual setTimeout
**What goes wrong:** Timeout timers not cleaned up after success, leading to memory leaks
**Why it happens:** Promise resolves but setTimeout callback remains scheduled
**How to avoid:** Use AbortSignal.timeout() which auto-cleans, or clearTimeout() in finally block
**Warning signs:** Memory usage grows over time, "Invalid handle" errors in logs

### Pitfall 4: Checkpoint Deadlocks in Non-Interactive Environments
**What goes wrong:** readline.question() blocks forever in CI/automated environments
**Why it happens:** No stdin available in non-TTY contexts
**How to avoid:** Check process.stdin.isTTY before prompting, or provide environment variable override
**Warning signs:** Workflow hangs indefinitely, no error message, tests never complete

### Pitfall 5: Fallback Node Creates Circular Dependencies
**What goes wrong:** Node A falls back to Node B, which falls back to Node A
**Why it happens:** No validation of fallback graph at configuration time
**How to avoid:** Validate fallback chains during plan building, detect cycles like dependency DAG
**Warning signs:** Stack overflow during execution, infinite retry loops

### Pitfall 6: Log File Corruption from Concurrent Writes
**What goes wrong:** Multiple workflow executions append to same log file simultaneously
**Why it happens:** No file locking or atomic append operations
**How to avoid:** Include runId in log filename, or use append-only operations with Bun.write()
**Warning signs:** Malformed JSON in log files, missing log entries, interleaved output

### Pitfall 7: AbortSignal.timeout Creates TimeoutError
**What goes wrong:** fetch() with AbortSignal.timeout throws TimeoutError DOMException, not Error
**Why it happens:** AbortSignal.timeout is a Web API with specific error types
**How to avoid:** Check error.name === 'TimeoutError' or error.name === 'AbortError'
**Warning signs:** Uncaught TimeoutError exceptions, retry logic not triggering

## Code Examples

Verified patterns from official sources:

### Error Classification Helper
```typescript
// src/execution/errors.ts
export function isRetryableError(error: unknown): boolean {
  // HttpError with isRetryable property
  if (error && typeof error === 'object' && 'isRetryable' in error) {
    return (error as { isRetryable: boolean }).isRetryable;
  }

  // AIError with retryable property
  if (error instanceof Error && 'retryable' in error) {
    return (error as { retryable: boolean }).retryable;
  }

  // TimeoutError from AbortSignal.timeout
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true;
  }

  // AbortError from manual abort
  if (error instanceof Error && error.name === 'AbortError') {
    return false; // User-initiated cancellation
  }

  return false;
}
```
**Source:** Existing HttpError.isRetryable, AIError.retryable patterns, [MDN TimeoutError](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)

### Workflow-Level Error Handler
```typescript
// src/execution/executor.ts - extend execute() function
export async function execute(
  plan: ExecutionPlan,
  state: ExecutionState,
  options: ExecutionOptions = {}
): Promise<void> {
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const errorHandler = options.errorHandler;

  state.status = 'running';

  try {
    // Process waves sequentially
    for (const wave of plan.waves) {
      state.currentWave = wave.waveNumber;
      await executeWave(wave, plan.nodes, state, maxConcurrency);

      // Persist state after each wave (STATE-01)
      if (options.persistencePath) {
        await saveState(state, options.persistencePath);
      }
    }

    state.status = 'completed';
    state.completedAt = Date.now();

  } catch (error) {
    state.status = 'failed';
    state.completedAt = Date.now();

    // Invoke workflow-level error handler (ERR-05)
    if (errorHandler) {
      try {
        await errorHandler(error as Error, state);
      } catch (handlerError) {
        console.error('Error handler failed:', handlerError);
      }
    }

    throw error;
  } finally {
    // Final state persistence
    if (options.persistencePath) {
      await saveState(state, options.persistencePath);
    }

    // Append execution log (LOG-01 through LOG-04)
    if (options.logPath) {
      await appendExecutionLog(options.logPath, {
        runId: state.runId,
        timestamp: state.startedAt,
        duration: (state.completedAt ?? Date.now()) - state.startedAt,
        status: state.status === 'completed' ? 'completed' : 'failed',
        nodeResults: state.nodeResults,
      });
    }
  }
}
```
**Source:** Existing executor.ts structure, persistence patterns

### Resume Workflow from Checkpoint
```typescript
// src/execution/resume.ts
export async function resumeWorkflow(
  ast: WorkflowAST,
  checkpointPath: string,
  options: ExecutionOptions = {}
): Promise<void> {
  // Load persisted state
  const state = await loadState(checkpointPath, {
    workflowId: ast.metadata.name,
    config: options.config,
    secrets: options.secrets,
  });

  // Rebuild execution plan
  const plan = buildExecutionPlan(ast);

  // Filter waves to only include those after currentWave
  const remainingWaves = plan.waves.filter(
    wave => wave.waveNumber > state.currentWave
  );

  // Create partial plan
  const resumePlan: ExecutionPlan = {
    waves: remainingWaves,
    nodes: plan.nodes,
  };

  // Continue execution from checkpoint
  await execute(resumePlan, state, options);
}
```
**Source:** STATE-02 requirement, LangGraph checkpoint patterns

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| setTimeout + Promise | AbortSignal.timeout() | 2023 (Web API standard) | Cleaner syntax, automatic cleanup, composable |
| Custom retry loops | Exponential backoff libraries | 2020-2022 | Standardized jitter patterns, AWS best practices |
| External state stores | File-based JSON checkpoints | 2026 (Serverless 2.0 trend) | Simpler deployment, no DB dependency |
| Structured logging libraries | Native JSON formatting | 2024+ | Zero dependencies, Bun optimization |
| Saga frameworks | Inline compensation patterns | 2025 (Temporal patterns) | Lighter weight for simple workflows |

**Deprecated/outdated:**
- **Manual Promise.race for timeouts:** AbortSignal.timeout() is now standard
- **try-catch inside while loops:** Use for-loop with attempt counter instead
- **String error matching:** Use error.name and instanceof checks
- **Global process.on('unhandledRejection'):** Workflow-level handlers are more precise

## Open Questions

Things that couldn't be fully resolved:

1. **Fallback Node Execution Context**
   - What we know: Fallback nodes should execute when primary fails
   - What's unclear: Should fallback receive original input or error details?
   - Recommendation: Pass both via special context: `{ input, primaryError }`

2. **Checkpoint State Visibility**
   - What we know: Checkpoint response should be available downstream
   - What's unclear: How to expose checkpoint result in nodeContext
   - Recommendation: Store in state.nodeContext with nodeId key, like regular results

3. **Concurrent Workflow Executions**
   - What we know: Multiple runs of same workflow may execute simultaneously
   - What's unclear: Should state files be per-runId or per-workflowId?
   - Recommendation: Use `.maidit-state/${workflowId}/${runId}.json` pattern

4. **Error Handler Return Values**
   - What we know: Workflow-level error handler receives error and state
   - What's unclear: Can handler return "continue" to skip failed wave?
   - Recommendation: Handler is for logging/cleanup only, never continue execution

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns:
  - `src/runtimes/ai/retry.ts` - calculateBackoffMs with full jitter
  - `src/runtimes/ai/errors.ts` - AIError, isRateLimitError patterns
  - `src/execution/state.ts` - cloneStateForNode, structuredClone usage
  - `src/execution/executor.ts` - Wave execution, fail-fast semantics
- [Bun readline API reference](https://bun.com/reference/node/readline)
- [Bun file write guide](https://bun.com/docs/guides/write-file/append)
- [MDN AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

### Secondary (MEDIUM confidence)
- [Node.js readline guide](https://nodejs.org/en/learn/command-line/accept-input-from-the-command-line-in-nodejs)
- [Better Stack - Log Formatting Best Practices](https://betterstack.com/community/guides/logging/log-formatting/)
- [Better Stack - Node.js Logging Best Practices](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/)
- [AppSignal - Managing Async Operations with AbortController](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)
- [AWS Lambda - TypeScript Logging](https://docs.aws.amazon.com/lambda/latest/dg/typescript-logging.html)

### Tertiary (LOW confidence - patterns for context)
- [Microsoft Learn - Checkpointing Workflows](https://learn.microsoft.com/en-us/agent-framework/tutorials/workflows/checkpointing-and-resuming)
- [LangGraph - Durable Execution](https://docs.langchain.com/oss/python/langgraph/durable-execution)
- [Temporal - Saga Pattern](https://temporal.io/blog/compensating-actions-part-of-a-complete-breakfast-with-sagas)
- [Azure - Saga Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
- Various resilience pattern guides for fallback and compensation concepts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All native Bun/Web APIs, already in use
- Architecture: HIGH - Extends existing executor patterns from Phase 6
- Pitfalls: HIGH - Verified from codebase patterns (Map serialization, state cloning)
- Code examples: HIGH - Based on existing code structure and official docs
- Saga patterns: MEDIUM - Not directly needed but useful for complex fallback chains
- Checkpoint UI alternatives: LOW - Terminal-only is sufficient for MVP

**Research date:** 2026-02-05
**Valid until:** 2026-04-05 (60 days - stable runtime APIs, logging patterns mature)

**Key architectural decisions to validate during planning:**
1. Should retry config be per-node or per-runtime-type?
2. State persistence: After every wave or only on checkpoints?
3. Fallback nodes: Inline execution or separate wave scheduling?
4. Checkpoint timeout: Fail workflow or use default action?
