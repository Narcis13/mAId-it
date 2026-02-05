/**
 * While Runtime for FlowScript
 *
 * Condition-based loop that executes body nodes while condition is true.
 * Includes maxIterations safety bound to prevent infinite loops.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { WhileConfig } from './types.ts';
import { DEFAULT_MAX_ITERATIONS } from './types.ts';
import type { WhileNode } from '../../types/ast.ts';

// ============================================================================
// While Result Types
// ============================================================================

/**
 * Result returned by while runtime with iteration metadata.
 */
export interface WhileResult {
  /** Condition expression to evaluate before each iteration */
  condition: string;
  /** Safety bound on iterations */
  maxIterations: number;
  /** Body node IDs to execute per iteration */
  bodyNodeIds: string[];
}

// ============================================================================
// While Runtime Implementation
// ============================================================================

/**
 * While Runtime - returns condition and iteration metadata for executor.
 *
 * Does NOT execute body nodes directly. Returns metadata including
 * condition and maxIterations for the executor to evaluate and
 * manage the while loop lifecycle.
 *
 * @example
 * ```xml
 * <while id="poll" condition="status !== 'complete'">
 *   <source:http id="check-status" url="https://api.example.com/status" />
 *   <transform:template id="extract" template="{{check-status.output.status}}" />
 * </while>
 * ```
 */
class WhileRuntime implements NodeRuntime<WhileConfig, unknown, WhileResult> {
  readonly type = 'control:while';

  async execute(params: ExecutionParams<WhileConfig, unknown>): Promise<WhileResult> {
    const { node, config } = params;

    // Cast to WhileNode to access condition and body
    const whileNode = node as unknown as WhileNode;

    // Get condition from AST node (required)
    const condition = whileNode.condition;

    // Get maxIterations from config or use default safety bound
    const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    // Extract body node IDs
    const bodyNodeIds = whileNode.body.map((n) => n.id);

    return {
      condition,
      maxIterations,
      bodyNodeIds,
    };
  }
}

/**
 * While runtime instance.
 */
export const whileRuntime = new WhileRuntime();
