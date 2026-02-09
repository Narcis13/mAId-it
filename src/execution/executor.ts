/**
 * Workflow Executor for FlowScript
 *
 * Executes workflow plans by processing waves with concurrency control.
 */

import type { NodeAST } from '../types/ast';
import type { ExecutionState, NodeResult, RetryConfig } from './types';
import type { ExecutionPlan, ExecutionWave, ExecutionOptions } from '../scheduler/types';
import type { ParallelResult } from '../runtimes/control/parallel';
import type { ForeachResult } from '../runtimes/control/foreach';
import type { LoopResult } from '../runtimes/control/loop';
import type { TimeoutResult } from '../runtimes/temporal/timeout';
import { TimeoutError } from '../runtimes/errors';
import { Semaphore, DEFAULT_MAX_CONCURRENCY } from '../scheduler';
import { getRuntime, hasRuntime } from '../runtimes/registry';
import { cloneStateForNode } from './state';
import { evaluateInContext, evaluateTemplateInContext } from './index';
import { executeWithRetry } from './retry';
import { saveState } from './persistence';
import { appendExecutionLog } from './logging';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get retry configuration for a node.
 * Looks for retry config in node.config, falls back to execution options default.
 *
 * Note: Only data flow nodes (source, transform, sink) have config.
 * Control flow nodes don't have config and will use default.
 */
function getNodeRetryConfig(
  node: NodeAST,
  defaultConfig?: RetryConfig
): RetryConfig | undefined {
  // Only source, transform, and sink nodes have config
  if ('config' in node) {
    const nodeConfig = node.config as Record<string, unknown>;
    if (nodeConfig?.retry) {
      return nodeConfig.retry as RetryConfig;
    }
  }
  return defaultConfig;
}

/**
 * Execute a workflow plan.
 *
 * Processes waves sequentially, running nodes within each wave
 * concurrently up to the configured maxConcurrency limit.
 *
 * Production features:
 * - State persistence after each wave when persistencePath provided
 * - Workflow-level error handler for unhandled failures
 * - Default retry config for all nodes
 *
 * @param plan Execution plan from buildExecutionPlan
 * @param state Initialized execution state
 * @param options Execution options (maxConcurrency, timeout, persistence, error handler)
 *
 * @example
 * ```typescript
 * const plan = buildExecutionPlan(ast);
 * const state = createExecutionState({ workflowId: ast.metadata.name });
 * await execute(plan, state, {
 *   maxConcurrency: 5,
 *   persistencePath: '.maidit-state/my-workflow/run-1.json',
 *   errorHandler: (error, state) => console.error('Workflow failed:', error),
 * });
 * ```
 */
export async function execute(
  plan: ExecutionPlan,
  state: ExecutionState,
  options: ExecutionOptions = {}
): Promise<void> {
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const { persistencePath, errorHandler, defaultRetryConfig, logPath, timeout } = options;

  // Create global abort controller for timeout (item 4.4)
  let globalAbort: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout && timeout > 0) {
    globalAbort = new AbortController();
    timeoutId = setTimeout(() => {
      globalAbort!.abort();
    }, timeout);
  }

  state.status = 'running';

  try {
    // Process waves sequentially
    for (const wave of plan.waves) {
      // Check global abort before each wave
      if (globalAbort?.signal.aborted) {
        throw new TimeoutError(
          `Workflow timed out after ${timeout}ms`,
          timeout!
        );
      }

      state.currentWave = wave.waveNumber;
      await executeWave(wave, plan.nodes, state, maxConcurrency, defaultRetryConfig, globalAbort?.signal);

      // Persist state after each wave completes
      if (persistencePath) {
        await saveState(state, persistencePath);
      }
    }

    state.status = 'completed';
    state.completedAt = Date.now();

    // Persist final successful state
    if (persistencePath) {
      await saveState(state, persistencePath);
    }
  } catch (error) {
    state.status = 'failed';
    state.completedAt = Date.now();

    // Persist final failed state
    if (persistencePath) {
      await saveState(state, persistencePath);
    }

    // Invoke workflow-level error handler
    if (errorHandler) {
      try {
        await errorHandler(error as Error, state);
      } catch (handlerError) {
        // Log but don't mask original error
        console.error('Error handler failed:', handlerError);
      }
    }

    throw error;
  } finally {
    // Clear global timeout timer
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Append execution log if logPath provided
    // Logs regardless of success/failure - both are valuable audit info
    if (logPath) {
      try {
        await appendExecutionLog(logPath, state);
      } catch (logError) {
        // Log but don't mask execution result
        console.error('Failed to append execution log:', logError);
      }
    }
  }
}

