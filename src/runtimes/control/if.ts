/**
 * If Runtime for FlowScript
 *
 * Simple conditional control flow that evaluates a condition
 * and returns metadata for then/else branch execution.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { IfConfig } from './types.ts';
import type { IfNode } from '../../types/ast.ts';
import { evaluateInContext } from '../../execution/index.ts';

// ============================================================================
// If Result Types
// ============================================================================

/**
 * Result returned by if runtime indicating condition evaluation.
 */
export interface IfResult {
  /** Whether the condition evaluated to truthy */
  condition: boolean;
  /** Body node IDs to execute (then or else branch) */
  bodyNodeIds: string[];
  /** Which branch was selected */
  branch: 'then' | 'else' | 'none';
}

// ============================================================================
// If Runtime Implementation
// ============================================================================

/**
 * If Runtime - evaluates condition and returns branch selection metadata.
 *
 * Does NOT execute body nodes directly. Returns metadata for the executor
 * to handle then/else body execution based on AST structure.
 *
 * @example
 * ```xml
 * <if id="check-auth" condition="user.isAuthenticated">
 *   <then>
 *     <transform:template id="welcome" template="Welcome, {{user.name}}!" />
 *   </then>
 *   <else>
 *     <transform:template id="redirect" template="Please log in." />
 *   </else>
 * </if>
 * ```
 */
class IfRuntime implements NodeRuntime<IfConfig, unknown, IfResult> {
  readonly type = 'control:if';

  async execute(params: ExecutionParams<IfConfig, unknown>): Promise<IfResult> {
    const { node, state } = params;

    // Cast to IfNode to access condition, then, and else
    const ifNode = node as unknown as IfNode;

    // Evaluate condition expression (from AST node, not config)
    const conditionResult = evaluateInContext(ifNode.condition, state);
    const isTruthy = Boolean(conditionResult);

    if (isTruthy) {
      // Condition is true - execute then branch
      return {
        condition: true,
        bodyNodeIds: ifNode.then.map((n) => n.id),
        branch: 'then',
      };
    }

    // Condition is false - check for else branch
    if (ifNode.else && ifNode.else.length > 0) {
      return {
        condition: false,
        bodyNodeIds: ifNode.else.map((n) => n.id),
        branch: 'else',
      };
    }

    // No else branch
    return {
      condition: false,
      bodyNodeIds: [],
      branch: 'none',
    };
  }
}

/**
 * If runtime instance.
 */
export const ifRuntime = new IfRuntime();
