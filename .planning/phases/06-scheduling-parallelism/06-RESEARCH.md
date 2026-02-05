# Phase 6: Scheduling & Parallelism - Research

**Researched:** 2026-02-05
**Domain:** DAG scheduling, wave-based parallel execution, concurrency control
**Confidence:** HIGH

## Summary

Phase 6 implements the scheduling and parallel execution layer for FlowScript. The core challenge is building a DAG (Directed Acyclic Graph) scheduler that computes execution waves from node dependencies, then executing each wave's nodes in parallel with configurable concurrency limits. This phase also adds the `<parallel>` block for explicit branch parallelism and enables `maxConcurrency` for `<foreach>` loops.

The established pattern for DAG execution is Kahn's algorithm for topological sorting, which naturally produces execution waves by collecting all nodes with in-degree 0 at each iteration. For concurrency limiting, the standard JavaScript/TypeScript approach uses a semaphore pattern (as seen in `p-limit`, `es-toolkit/Semaphore`, or custom implementations). The existing codebase already has `ExecutionState.currentWave` tracking, indicating wave-based execution was part of the original design.

The key architectural decision is where to build the scheduler: a new `src/scheduler/` module that analyzes the AST, builds a dependency graph, computes waves, and returns an execution plan. The executor then processes waves in order, running each wave's nodes concurrently up to the configured limit. The existing control flow runtimes already return metadata for executor-handled body execution, so this pattern extends naturally to parallel blocks.

**Primary recommendation:** Use Kahn's algorithm to compute execution waves, implement a simple semaphore for concurrency limiting (no external dependency needed), and extend the executor to process waves in parallel while respecting the concurrency limit.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None (built-in) | - | DAG building and wave computation | Simple enough to implement; avoids dependency for straightforward algorithm |
| None (built-in) | - | Semaphore/concurrency limiting | Pattern is simple; avoids `p-limit` dependency for single use case |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `toposort` | 2.0.x | Topological sort utility | Only if cycle detection proves complex (current validator already detects cycles) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom semaphore | `p-limit` | p-limit is well-tested but adds dependency for simple use case |
| Custom semaphore | `es-toolkit` | Full utility library is overkill for one function |
| Custom wave algorithm | `dagx` | dagx is Rust-focused, not JS/TS |
| Custom topological sort | `toposort` | Could use for simplicity, but validator already handles cycles |

**Installation:**
```bash
# No new dependencies required - patterns are simple enough to implement inline
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  scheduler/
    index.ts           # Main exports: buildExecutionPlan, computeWaves
    dag.ts             # DAG building from AST, dependency extraction
    waves.ts           # Wave computation using Kahn's algorithm
    types.ts           # ExecutionPlan, Wave, NodeDependency types
  execution/
    executor.ts        # New: actual executor that runs waves
    concurrency.ts     # Semaphore implementation for parallel limits
    parallel.ts        # Parallel block execution logic
```

### Pattern 1: DAG Building from Node Dependencies
**What:** Extract dependencies from AST nodes (input references) to build adjacency list
**When to use:** Before execution, during plan computation
**Example:**
```typescript
// Source: Custom implementation following established patterns
interface NodeDependency {
  nodeId: string;
  dependsOn: string[];  // Node IDs this node depends on
}

function buildDependencyGraph(nodes: NodeAST[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  // Initialize all nodes with empty dependency sets
  for (const node of nodes) {
    graph.set(node.id, new Set());
  }

  // Add dependencies from input references
  for (const node of nodes) {
    if (node.input) {
      graph.get(node.id)!.add(node.input);
    }
  }

  return graph;
}
```