/**
 * Execute a single wave with concurrency limiting.
 *
 * All nodes in the wave start execution, but only maxConcurrency
 * will actually run at once (others wait for semaphore).
 *
 * Uses fail-fast: first error stops the wave and throws.
 */
async function executeWave(
  wave: ExecutionWave,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number,
  defaultRetryConfig?: RetryConfig,
  signal?: AbortSignal
): Promise<void> {
  const semaphore = new Semaphore(maxConcurrency);
  const errors: Error[] = [];

  const executions = wave.nodeIds.map(async (nodeId) => {
    await semaphore.acquire();
    try {
      const node = nodes.get(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Execute the node and record result
      // Note: nodes map passed for control flow handlers (parallel/foreach)
      const result = await executeNode(node, nodes, state, maxConcurrency, defaultRetryConfig, signal);
      recordNodeResult(state, nodeId, result);

      // Check if the node execution failed
      if (result.status === 'failed') {
        throw result.error ?? new Error(`Node ${nodeId} failed`);
      }
    } catch (error) {
      errors.push(error as Error);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(executions);

  // Surface all errors from the wave
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, `${errors.length} nodes failed in wave`);
  }
}

/**
 * Execute a single node.
 *
 * Resolves input from previous node, gets the runtime, and executes.
 * The nodes map is passed through for control flow handlers that need
 * to execute body nodes (parallel, foreach).
 *
 * When retry config is present (from node config or defaults), wraps
 * execution in retry logic with exponential backoff.
 */
export async function executeNode(
  node: NodeAST,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number,
  defaultRetryConfig?: RetryConfig,
  signal?: AbortSignal
): Promise<NodeResult> {
  const startedAt = Date.now();

  try {
    // Resolve input from previous node if specified
    let input: unknown = undefined;
    if (node.input) {
      const prevResult = state.nodeResults.get(node.input);
      if (prevResult?.status === 'success') {
        input = prevResult.output;
      }
    }

    // Get runtime type from node
    const runtimeType = getNodeRuntimeType(node);

    // Check if runtime exists
    if (!hasRuntime(runtimeType)) {
      throw new Error(`Unknown runtime type: ${runtimeType}`);
    }

    // Get runtime and execute
    const runtime = getRuntime(runtimeType);

    // Clone state for isolation during parallel execution
    // NOTE: Must clone BEFORE resolving config so 'input' is available in templates
    const nodeState = cloneStateForNode(state, { input });

    // Resolve config values (templates, expressions) with the node state
    // Only source, transform, and sink nodes have config
    const rawConfig = 'config' in node ? (node.config as Record<string, unknown>) : {};
    const resolvedConfig = resolveNodeConfig(rawConfig, nodeState);

    // Check for retry config (node-specific or default)
    const retryConfig = getNodeRetryConfig(node, defaultRetryConfig);

    // Execute the runtime (with retry wrapper if config present)
    let output: unknown;

    if (retryConfig) {
      // Extract fallback node ID for potential fallback execution
      const fallbackNodeId = retryConfig.fallbackNodeId;

      try {
        output = await executeWithRetry(
          async (_signal) => {
            // Note: signal available for timeout, but runtime.execute doesn't yet use it
            return await runtime!.execute({
              node,
              input,
              config: resolvedConfig,
              state: nodeState,
              signal,
            });
          },
          retryConfig
        );
      } catch (primaryError) {
        // All retries exhausted - try fallback if specified
        if (fallbackNodeId) {
          output = await executeFallbackNode(
            fallbackNodeId,
            nodes,
            state,
            input,
            primaryError as Error,
            maxConcurrency,
            defaultRetryConfig
          );
        } else {
          throw primaryError;
        }
      }
    } else {
      // No retry config - execute directly
      output = await runtime!.execute({
        node,
        input,
        config: resolvedConfig,
        state: nodeState,
        signal,
      });
    }

    // Check if this is a parallel result that needs branch execution
    if (isParallelResult(output)) {
      const branchOutputs = await handleParallelResult(
        output,
        nodes,
        state,
        maxConcurrency
      );
      output = branchOutputs;
    }

    // Check if this is a foreach result that needs iteration execution
    if (isForeachResult(output)) {
      const foreachOutputs = await handleForeachResult(
        output,
        nodes,
        state,
        maxConcurrency
      );
      output = foreachOutputs;
    }

    // Check if this is a loop result that needs iterative execution
    if (isLoopResult(output)) {
      const loopOutput = await handleLoopResult(
        output,
        nodes,
        state,
        maxConcurrency,
        defaultRetryConfig
      );
      output = loopOutput;
    }

    // Check if this is a timeout result that needs wrapped execution
    if (isTimeoutResult(output)) {
      const timeoutOutput = await handleTimeoutResult(
        output,
        nodes,
        state,
        maxConcurrency,
        defaultRetryConfig,
        signal
      );
      output = timeoutOutput;
    }

    const completedAt = Date.now();

    return {
      status: 'success',
      output,
      duration: completedAt - startedAt,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const completedAt = Date.now();

    return {
      status: 'failed',
      error: error as Error,
      duration: completedAt - startedAt,
      startedAt,
      completedAt,
    };
  }
}

/**
 * Execute a fallback node when primary fails.
 * Passes original input and primary error to fallback context.
 */
async function executeFallbackNode(
  fallbackNodeId: string,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  originalInput: unknown,
  primaryError: Error,
  maxConcurrency: number,
  defaultRetryConfig?: RetryConfig
): Promise<unknown> {
  const fallbackNode = nodes.get(fallbackNodeId);
  if (!fallbackNode) {
    throw new Error(`Fallback node not found: ${fallbackNodeId}`);
  }

  // Clone state to avoid mutating shared nodeContext during parallel execution
  const fallbackState: ExecutionState = {
    ...state,
    nodeContext: {
      ...state.nodeContext,
      $primaryError: primaryError.message,
      $primaryInput: originalInput,
    },
  };

  // Execute fallback node (without retry to avoid infinite loops)
  const result = await executeNode(
    fallbackNode,
    nodes,
    fallbackState,
    maxConcurrency,
    undefined
  );

  if (result.status === 'failed') {
    throw result.error ?? new Error(`Fallback node ${fallbackNodeId} failed`);
  }

  return result.output;
}

/**
 * Get the runtime type string from a node.
 * Maps node AST types to runtime registry keys.
 */
function getNodeRuntimeType(node: NodeAST): string {
  switch (node.type) {
    case 'source':
      return `${node.sourceType}:source`;
    case 'sink':
      return `${node.sinkType}:sink`;
    case 'transform':
      return `transform:${node.transformType}`;
    case 'branch':
    case 'if':
    case 'loop':
    case 'while':
    case 'foreach':
    case 'parallel':
      return `control:${node.type}`;
    case 'checkpoint':
      return 'checkpoint';
    case 'delay':
      return 'temporal:delay';
    case 'timeout':
      return 'temporal:timeout';
    case 'include':
      return 'composition:include';
    case 'call':
      return 'composition:call';
    default:
      return node.type;
  }
}

/**
 * Resolve template expressions in node config.
 * Uses evaluateTemplateInContext from execution/index.ts.
 */
function resolveNodeConfig(
  config: Record<string, unknown>,
  state: ExecutionState
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      resolved[key] = evaluateTemplateInContext(value, state);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      resolved[key] = resolveNodeConfig(value as Record<string, unknown>, state);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Record a node result in execution state.
 */
function recordNodeResult(
  state: ExecutionState,
  nodeId: string,
  result: NodeResult
): void {
  state.nodeResults.set(nodeId, result);

  // Also expose output in nodeContext for expression access
  if (result.status === 'success' && result.output !== undefined) {
    state.nodeContext[nodeId] = { output: result.output };
  }
}

// ============================================================================
// Parallel Execution Handling
// ============================================================================

/**
 * Check if a node result output is a ParallelResult.
 */
function isParallelResult(output: unknown): output is ParallelResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    'branches' in output &&
    Array.isArray((output as ParallelResult).branches) &&
    'branchCount' in output
  );
}

/**
 * Parse wait strategy string: 'all', 'any', or 'n(N)'.
 * Returns { type, count } where count is only set for 'n' strategy.
 */
function parseWaitStrategy(wait?: string): { type: 'all' | 'any' | 'n'; count?: number } {
  if (!wait || wait === 'all') return { type: 'all' };
  if (wait === 'any') return { type: 'any' };
  const match = wait.match(/^n\((\d+)\)$/);
  if (match) return { type: 'n', count: parseInt(match[1], 10) };
  return { type: 'all' };
}

/**
 * Apply merge strategy to branch results.
 */
function applyMergeStrategy(
  branchResults: unknown[],
  merge?: string,
  state?: ExecutionState
): unknown {
  if (!merge || merge === 'array') return branchResults;

  if (merge === 'concat') {
    // Flatten arrays from each branch
    const flattened: unknown[] = [];
    for (const result of branchResults) {
      if (Array.isArray(result)) {
        flattened.push(...result);
      } else if (result !== undefined) {
        flattened.push(result);
      }
    }
    return flattened;
  }

  if (merge === 'object') {
    // Merge as keyed object — expects each branch to return an object
    const merged: Record<string, unknown> = {};
    for (const result of branchResults) {
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        Object.assign(merged, result);
      }
    }
    return merged;
  }

  // Custom merge expression: evaluate with $branches in context
  if (state) {
    try {
      const mergeState: ExecutionState = {
        ...state,
        nodeContext: {
          ...state.nodeContext,
          $branches: branchResults,
        },
      };
      return evaluateInContext(merge, mergeState);
    } catch {
      // Fallback to array on evaluation failure
      return branchResults;
    }
  }

  return branchResults;
}

/**
 * Execute a single parallel branch and return its result.
 */
async function executeBranch(
  branchNodes: NodeAST[],
  branchIndex: number,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<unknown> {
  const branchState = cloneStateForBranch(state, branchIndex);

  let lastOutput: unknown = undefined;
  for (const node of branchNodes) {
    const nodeResult = await executeNode(node, nodes, branchState, maxConcurrency);
    recordNodeResult(branchState, node.id, nodeResult);

    if (nodeResult.status === 'failed') {
      throw nodeResult.error ?? new Error(`Node ${node.id} failed`);
    }

    lastOutput = nodeResult.output;

    // Copy results back to main state
    state.nodeResults.set(node.id, nodeResult);
    if (nodeResult.output !== undefined) {
      state.nodeContext[node.id] = { output: nodeResult.output };
    }
  }

  return lastOutput;
}

/**
 * Execute parallel branches with configurable wait and merge strategies.
 *
 * Wait strategies:
 * - 'all' (default): Wait for all branches (Promise.all)
 * - 'any': Return first resolved branch (Promise.any)
 * - 'n(N)': Return first N resolved branches
 *
 * Merge strategies:
 * - 'array' (default): Return array of branch outputs
 * - 'concat': Flatten arrays from each branch
 * - 'object': Merge branch outputs as keyed objects
 * - expression: Evaluate with $branches in context
 */
async function handleParallelResult(
  result: ParallelResult,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<unknown> {
  const { branches, maxConcurrency: branchLimit, wait, merge } = result;
  const waitStrategy = parseWaitStrategy(wait);

  // Use branch-specific limit if provided, otherwise global limit
  const concurrency = branchLimit ?? maxConcurrency;
  const semaphore = new Semaphore(concurrency);

  // Wrap each branch in a semaphore-gated execution
  const branchPromises = branches.map(async (branchNodes, branchIndex) => {
    await semaphore.acquire();
    try {
      return await executeBranch(branchNodes, branchIndex, nodes, state, maxConcurrency);
    } finally {
      semaphore.release();
    }
  });

  let branchResults: unknown[];

  if (waitStrategy.type === 'any') {
    // Promise.any — first successful branch wins
    const first = await Promise.any(branchPromises);
    branchResults = [first];
  } else if (waitStrategy.type === 'n' && waitStrategy.count !== undefined) {
    // First N to resolve
    const count = Math.min(waitStrategy.count, branches.length);
    branchResults = await firstN(branchPromises, count);
  } else {
    // Default: wait for all
    branchResults = await Promise.all(branchPromises);
  }

  return applyMergeStrategy(branchResults, merge, state);
}

/**
 * Resolve the first N promises from a set.
 * Returns results in completion order.
 */
function firstN<T>(promises: Promise<T>[], n: number): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    let settled = false;
    let errorCount = 0;

    for (const p of promises) {
      p.then((value) => {
        if (settled) return;
        results.push(value);
        if (results.length >= n) {
          settled = true;
          resolve(results);
        }
      }).catch((error) => {
        if (settled) return;
        errorCount++;
        // If too many errors to reach N, reject
        if (errorCount > promises.length - n) {
          settled = true;
          reject(error);
        }
      });
    }
  });
}

