/**
 * Loop Runtime for FlowScript
 *
 * Fixed iteration loop that executes body nodes up to maxIterations times.
 * Supports optional breakCondition for early exit.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { LoopConfig } from './types.ts';
import { DEFAULT_MAX_ITERATIONS } from './types.ts';
import type { LoopNode, NodeAST } from '../../types/ast.ts';

// ============================================================================
// Loop Result Types
// ============================================================================

/**
 * Result returned by loop runtime with iteration metadata.
 */
export interface LoopResult {
  /** Maximum iterations to execute */
  maxIterations: number;
  /** Optional break condition expression */
  breakCondition?: string;
  /** Body node IDs to execute per iteration */
  bodyNodeIds: string[];
  /** Body node ASTs for direct execution (nested nodes aren't in plan.nodes) */
  bodyNodes: NodeAST[];
}

// ============================================================================
// Loop Runtime Implementation
// ============================================================================

/**
 * Loop Runtime - returns iteration metadata for executor to handle.
 *
 * Does NOT execute body nodes directly. Returns metadata including
 * maxIterations and breakCondition for the executor to iterate and
 * manage the loop lifecycle.
 *
 * @example
 * ```xml
 * <loop id="retry" maxIterations="3" breakCondition="success === true">
 *   <source:http id="fetch" url="https://api.example.com/data" />
 *   <transform:template id="check" template="{{fetch.output.status}}" />
 * </loop>
 * ```
 */
class LoopRuntime implements NodeRuntime<LoopConfig, unknown, LoopResult> {
  readonly type = 'control:loop';

  async execute(params: ExecutionParams<LoopConfig, unknown>): Promise<LoopResult> {
    const { node, config } = params;

    // Cast to LoopNode to access body and optional AST-level properties
    const loopNode = node as unknown as LoopNode;

    // Get maxIterations from AST node first, then config, then default
    const maxIterations =
      loopNode.maxIterations ?? config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    // Get breakCondition from AST node first, then config
    const breakCondition = loopNode.breakCondition ?? config.breakCondition;

    // Extract body node IDs and AST nodes
    const bodyNodeIds = loopNode.body.map((n) => n.id);

    return {
      maxIterations,
      breakCondition,
      bodyNodeIds,
      bodyNodes: loopNode.body,
    };
  }
}

/**
 * Loop runtime instance.
 */
export const loopRuntime = new LoopRuntime();
