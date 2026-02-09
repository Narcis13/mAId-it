/**
 * Checkpoint Runtime Type Definitions
 *
 * Types for human-in-the-loop checkpoint nodes that pause
 * execution and prompt for user input.
 */

/**
 * User action at checkpoint.
 */
export type CheckpointAction = 'approve' | 'reject' | 'input' | string;

/**
 * Named action definition for checkpoint config.
 */
export interface CheckpointActionConfig {
  /** Action identifier */
  id: string;
  /** Display label */
  label?: string;
  /** Node ID to route to when this action is selected */
  goto?: string;
}

/**
 * Configuration for checkpoint nodes.
 */
export interface CheckpointConfig {
  /** Message to display to user */
  message: string;
  /** Timeout in milliseconds before default action (optional) */
  timeout?: number;
  /** Action to take on timeout (default: 'reject') */
  defaultAction?: 'approve' | 'reject';
  /** Whether to allow text input (default: false) */
  allowInput?: boolean;
  /** Named actions with goto routing */
  actions?: CheckpointActionConfig[];
  /** Condition expression — skip checkpoint if false */
  condition?: string;
}

/**
 * Result from checkpoint execution.
 */
export interface CheckpointResult {
  /** User's action */
  action: CheckpointAction;
  /** User's text input (if allowInput was true and user chose input) */
  input?: string;
  /** Whether the checkpoint timed out */
  timedOut: boolean;
  /** Timestamp when user responded */
  respondedAt: number;
  /** Whether the checkpoint was skipped due to condition */
  skipped?: boolean;
  /** Goto target node ID for named action routing */
  goto?: string;
}