/**
 * Clone state for parallel branch execution.
 */
function cloneStateForBranch(
  state: ExecutionState,
  branchIndex: number
): ExecutionState {
  return {
    ...state,
    nodeContext: {
      ...structuredClone(state.nodeContext),
      $branch: branchIndex,
    },
    phaseContext: { ...state.phaseContext },
    globalContext: { ...state.globalContext },
    nodeResults: state.nodeResults, // Shared - writes isolated by nodeId
    config: state.config,
    secrets: state.secrets,
  };
}

// ============================================================================
// Foreach Execution Handling
// ============================================================================

/**
 * Check if a node result output is a ForeachResult.
 */
function isForeachResult(output: unknown): output is ForeachResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    'collection' in output &&
    Array.isArray((output as ForeachResult).collection) &&
    'itemVar' in output &&
    'bodyNodeIds' in output
  );
}

/**
 * Execute foreach iterations, potentially in parallel.
 *
 * When maxConcurrency is 1 (default), executes sequentially.
 * When maxConcurrency > 1, executes iterations in parallel up to the limit.
 *
 * Results maintain index order regardless of completion order.
 *
 * Note: Break in parallel mode only stops its own iteration,
 * not other parallel iterations. Use maxConcurrency: 1 for break-all.
 *
 * Implementation note: ForeachResult.bodyNodeIds contains string IDs.
 * We look up the actual NodeAST from the nodes map. Body nodes are
 * regular nodes (not control flow) so they won't return ForeachResult,
 * avoiding recursion concerns.
 */