### Pattern 2: Wave Computation with Kahn's Algorithm
**What:** Compute execution waves by iteratively finding nodes with no unmet dependencies
**When to use:** After building dependency graph, to determine parallel groups
**Example:**
```typescript
// Source: Based on Kahn's algorithm for topological sorting
// https://en.wikipedia.org/wiki/Topological_sorting
interface ExecutionWave {
  waveNumber: number;
  nodeIds: string[];
}

function computeWaves(
  nodes: NodeAST[],
  dependencies: Map<string, Set<string>>
): ExecutionWave[] {
  const waves: ExecutionWave[] = [];
  const remaining = new Set(nodes.map(n => n.id));
  const completed = new Set<string>();
  let waveNumber = 0;

  while (remaining.size > 0) {
    // Find all nodes with no unmet dependencies
    const ready: string[] = [];
    for (const nodeId of remaining) {
      const deps = dependencies.get(nodeId) ?? new Set();
      const unmet = [...deps].filter(d => !completed.has(d));
      if (unmet.length === 0) {
        ready.push(nodeId);
      }
    }

    if (ready.length === 0 && remaining.size > 0) {
      // Cycle detected (shouldn't happen - validator catches this)
      throw new Error('Cycle detected in dependency graph');
    }

    // All ready nodes form this wave
    waves.push({ waveNumber, nodeIds: ready });

    // Mark as completed and remove from remaining
    for (const nodeId of ready) {
      completed.add(nodeId);
      remaining.delete(nodeId);
    }

    waveNumber++;
  }

  return waves;
}
```

### Pattern 3: Semaphore for Concurrency Limiting
**What:** Limit concurrent async operations to a maximum count
**When to use:** When executing wave nodes in parallel with a concurrency cap
**Example:**
```typescript
// Source: Based on es-toolkit Semaphore pattern
// https://es-toolkit.dev/reference/promise/Semaphore.html
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    this.permits = capacity;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Wait for a permit
    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }
}
```

### Pattern 4: Wave Execution with Concurrency Limit
**What:** Execute all nodes in a wave concurrently, respecting max concurrency
**When to use:** Processing each wave in the execution plan
**Example:**
```typescript
// Source: Custom pattern combining Promise.all with semaphore
async function executeWave(
  wave: ExecutionWave,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<void> {
  const semaphore = new Semaphore(maxConcurrency);

  const executions = wave.nodeIds.map(async (nodeId) => {
    await semaphore.acquire();
    try {
      const node = nodes.get(nodeId)!;
      await executeNode(node, state);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(executions);
}
```

### Pattern 5: Parallel Block Execution
**What:** Execute multiple independent branches simultaneously
**When to use:** `<parallel>` node execution
**Example:**
```typescript
// Source: Based on n8n parallel workflow patterns
// https://n8n.io/workflows/2536-pattern-for-parallel-sub-workflow-execution
interface ParallelResult {
  branches: NodeAST[][];
  branchCount: number;
}

// Parallel runtime returns metadata like other control flow nodes
class ParallelRuntime implements NodeRuntime<{}, unknown, ParallelResult> {
  readonly type = 'control:parallel';

  async execute(params: ExecutionParams): Promise<ParallelResult> {
    const parallelNode = params.node as ParallelNode;

    return {
      branches: parallelNode.branches,
      branchCount: parallelNode.branches.length,
    };
  }
}

// Executor handles actual parallel execution
async function executeParallelBranches(
  branches: NodeAST[][],
  state: ExecutionState,
  maxConcurrency: number
): Promise<unknown[]> {
  const semaphore = new Semaphore(maxConcurrency);

  const branchExecutions = branches.map(async (branchNodes, index) => {
    await semaphore.acquire();
    try {
      // Each branch gets isolated node context
      const branchState = cloneStateForBranch(state, index);
      return await executeNodes(branchNodes, branchState);
    } finally {
      semaphore.release();
    }
  });

  return Promise.all(branchExecutions);
}
```

