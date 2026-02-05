/**
 * Execution State Management for FlowScript
 *
 * Functions for creating and managing workflow execution state,
 * including node output tracking and context management.
 */

import type { ExecutionState, ExecutionStateOptions, NodeResult } from './types';

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create a new execution state.
 */
export function createExecutionState(options: ExecutionStateOptions): ExecutionState {
  return {
    workflowId: options.workflowId,
    runId: options.runId ?? crypto.randomUUID(),
    status: 'pending',
    currentWave: 0,
    startedAt: Date.now(),
    nodeResults: new Map(),
    globalContext: options.globalContext ?? {},
    phaseContext: {},
    nodeContext: {},
    config: options.config ?? {},
    secrets: options.secrets ?? {},
  };
}

// ============================================================================
// Node Result Management
// ============================================================================

/**
 * Record a node's execution result.
 */
export function recordNodeResult(
  state: ExecutionState,
  nodeId: string,
  result: NodeResult
): void {
  state.nodeResults.set(nodeId, result);
}

/**
 * Get a node's output, or undefined if not yet executed.
 */
export function getNodeOutput(state: ExecutionState, nodeId: string): unknown {
  const result = state.nodeResults.get(nodeId);
  return result?.status === 'success' ? result.output : undefined;
}

/**
 * Check if a node has been executed successfully.
 */
export function hasNodeExecuted(state: ExecutionState, nodeId: string): boolean {
  const result = state.nodeResults.get(nodeId);
  return result?.status === 'success';
}

/**
 * Get all available node outputs as a Map.
 */
export function getNodeOutputs(state: ExecutionState): Map<string, unknown> {
  const outputs = new Map<string, unknown>();
  for (const [nodeId, result] of state.nodeResults) {
    if (result.status === 'success') {
      outputs.set(nodeId, result.output);
    }
  }
  return outputs;
}

// ============================================================================
// Context Management
// ============================================================================

/**
 * Update phase context (called when entering a new phase).
 */
export function setPhaseContext(state: ExecutionState, context: Record<string, unknown>): void {
  state.phaseContext = context;
}

/**
 * Update node context (called before evaluating node expressions).
 */
export function setNodeContext(state: ExecutionState, context: Record<string, unknown>): void {
  state.nodeContext = context;
}

// ============================================================================
// Status Management
// ============================================================================

/**
 * Mark execution as started.
 */
export function markRunning(state: ExecutionState): void {
  state.status = 'running';
}

/**
 * Mark execution as completed.
 */
export function markCompleted(state: ExecutionState): void {
  state.status = 'completed';
  state.completedAt = Date.now();
}

/**
 * Mark execution as failed.
 */
export function markFailed(state: ExecutionState): void {
  state.status = 'failed';
  state.completedAt = Date.now();
}

// ============================================================================
// State Cloning (for parallel execution)
// ============================================================================

/**
 * Clone execution state for parallel node execution.
 *
 * Creates a new state object with deep-cloned nodeContext to prevent
 * parallel nodes from affecting each other's context.
 *
 * Note: nodeResults is shared intentionally - results are written by nodeId
 * which provides natural isolation.
 *
 * @param state Original execution state
 * @param contextOverrides Optional context values to add/override
 * @returns Cloned state safe for parallel execution
 */
export function cloneStateForNode(
  state: ExecutionState,
  contextOverrides?: Record<string, unknown>
): ExecutionState {
  return {
    ...state,
    // Deep clone nodeContext to prevent parallel mutation issues
    nodeContext: {
      ...structuredClone(state.nodeContext),
      ...contextOverrides,
    },
    // phaseContext and globalContext are read-only during execution
    phaseContext: { ...state.phaseContext },
    globalContext: { ...state.globalContext },
    // nodeResults is shared - writes are isolated by nodeId key
    nodeResults: state.nodeResults,
    // config and secrets are read-only
    config: state.config,
    secrets: state.secrets,
  };
}
