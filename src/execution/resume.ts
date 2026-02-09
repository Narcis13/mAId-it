/**
 * Workflow Resume Functionality for FlowScript
 *
 * Enables resuming failed or cancelled workflows from persisted checkpoints.
 * Loads saved state, rebuilds execution plan, and continues from the next wave.
 */

import type { WorkflowAST } from '../types/ast';
import type { ExecutionState } from './types';
import type { ExecutionOptions, ExecutionPlan } from '../scheduler/types';
import { loadState } from './persistence';
import { buildExecutionPlan } from '../scheduler';
import { execute } from './executor';

// ============================================================================
// Resume Workflow
// ============================================================================

/**
 * Resume a workflow from a persisted checkpoint.
 *
 * Loads the saved state, rebuilds the execution plan, and continues
 * from the wave after the last completed wave.
 *
 * @param ast - Original workflow AST
 * @param checkpointPath - Path to persisted state file
 * @param options - Execution options (can override config/secrets)
 * @returns Promise that resolves when workflow completes with final state
 *
 * @example
 * ```typescript
 * // Resume from checkpoint
 * await resumeWorkflow(ast, '.maidit-state/workflow/run123.json', {
 *   secrets: { API_KEY: 'new-key' }  // Override with fresh secrets
 * });
 * ```
 */
export async function resumeWorkflow(
  ast: WorkflowAST,
  checkpointPath: string,
  options: ExecutionOptions & {
    config?: Record<string, unknown>;
    secrets?: Record<string, string>;
  } = {}
): Promise<ExecutionState> {
  // Load persisted state with optional config/secrets overrides
  const state = await loadState(checkpointPath, {
    config: options.config,
    secrets: options.secrets,
  });

  // Reset status to running for resume
  state.status = 'running';

  // Build full execution plan from AST
  const fullPlan = buildExecutionPlan(ast);

  // Include current wave (>= not >) to re-execute unfinished nodes
  const remainingWaves = fullPlan.waves.filter(
    (wave) => wave.waveNumber >= state.currentWave
  );

  // For the current wave, filter out already-completed nodes
  if (remainingWaves.length > 0 && remainingWaves[0].waveNumber === state.currentWave) {
    const currentWave = remainingWaves[0];
    const unfinishedNodeIds = currentWave.nodeIds.filter((nodeId) => {
      const result = state.nodeResults.get(nodeId);
      return !result || result.status !== 'success';
    });

    if (unfinishedNodeIds.length === 0) {
      // All nodes in current wave completed, skip it
      remainingWaves.shift();
    } else {
      // Replace with filtered wave containing only unfinished nodes
      remainingWaves[0] = { ...currentWave, nodeIds: unfinishedNodeIds };
    }
  }

  // Create resume plan with remaining waves only
  const resumePlan: ExecutionPlan = {
    workflowId: fullPlan.workflowId,
    totalNodes: fullPlan.totalNodes,
    waves: remainingWaves,
    nodes: fullPlan.nodes,
  };

  // Execute remaining waves
  await execute(resumePlan, state, options);

  return state;
}

// ============================================================================
// Resume Check
// ============================================================================

/**
 * Check if a workflow run can be resumed.
 * Returns true if state file exists and status is 'failed' or 'cancelled'.
 *
 * @param checkpointPath - Path to persisted state file
 * @returns true if workflow can be resumed, false otherwise
 *
 * @example
 * ```typescript
 * if (await canResume(checkpointPath)) {
 *   await resumeWorkflow(ast, checkpointPath);
 * }
 * ```
 */
export async function canResume(checkpointPath: string): Promise<boolean> {
  const file = Bun.file(checkpointPath);

  // Check if file exists
  if (!(await file.exists())) {
    return false;
  }

  try {
    // Parse the state to check status
    const persisted = await file.json();

    // Only 'failed' or 'cancelled' workflows can be resumed
    return persisted.status === 'failed' || persisted.status === 'cancelled';
  } catch {
    // If we can't parse the file, can't resume
    return false;
  }
}
