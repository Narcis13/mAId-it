/**
 * Workflow Executor for FlowScript
 *
 * Executes workflow plans by processing waves with concurrency control.
 */

import type { NodeAST } from '../types/ast';
import type { ExecutionState, NodeResult } from './types';
import type { ExecutionPlan, ExecutionWave, ExecutionOptions } from '../scheduler/types';
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

    // Resolve config values (templates, expressions)
    const resolvedConfig = resolveNodeConfig(node.config ?? {}, state);

    // Clone state for isolation during parallel execution
    const nodeState = cloneStateForNode(state, { input });

    // Execute the runtime
    let output = await runtime!.execute({
      node,
      input,
      config: resolvedConfig,
      state: nodeState,
    });

    // NOTE: Plans 06-03 and 06-04 will add detection of ParallelResult
    // and ForeachResult here, calling handlers that use the nodes map.

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