async function handleForeachResult(
  result: ForeachResult,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<unknown[]> {
  const { collection, itemVar, indexVar, maxConcurrency: iterLimit, bodyNodeIds } = result;

  // Look up body nodes from IDs
  const bodyNodes: NodeAST[] = [];
  for (const id of bodyNodeIds) {
    const node = nodes.get(id);
    if (node) {
      bodyNodes.push(node);
    }
  }

  // Results array maintains index order
  const results: unknown[] = new Array(collection.length);
  const errors: Error[] = [];

  if (iterLimit === 1) {
    // Sequential execution (original behavior)
    for (let i = 0; i < collection.length; i++) {
      try {
        const iterState = cloneStateForIteration(state, {
          [itemVar]: collection[i],
          [indexVar]: i,
        });

        let lastOutput: unknown = undefined;
        for (const node of bodyNodes) {
          const nodeResult = await executeNode(node, nodes, iterState, maxConcurrency);
          recordNodeResult(iterState, node.id, nodeResult);

          if (nodeResult.status === 'failed') {
            throw nodeResult.error ?? new Error(`Node ${node.id} failed`);
          }

          lastOutput = nodeResult.output;
        }

        results[i] = lastOutput;
      } catch (error) {
        if (isBreakSignal(error)) {
          // Break stops sequential iteration
          break;
        }
        throw error;
      }
    }
  } else {
    // Parallel execution
    const semaphore = new Semaphore(iterLimit);

    const iterations = collection.map(async (item, index) => {
      await semaphore.acquire();
      try {
        const iterState = cloneStateForIteration(state, {
          [itemVar]: item,
          [indexVar]: index,
        });

        let lastOutput: unknown = undefined;
        for (const node of bodyNodes) {
          const nodeResult = await executeNode(node, nodes, iterState, maxConcurrency);
          recordNodeResult(iterState, node.id, nodeResult);

          if (nodeResult.status === 'failed') {
            throw nodeResult.error ?? new Error(`Node ${node.id} failed`);
          }

          lastOutput = nodeResult.output;
        }

        // Assign by index to maintain order
        results[index] = lastOutput;
      } catch (error) {
        if (isBreakSignal(error)) {
          // Break in parallel only stops this iteration
          // Other iterations continue
          return;
        }
        errors.push(error as Error);
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(iterations);

    // Fail-fast: surface first error
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  return results;
}

/**
 * Clone state for foreach iteration.
 */
function cloneStateForIteration(
  state: ExecutionState,
  iterationContext: Record<string, unknown>
): ExecutionState {
  return {
    ...state,
    nodeContext: {
      ...structuredClone(state.nodeContext),
      ...iterationContext,
    },
    phaseContext: { ...state.phaseContext },
    globalContext: { ...state.globalContext },
    nodeResults: state.nodeResults, // Shared
    config: state.config,
    secrets: state.secrets,
  };
}

/**
 * Check if error is a BreakSignal.
 */
function isBreakSignal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'BreakSignal'
  );
}

// ============================================================================
// Loop Execution Handling
// ============================================================================

/**
 * Check if a node result output is a LoopResult.
 */
function isLoopResult(output: unknown): output is LoopResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    'maxIterations' in output &&
    'bodyNodes' in output &&
    Array.isArray((output as LoopResult).bodyNodes)
  );
}

/**
 * Execute loop iterations sequentially.
 *
 * Runs body nodes up to maxIterations times. After each iteration,
 * evaluates the breakCondition against execution state. If it evaluates
 * to truthy, the loop exits early.
 *
 * The last output from the final iteration's last body node is returned.
 */
async function handleLoopResult(
  result: LoopResult,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number,
  defaultRetryConfig?: RetryConfig
): Promise<unknown> {
  const { maxIterations, breakCondition, bodyNodes } = result;

  let lastOutput: unknown = undefined;

  for (let i = 0; i < maxIterations; i++) {
    // Add iteration index to state context
    state.nodeContext.$iteration = i;

    try {
      for (const node of bodyNodes) {
        const nodeResult = await executeNode(node, nodes, state, maxConcurrency, defaultRetryConfig);
        recordNodeResult(state, node.id, nodeResult);

        if (nodeResult.status === 'failed') {
          throw nodeResult.error ?? new Error(`Node ${node.id} failed`);
        }

        lastOutput = nodeResult.output;
      }
    } catch (error) {
      if (isBreakSignal(error)) {
        break;
      }
      throw error;
    }

    // Evaluate break condition after each iteration
    if (breakCondition) {
      try {
        const shouldBreak = evaluateInContext(breakCondition, state);
        if (shouldBreak) {
          break;
        }
      } catch {
        // If break condition can't be evaluated, continue looping
      }
    }
  }

  return lastOutput;
}

// ============================================================================
// Timeout Execution Handling
// ============================================================================

/**
 * Check if a node result output is a TimeoutResult.
 */
function isTimeoutResult(output: unknown): output is TimeoutResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    'durationMs' in output &&
    'children' in output &&
    Array.isArray((output as TimeoutResult).children)
  );
}