### Pattern 6: Foreach Parallel Iteration
**What:** Execute foreach body iterations in parallel up to maxConcurrency
**When to use:** When ForeachResult.maxConcurrency > 1
**Example:**
```typescript
// Source: Extends existing ForeachResult pattern from Phase 5
async function executeForeachParallel(
  result: ForeachResult,
  bodyNodes: NodeAST[],
  state: ExecutionState
): Promise<unknown[]> {
  const { collection, itemVar, indexVar, maxConcurrency } = result;
  const semaphore = new Semaphore(maxConcurrency);
  const results = new Array(collection.length);

  const iterations = collection.map(async (item, index) => {
    await semaphore.acquire();
    try {
      // Clone state for parallel iteration isolation
      const iterState = cloneStateForIteration(state, {
        [itemVar]: item,
        [indexVar]: index,
      });
      results[index] = await executeNodes(bodyNodes, iterState);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(iterations);
  return results;
}
```

### Anti-Patterns to Avoid
- **Sharing mutable state across parallel executions:** Each parallel branch/iteration needs isolated state
- **Unbounded parallelism:** Always enforce maxConcurrency to prevent resource exhaustion
- **Ignoring execution order within control flow:** Nodes inside control flow blocks must still execute sequentially unless explicitly parallelized
- **Modifying global state during parallel execution:** Use node-scoped context, merge results after completion
- **Promise.all without error handling:** One failed branch shouldn't silently cancel others without proper error collection

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cycle detection in DAG | Custom DFS cycle finder | Existing validator `cycles.ts` | Already implemented and tested |
| Node ID collection | Manual AST traversal | Existing `collectNodeIds` in validator | Already handles all node types including nested |
| Expression evaluation in parallel context | Custom evaluator | Existing `evaluateInContext` | Thread-safe, handles context hierarchy |
| Complex task scheduling | Full scheduler library | Simple wave computation + semaphore | Wave pattern is sufficient for this use case |

**Key insight:** The codebase already has cycle detection, node collection, and expression evaluation. The scheduler adds wave computation and concurrency control - both are simple enough to implement without external dependencies.

## Common Pitfalls

### Pitfall 1: Race Conditions in Shared State
**What goes wrong:** Parallel nodes write to the same state location, causing data corruption
**Why it happens:** ExecutionState.nodeResults is shared; parallel nodes recording results concurrently
**How to avoid:** Use atomic operations for nodeResults Map, or collect results and merge after wave completes
**Warning signs:** Intermittent missing node outputs, test flakiness
```typescript
// CORRECT: Collect results, merge atomically after wave
const results = await Promise.all(executions);
for (const [nodeId, result] of results) {
  recordNodeResult(state, nodeId, result);
}
```

### Pitfall 2: Context Pollution Between Parallel Branches
**What goes wrong:** Branch A's context changes affect Branch B's execution
**Why it happens:** Shallow clone of state.nodeContext shares nested objects
**How to avoid:** Deep clone or use immutable context patterns for parallel branches
**Warning signs:** Different results when changing execution order, parallel-only bugs
```typescript
// CORRECT: Deep clone for parallel isolation
function cloneStateForBranch(state: ExecutionState, branchIndex: number): ExecutionState {
  return {
    ...state,
    nodeContext: structuredClone(state.nodeContext),
    phaseContext: { ...state.phaseContext, $branch: branchIndex },
    // nodeResults can be shared - it's append-only
    nodeResults: state.nodeResults,
  };
}
```

### Pitfall 3: Semaphore Permit Leaks
**What goes wrong:** Permits not released on error, causing eventual deadlock
**Why it happens:** Missing try/finally around acquired permit
**How to avoid:** Always use try/finally pattern for semaphore
**Warning signs:** Parallel execution slows over time, eventually hangs
```typescript
// CORRECT: Always release in finally
await semaphore.acquire();
try {
  await executeNode(node, state);
} finally {
  semaphore.release();  // Always runs, even on error
}
```

