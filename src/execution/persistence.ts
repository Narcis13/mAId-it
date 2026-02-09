/**
 * State Persistence for FlowScript Execution
 *
 * Functions for saving and loading workflow execution state to/from JSON files.
 * Handles Map serialization/deserialization for JSON compatibility.
 */

import { join } from 'path';
import { FileError } from '../runtimes/errors';
import type { ExecutionState, PersistedState, NodeResult } from './types';

// ============================================================================
// Path Utilities
// ============================================================================

/** Default state directory */
const STATE_DIR = '.maidit-state';

/**
 * Generate state file path for a workflow run.
 * Uses pattern: .maidit-state/{workflowId}/{runId}.json
 *
 * @param workflowId - Workflow identifier
 * @param runId - Run identifier
 * @returns Path to state file
 *
 * @example
 * ```ts
 * const path = getStatePath('my-workflow', 'run-123');
 * // '.maidit-state/my-workflow/run-123.json'
 * ```
 */
export function getStatePath(workflowId: string, runId: string): string {
  return join(STATE_DIR, workflowId, `${runId}.json`);
}

// ============================================================================
// State Serialization
// ============================================================================

/**
 * Convert ExecutionState to PersistedState for JSON serialization.
 * Transforms nodeResults Map to array of [nodeId, result] tuples.
 *
 * @param state - Execution state to serialize
 * @returns Persisted state suitable for JSON.stringify
 */
function toPersistedState(state: ExecutionState): PersistedState {
  return {
    workflowId: state.workflowId,
    runId: state.runId,
    status: state.status,
    currentWave: state.currentWave,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    nodeResults: Array.from(state.nodeResults.entries()),
    globalContext: state.globalContext,
    phaseContext: state.phaseContext,
    nodeContext: state.nodeContext,
    config: state.config,
    secrets: state.secrets,
  };
}

/**
 * Convert PersistedState back to ExecutionState.
 * Restores nodeResults Map from array of tuples.
 *
 * @param persisted - Persisted state from JSON
 * @param overrides - Optional config/secrets overrides
 * @returns Restored execution state
 */
function fromPersistedState(
  persisted: PersistedState,
  overrides?: { config?: Record<string, unknown>; secrets?: Record<string, string> }
): ExecutionState {
  return {
    workflowId: persisted.workflowId,
    runId: persisted.runId,
    status: persisted.status,
    currentWave: persisted.currentWave,
    startedAt: persisted.startedAt,
    completedAt: persisted.completedAt,
    nodeResults: new Map<string, NodeResult>(persisted.nodeResults),
    globalContext: persisted.globalContext,
    phaseContext: persisted.phaseContext,
    nodeContext: persisted.nodeContext,
    config: overrides?.config ?? persisted.config,
    secrets: overrides?.secrets ?? persisted.secrets,
  };
}

// ============================================================================
// JSON Serialization Helpers
// ============================================================================

/**
 * Custom JSON replacer that serializes Error objects with their fields.
 * By default, JSON.stringify produces `{}` for Error instances.
 */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: (value as Error & { code?: string }).code,
    };
  }
  return value;
}

// ============================================================================
// Save State
// ============================================================================

/**
 * Save execution state to JSON file.
 * Converts Map to array for JSON serialization.
 * Creates parent directories if they don't exist.
 *
 * @param state - Current execution state
 * @param filePath - Path to save state file
 *
 * @example
 * ```ts
 * await saveState(state, '.maidit-state/workflow-1/run-abc.json');
 * ```
 */
export async function saveState(
  state: ExecutionState,
  filePath: string
): Promise<void> {
  const persisted = toPersistedState(state);
  const json = JSON.stringify(persisted, errorReplacer, 2);

  // Ensure parent directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await Bun.$`mkdir -p ${dir}`.quiet();
  }

  await Bun.write(filePath, json);
}

// ============================================================================
// Load State
// ============================================================================

/**
 * Load execution state from JSON file.
 * Restores Map from array representation.
 *
 * @param filePath - Path to state file
 * @param overrides - Optional config/secrets overrides
 * @returns Restored execution state
 * @throws FileError if file not found
 *
 * @example
 * ```ts
 * const state = await loadState('.maidit-state/workflow-1/run-abc.json');
 *
 * // With overrides (e.g., updated secrets)
 * const state = await loadState(path, {
 *   secrets: { API_KEY: 'new-key' }
 * });
 * ```
 */
export async function loadState(
  filePath: string,
  overrides?: { config?: Record<string, unknown>; secrets?: Record<string, string> }
): Promise<ExecutionState> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new FileError(`State file not found: ${filePath}`, filePath, 'ENOENT');
  }

  try {
    const persisted = (await file.json()) as PersistedState;
    return fromPersistedState(persisted, overrides);
  } catch (error) {
    if (error instanceof FileError) {
      throw error;
    }
    throw new FileError(
      `Failed to parse state file: ${filePath}`,
      filePath,
      'PARSE_ERROR'
    );
  }
}
