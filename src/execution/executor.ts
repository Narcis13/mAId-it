/**
 * Workflow Executor for FlowScript
 *
 * Executes workflow plans by processing waves with concurrency control.
 */

import type { NodeAST } from '../types/ast';
import type { ExecutionState, NodeResult } from './types';
import type { ExecutionPlan, ExecutionWave, ExecutionOptions } from '../scheduler/types';
import type { ParallelResult } from '../runtimes/control/parallel';
import type { ForeachResult } from '../runtimes/control/foreach';
import { Semaphore, DEFAULT_MAX_CONCURRENCY } from '../scheduler';
import { getRuntime, hasRuntime } from '../runtimes/registry';
import { cloneStateForNode } from './state';
import { evaluateTemplateInContext } from './index';

/**
 * Execute a workflow plan.
 *
 * Processes waves sequentially, running nodes within each wave
 * concurrently up to the configured maxConcurrency limit.
 *
 * @param plan Execution plan from buildExecutionPlan
 * @param state Initialized execution state
 * @param options Execution options (maxConcurrency, timeout)
 *
 * @example
 * ```typescript
 * const plan = buildExecutionPlan(ast);
 * const state = createExecutionState({ workflowId: ast.metadata.name });
 * await execute(plan, state, { maxConcurrency: 5 });
 * ```
 */
export async function execute(
  plan: ExecutionPlan,
  state: ExecutionState,
  options: ExecutionOptions = {}
): Promise<void> {
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  state.status = 'running';

  try {
    // Process waves sequentially
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
  maxConcurrency: number
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
      const result = await executeNode(node, nodes, state, maxConcurrency);
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

  // Fail-fast: throw first error encountered
  if (errors.length > 0) {
    throw errors[0];
  }
}

/**
 * Execute a single node.
 *
 * Resolves input from previous node, gets the runtime, and executes.
 * The nodes map is passed through for control flow handlers that need
 * to execute body nodes (parallel, foreach).
 *
 * Note: This function will be extended in 06-03 and 06-04 to detect
 * ParallelResult and ForeachResult and handle them specially.
 */
export async function executeNode(
  node: NodeAST,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
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
    const resolvedConfig = resolveNodeConfig(node.config ?? {}, nodeState);

    // Execute the runtime
    let output = await runtime!.execute({
      node,
      input,
      config: resolvedConfig,
      state: nodeState,
    });

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
 * Get the runtime type string from a node.
 * Maps node AST types to runtime registry keys.
 */
function getNodeRuntimeType(node: NodeAST): string {
  switch (node.type) {
    case 'source':
      return `source:${node.sourceType}`;
    case 'sink':
      return `sink:${node.sinkType}`;
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
 * Execute parallel branches concurrently.
 *
 * Each branch gets an isolated state clone.
 * Results from all branches are collected.
 *
 * Note: Branch nodes are executed via executeNode, which has access to the
 * nodes map for nested control flow. Branch nodes are regular nodes, not
 * control flow nodes themselves (unless explicitly nested), so there's no
 * recursion risk.
 */
async function handleParallelResult(
  result: ParallelResult,
  nodes: Map<string, NodeAST>,
  state: ExecutionState,
  maxConcurrency: number
): Promise<unknown[]> {
  const { branches, maxConcurrency: branchLimit } = result;

  // Use branch-specific limit if provided, otherwise global limit
  const concurrency = branchLimit ?? maxConcurrency;
  const semaphore = new Semaphore(concurrency);
  const branchResults: unknown[] = new Array(branches.length);
  const errors: Error[] = [];

  const branchExecutions = branches.map(async (branchNodes, branchIndex) => {
    await semaphore.acquire();
    try {
      // Deep clone state for branch isolation
      const branchState = cloneStateForBranch(state, branchIndex);

      // Execute all nodes in this branch sequentially
      let lastOutput: unknown = undefined;
      for (const node of branchNodes) {
        // Execute node with nodes map for potential nested control flow
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

      branchResults[branchIndex] = lastOutput;
    } catch (error) {
      errors.push(error as Error);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(branchExecutions);

  // Fail-fast: surface first error
  if (errors.length > 0) {
    throw errors[0];
  }

  return branchResults;
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