### Pitfall 4: Incorrect Dependency Extraction for Nested Nodes
**What goes wrong:** Nodes inside control flow blocks aren't properly scheduled
**Why it happens:** Only top-level node dependencies considered
**How to avoid:** Control flow blocks execute their bodies sequentially; only top-level nodes participate in wave scheduling
**Warning signs:** Nested nodes execute out of order
```typescript
// CORRECT: Only top-level nodes in wave computation
// Control flow nodes (loop, if, branch, parallel) handle their own body execution
const topLevelNodes = ast.nodes;  // Not recursively flattened
const waves = computeWaves(topLevelNodes, buildDependencyGraph(topLevelNodes));
```

### Pitfall 5: Foreach Break Not Working in Parallel Mode
**What goes wrong:** BreakSignal doesn't stop other parallel iterations
**Why it happens:** Each iteration runs independently, Break only affects its own execution
**How to avoid:** Document that Break in parallel foreach only breaks its iteration; use sequential mode for break-all semantics
**Warning signs:** Iterations continue after break
```typescript
// Document limitation clearly in ForeachResult type
/**
 * Note: When maxConcurrency > 1, Break only stops the current iteration,
 * not other parallel iterations. For break-all semantics, use maxConcurrency: 1.
 */
```

### Pitfall 6: Result Order Scrambled in Parallel Foreach
**What goes wrong:** Results array doesn't match collection order
**Why it happens:** Push to results array in completion order, not index order
**How to avoid:** Pre-allocate results array, assign by index
**Warning signs:** Results mismatch when some iterations are faster
```typescript
// CORRECT: Assign by index, not push
const results = new Array(collection.length);
await Promise.all(collection.map(async (item, index) => {
  // ...
  results[index] = result;  // Assign by index
}));
```

## Code Examples

Verified patterns aligned with existing codebase:

### Execution Plan Types
```typescript
// Source: New types for scheduler module
import type { NodeAST, WorkflowAST } from '../types/ast';

/**
 * A wave of nodes that can execute in parallel.
 */
export interface ExecutionWave {
  /** Wave number (0-indexed, execution order) */
  waveNumber: number;
  /** Node IDs in this wave (can all run in parallel) */
  nodeIds: string[];
}

/**
 * Complete execution plan for a workflow.
 */
export interface ExecutionPlan {
  /** Workflow ID being executed */
  workflowId: string;
  /** Total number of nodes */
  totalNodes: number;
  /** Execution waves in order */
  waves: ExecutionWave[];
  /** Node lookup map for quick access */
  nodes: Map<string, NodeAST>;
}

/**
 * Options for execution.
 */
export interface ExecutionOptions {
  /** Maximum concurrent node executions per wave (default: 10) */
  maxConcurrency?: number;
  /** Global timeout in milliseconds (default: none) */
  timeout?: number;
}
```

### Scheduler Module Implementation
```typescript
// Source: New scheduler implementation
import type { WorkflowAST, NodeAST } from '../types/ast';
import type { ExecutionPlan, ExecutionWave } from './types';

/**
 * Build an execution plan from a workflow AST.
 */
export function buildExecutionPlan(ast: WorkflowAST): ExecutionPlan {
  const nodes = new Map<string, NodeAST>();
  const deps = new Map<string, Set<string>>();

  // Collect top-level nodes and their dependencies
  for (const node of ast.nodes) {
    nodes.set(node.id, node);
    deps.set(node.id, new Set(node.input ? [node.input] : []));
  }

  // Compute waves using Kahn's algorithm
  const waves = computeWaves(ast.nodes, deps);

  return {
    workflowId: ast.metadata.name,
    totalNodes: nodes.size,
    waves,
    nodes,
  };
}

/**
 * Compute execution waves from dependency graph.
 * Uses Kahn's algorithm - nodes with no unmet dependencies at each iteration form a wave.
 */
function computeWaves(
  nodes: NodeAST[],
  dependencies: Map<string, Set<string>>
): ExecutionWave[] {
  const waves: ExecutionWave[] = [];
  const remaining = new Set(nodes.map(n => n.id));
  const completed = new Set<string>();
  let waveNumber = 0;

  while (remaining.size > 0) {
    const ready: string[] = [];

    for (const nodeId of remaining) {
      const deps = dependencies.get(nodeId) ?? new Set();
      const unmetDeps = [...deps].filter(d => !completed.has(d));

      if (unmetDeps.length === 0) {
        ready.push(nodeId);
      }
    }

    // Should never happen if validator caught cycles
    if (ready.length === 0) {
      const remainingIds = [...remaining].join(', ');
      throw new Error(`Cycle detected: ${remainingIds}`);
    }

    waves.push({ waveNumber, nodeIds: ready });

    for (const nodeId of ready) {
      completed.add(nodeId);
      remaining.delete(nodeId);
    }

    waveNumber++;
  }

  return waves;
}
```

