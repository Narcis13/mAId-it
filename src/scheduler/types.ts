/**
 * Scheduler Type Definitions for FlowScript
 *
 * Types for execution planning, waves, and concurrency options.
 */

import type { NodeAST } from '../types/ast';
import type { RetryConfig, ExecutionState } from '../execution/types';

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
  /** Total number of top-level nodes */
  totalNodes: number;
  /** Execution waves in order */
  waves: ExecutionWave[];
  /** Node lookup map for quick access */
  nodes: Map<string, NodeAST>;
}

/**
 * Options for workflow execution.
 */
export interface ExecutionOptions {
  /** Maximum concurrent node executions per wave (default: 10) */
  maxConcurrency?: number;
  /** Global timeout in milliseconds (default: none) */
  timeout?: number;

  // Production readiness additions:

  /** Path to persist state after each wave (enables checkpointing) */
  persistencePath?: string;
  /** Workflow-level error handler for unhandled failures */
  errorHandler?: (error: Error, state: ExecutionState) => void | Promise<void>;
  /** Default retry config applied to all nodes (can be overridden per-node) */
  defaultRetryConfig?: RetryConfig;
}

/** Default maximum concurrency per wave */
export const DEFAULT_MAX_CONCURRENCY = 10;
