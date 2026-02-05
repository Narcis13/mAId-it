/**
 * Parallel Runtime for FlowScript
 *
 * Executes multiple branches concurrently.
 * Returns metadata for executor to handle actual parallel execution.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { ParallelConfig } from './types.ts';
import type { ParallelNode, NodeAST } from '../../types/ast.ts';

// ============================================================================
// Parallel Result Types
// ============================================================================

/**
 * Result returned by parallel runtime with branch metadata.
 * The executor detects this type and handles branch execution.
 */
export interface ParallelResult {
  /** Branches to execute in parallel (each branch is an array of NodeAST) */
  branches: NodeAST[][];
  /** Number of branches */
  branchCount: number;
  /** Maximum concurrent branches (undefined = unlimited) */
  maxConcurrency?: number;
}

// ============================================================================
// Parallel Runtime Implementation
// ============================================================================

/**
 * Parallel Runtime - returns branch metadata for executor to handle.
 *
 * The parallel runtime itself doesn't execute branches.
 * It extracts the branch structure and returns metadata.
 * The executor then runs branches concurrently with state isolation.
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
 *   <branch>
 *     <source:http id="api3" url="https://api3.example.com" />
 *   </branch>
 * </parallel>
 * ```
 */
class ParallelRuntime implements NodeRuntime<ParallelConfig, unknown, ParallelResult> {
  readonly type = 'control:parallel';

  async execute(params: ExecutionParams<ParallelConfig, unknown>): Promise<ParallelResult> {
    const { node, config } = params;

    // Cast to ParallelNode to access branches
    const parallelNode = node as unknown as ParallelNode;

    // Get maxConcurrency from config (optional)
    const maxConcurrency = config.maxConcurrency;

    return {
      branches: parallelNode.branches,
      branchCount: parallelNode.branches.length,
      maxConcurrency,
    };
  }
}

/**
 * Parallel runtime instance.
 */
export const parallelRuntime = new ParallelRuntime();