### Concurrency Semaphore Implementation
```typescript
// Source: Based on es-toolkit Semaphore pattern
/**
 * Semaphore for limiting concurrent async operations.
 */
export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('Semaphore capacity must be at least 1');
    }
    this.permits = capacity;
  }

  /**
   * Acquire a permit. Blocks if none available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a permit, allowing next waiting task to proceed.
   */
  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      // Give permit directly to next waiter
      next();
    } else {
      // Return permit to pool
      this.permits++;
    }
  }

  /**
   * Number of available permits.
   */
  get available(): number {
    return this.permits;
  }

  /**
   * Number of tasks waiting for permits.
   */
  get waiting(): number {
    return this.waitQueue.length;
  }
}
```

### Parallel Runtime Implementation
```typescript
// Source: Extends control flow runtime pattern from Phase 5
import type { NodeRuntime, ExecutionParams } from '../types';
import type { ParallelNode } from '../../types/ast';

/**
 * Result returned by parallel runtime with branch metadata.
 */
export interface ParallelResult {
  /** Branches to execute in parallel */
  branches: NodeAST[][];
  /** Number of branches */
  branchCount: number;
}

/**
 * Parallel Runtime - returns branch metadata for executor to handle.
 *
 * @example
 * ```xml
 * <parallel id="fetch-all">
 *   <branch>
 *     <source:http id="api1" url="https://api1.example.com" />
 *   </branch>
 *   <branch>
 *     <source:http id="api2" url="https://api2.example.com" />
 *   </branch>
 * </parallel>
 * ```
 */
class ParallelRuntime implements NodeRuntime<{}, unknown, ParallelResult> {
  readonly type = 'control:parallel';

  async execute(params: ExecutionParams): Promise<ParallelResult> {
    const parallelNode = params.node as unknown as ParallelNode;

    return {
      branches: parallelNode.branches,
      branchCount: parallelNode.branches.length,
    };
  }
}

export const parallelRuntime = new ParallelRuntime();
```