/**
 * Execute children under a timeout constraint.
 *
 * Uses AbortController to cancel child execution if the timeout expires.
 * On timeout, routes to onTimeout fallback node or throws TimeoutError.
 */
async function handleTimeoutResult(
  result: TimeoutResult,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number,
  defaultRetryConfig?: RetryConfig,
  parentSignal?: AbortSignal
): Promise<unknown> {
  const { durationMs, children, onTimeout } = result;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), durationMs);

  // If parent signal is already aborted or aborts, propagate
  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    let lastOutput: unknown = undefined;

    for (const node of children) {
      if (controller.signal.aborted) {
        throw new TimeoutError(
          `Timeout exceeded: ${durationMs}ms`,
          durationMs
        );
      }

      const nodeResult = await executeNode(
        node,
        nodes,
        state,
        maxConcurrency,
        defaultRetryConfig,
        controller.signal
      );
      recordNodeResult(state, node.id, nodeResult);

      if (nodeResult.status === 'failed') {
        throw nodeResult.error ?? new Error(`Node ${node.id} failed`);
      }

      lastOutput = nodeResult.output;
    }

    return lastOutput;
  } catch (error) {
    // Check if this is a timeout (abort) error
    const isAbort =
      controller.signal.aborted &&
      (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'));

    if (isAbort || (error instanceof TimeoutError)) {
      // Route to fallback if specified
      if (onTimeout) {
        const fallbackNode = nodes.get(onTimeout);
        if (fallbackNode) {
          const fallbackResult = await executeNode(
            fallbackNode,
            nodes,
            state,
            maxConcurrency,
            undefined, // No retry for fallback
            parentSignal // Use parent signal, not the timed-out one
          );
          recordNodeResult(state, fallbackNode.id, fallbackResult);

          if (fallbackResult.status === 'failed') {
            throw fallbackResult.error ?? new Error(`Timeout fallback node ${onTimeout} failed`);
          }

          return fallbackResult.output;
        }
      }

      // No fallback — throw TimeoutError
      throw new TimeoutError(`Timeout exceeded: ${durationMs}ms`, durationMs);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
