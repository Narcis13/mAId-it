/**
 * Branch Runtime for FlowScript
 *
 * Pattern matching control flow that evaluates cases in order
 * and returns metadata indicating which branch matched.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { BranchConfig } from './types.ts';
import type { BranchNode, BranchCase } from '../../types/ast.ts';
import { evaluateInContext } from '../../execution/index.ts';

// ============================================================================
// Branch Result Types
// ============================================================================

/**
 * Result returned by branch runtime indicating which case matched.
 */
export interface BranchResult {
  /** Whether a case or default was matched */
  matched: boolean;
  /** Index of matched case (undefined if default matched or no match) */
  caseIndex?: number;
  /** Body node IDs to execute (from matched case or default) */
  bodyNodeIds: string[];
  /** Whether the default branch should be used */
  useDefault: boolean;
}

// ============================================================================
// Branch Runtime Implementation
// ============================================================================

/**
 * Branch Runtime - evaluates cases in order and returns match metadata.
 *
 * Does NOT execute body nodes directly. Returns metadata for the executor
 * to handle body execution based on AST structure.
 *
 * @example
 * ```xml
 * <branch id="route">
 *   <case condition="status === 'success'">
 *     <sink:file path="success.json" />
 *   </case>
 *   <case condition="status === 'error'">
 *     <sink:file path="error.json" />
 *   </case>
 *   <default>
 *     <sink:file path="unknown.json" />
 *   </default>
 * </branch>
 * ```
 */
class BranchRuntime implements NodeRuntime<BranchConfig, unknown, BranchResult> {
  readonly type = 'control:branch';

  async execute(params: ExecutionParams<BranchConfig, unknown>): Promise<BranchResult> {
    const { node, state } = params;

    // Cast to BranchNode to access cases and default
    const branchNode = node as unknown as BranchNode;

    // Iterate through cases in order, evaluating conditions
    for (let i = 0; i < branchNode.cases.length; i++) {
      const branchCase: BranchCase = branchNode.cases[i];

      // Evaluate condition expression
      const conditionResult = evaluateInContext(branchCase.condition, state);

      // If truthy, this case matches
      if (conditionResult) {
        return {
          matched: true,
          caseIndex: i,
          bodyNodeIds: branchCase.nodes.map((n) => n.id),
          useDefault: false,
        };
      }
    }

    // No case matched - check for default
    if (branchNode.default && branchNode.default.length > 0) {
      return {
        matched: true,
        caseIndex: undefined,
        bodyNodeIds: branchNode.default.map((n) => n.id),
        useDefault: true,
      };
    }

    // No match and no default
    return {
      matched: false,
      caseIndex: undefined,
      bodyNodeIds: [],
      useDefault: false,
    };
  }
}

/**
 * Branch runtime instance.
 */
export const branchRuntime = new BranchRuntime();