### Executor Wave Processing
```typescript
// Source: New executor implementation
import type { ExecutionPlan, ExecutionWave, ExecutionOptions } from './types';
import type { ExecutionState, NodeResult } from '../execution/types';
import { Semaphore } from './concurrency';

const DEFAULT_MAX_CONCURRENCY = 10;

/**
 * Execute a workflow plan.
 */
export async function execute(
  plan: ExecutionPlan,
  state: ExecutionState,
  options: ExecutionOptions = {}
): Promise<void> {
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  state.status = 'running';

  try {
    for (const wave of plan.waves) {
      state.currentWave = wave.waveNumber;
      await executeWave(wave, plan.nodes, state, maxConcurrency);
    }

    state.status = 'completed';
    state.completedAt = Date.now();
  } catch (error) {
    state.status = 'failed';
    state.completedAt = Date.now();
    throw error;
  }
}

/**
 * Execute a single wave with concurrency limiting.
 */
async function executeWave(
  wave: ExecutionWave,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<void> {
  const semaphore = new Semaphore(maxConcurrency);
  const errors: Error[] = [];

  const executions = wave.nodeIds.map(async (nodeId) => {
    await semaphore.acquire();
    try {
      const node = nodes.get(nodeId)!;
      const result = await executeNode(node, state);
      recordNodeResult(state, nodeId, result);
    } catch (error) {
      errors.push(error as Error);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(executions);

  // If any node failed, throw first error
  if (errors.length > 0) {
    throw errors[0];
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential execution | Wave-based parallel | Stable | Standard for DAG execution |
| Callback-based async | Promise/async-await | ES2017+ | Cleaner concurrency code |
| External scheduler libs | Built-in Kahn's algorithm | Stable | Simple, no dependencies |
| Unbounded parallelism | Semaphore-based limiting | Stable | Resource protection |

**Deprecated/outdated:**
- **Callback hell for async:** Use async/await
- **External process pools:** Node.js worker threads or single-process with semaphore sufficient for I/O bound workflows
- **Complex DAG libraries:** For simple wave-based execution, Kahn's algorithm is sufficient

## Open Questions

Things that couldn't be fully resolved:

1. **Error Handling Strategy for Parallel Failures**
   - What we know: When one parallel branch fails, others may still be running
   - What's unclear: Should we cancel running branches, wait for all, or fail fast?
   - Recommendation: For Phase 6, use fail-fast (first error stops execution). Phase 7 adds configurable error handling with retry/fallback.

2. **State Merging from Parallel Branches**
   - What we know: Each branch produces outputs; main execution needs access
   - What's unclear: If two branches write to same node ID scope (unlikely but possible)
   - Recommendation: Each branch's nodes write to shared nodeResults by node ID (natural isolation). Document that node IDs must be unique across branches.

3. **Nested Control Flow in Parallel**
   - What we know: `<parallel>` contains `<branch>` elements which can contain any nodes
   - What's unclear: Can branches contain their own `<parallel>` blocks?
   - Recommendation: Support nested parallel blocks; semaphore naturally limits total concurrency. Document that deeply nested parallelism can hit concurrency limits.

4. **Dynamic Concurrency Based on Node Type**
   - What we know: AI nodes might want lower concurrency than HTTP nodes
   - What's unclear: Should concurrency be configurable per-node or per-type?
   - Recommendation: Start with global maxConcurrency for simplicity. Per-node concurrency can be added later if needed.

## Sources

### Primary (HIGH confidence)
- [Wikipedia: Topological sorting](https://en.wikipedia.org/wiki/Topological_sorting) - Kahn's algorithm definition
- [es-toolkit Semaphore](https://es-toolkit.dev/reference/promise/Semaphore.html) - Semaphore pattern implementation
- [p-limit GitHub](https://github.com/sindresorhus/p-limit) - Concurrency limiting patterns
- [toposort GitHub](https://github.com/marcelklehr/toposort) - JavaScript topological sort implementation
- Existing codebase: `src/execution/types.ts` (ExecutionState.currentWave indicates wave-based design)
- Existing codebase: `src/validator/cycles.ts` (cycle detection already implemented)

### Secondary (MEDIUM confidence)
- [n8n Parallel Workflows](https://n8n.io/workflows/2536-pattern-for-parallel-sub-workflow-execution-followed-by-wait-for-all-loop/) - Fan-out/fan-in pattern
- [dagx GitHub](https://github.com/swaits/dagx) - Type-safe DAG executor patterns (Rust, concepts applicable)
- [Unipipe Executor](https://mohitkarekar.com/posts/2021/unipipe-executor/) - DAG execution with topological sorting

### Tertiary (LOW confidence)
- WebSearch results for DAG parallel execution pitfalls - general patterns verified against multiple sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Patterns well-established, no external dependencies needed
- Architecture: HIGH - Extends existing codebase patterns (control flow runtimes, execution state)
- Pitfalls: MEDIUM - Based on general parallel programming patterns, some codebase-specific
- Code examples: HIGH - Aligned with existing codebase types and patterns

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable domain, algorithms are well-established)
