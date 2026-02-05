/**
 * Execution Type Definitions for FlowScript
 *
 * Types for workflow execution state, node results, and execution tracking.
 */

// ============================================================================
// Node Result Types
// ============================================================================

/**
 * Node execution result.
 */
export interface NodeResult {
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: Error;
  duration: number;
  startedAt: number;
  completedAt: number;
}

// ============================================================================
// Execution State Types
// ============================================================================

/**
 * Execution state for a running workflow.
 */
export interface ExecutionState {
  // Identity
  workflowId: string;
  runId: string;

  // Progress
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentWave: number;

  // Timing
  startedAt: number;
  completedAt?: number;

  // Results
  nodeResults: Map<string, NodeResult>;

  // Context layers
  globalContext: Record<string, unknown>;
  phaseContext: Record<string, unknown>;
  nodeContext: Record<string, unknown>;

  // Config and secrets (from workflow metadata)
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

/**
 * Options for creating a new execution state.
 */
export interface ExecutionStateOptions {
  workflowId: string;
  runId?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  globalContext?: Record<string, unknown>;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for node execution.
 */
export interface RetryConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  backoffBase?: number;
  /** Timeout in ms for each attempt (default: 30000) */
  timeout?: number;
  /** Node ID to execute if all retries fail */
  fallbackNodeId?: string;
}

// ============================================================================
// Persistence Types
// ============================================================================

/**
 * Persisted state format for JSON serialization.
 * Maps are converted to arrays for JSON compatibility.
 */
export interface PersistedState {
  workflowId: string;
  runId: string;
  status: ExecutionState['status'];
  currentWave: number;
  startedAt: number;
  completedAt?: number;
  /** nodeResults Map serialized as array of [nodeId, result] tuples */
  nodeResults: Array<[string, NodeResult]>;
  globalContext: Record<string, unknown>;
  phaseContext: Record<string, unknown>;
  nodeContext: Record<string, unknown>;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}
