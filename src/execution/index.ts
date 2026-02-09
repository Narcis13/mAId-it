/**
 * Execution Module for FlowScript
 *
 * Provides workflow execution state management and expression evaluation
 * in the context of a running workflow.
 */

import type { ExecutionState } from './types';
import {
  buildEvaluationContext,
  redactSecrets,
  contextToString,
} from '../expression/context';
import { evaluate, evaluateTemplate, ExpressionError } from '../expression';

// ============================================================================
// Re-exports
// ============================================================================

// Re-export types
export type { ExecutionState, ExecutionStateOptions, NodeResult } from './types';

// Re-export state management
export {
  createExecutionState,
  recordNodeResult,
  getNodeOutput,
  hasNodeExecuted,
  getNodeOutputs,
  setPhaseContext,
  setNodeContext,
  markRunning,
  markCompleted,
  markFailed,
} from './state';

// Re-export executor
export { execute } from './executor';

// Re-export retry utilities
export { executeWithRetry, isRetryableError } from './retry';

// Re-export state persistence
export { saveState, loadState, getStatePath } from './persistence';

// Re-export workflow resume
export { resumeWorkflow, canResume } from './resume';

// Re-export execution logging
export { formatExecutionLog, appendExecutionLog } from './logging';
export type { ExecutionLogEntry } from './logging';

// Re-export evolution module
export { processExecutionFeedback, buildEvolutionSummary, formatFeedback } from './evolution';
export type { FeedbackEntry, EvolutionSummary } from './evolution';

// ============================================================================
// Context-aware Expression Evaluation
// ============================================================================

/**
 * Evaluate an expression in the context of a running workflow execution.
 * This is the main API for expression evaluation during workflow execution.
 *
 * @param expression - The expression to evaluate (without {{ }})
 * @param state - The current execution state
 * @returns The evaluated result
 * @throws ExpressionError with context on failure
 */
export function evaluateInContext(expression: string, state: ExecutionState): unknown {
  const context = buildEvaluationContext(state);

  try {
    return evaluate(expression, context);
  } catch (error) {
    if (error instanceof ExpressionError) {
      // Add redacted context info for debugging
      const contextStr = contextToString(redactSecrets(context));
      throw new ExpressionError(`${error.message}\nContext: ${contextStr}`, {
        expression: error.expression ?? expression,
        cause: error.cause,
      });
    }
    throw error;
  }
}

/**
 * Evaluate a template string in the context of a running workflow execution.
 *
 * @param template - The template string containing {{...}} expressions
 * @param state - The current execution state
 * @returns The evaluated template with expressions replaced
 * @throws ExpressionError with context on failure
 */
export function evaluateTemplateInContext(template: string, state: ExecutionState): string {
  const context = buildEvaluationContext(state);

  try {
    return evaluateTemplate(template, context);
  } catch (error) {
    if (error instanceof ExpressionError) {
      const contextStr = contextToString(redactSecrets(context));
      throw new ExpressionError(`${error.message}\nContext: ${contextStr}`, {
        expression: error.expression,
        template: error.template ?? template,
        position: error.position,
        cause: error.cause,
      });
    }
    throw error;
  }
}

/**
 * Resolve a node output reference like "nodeId.output.field".
 * Convenience function for accessing node outputs.
 *
 * @param reference - The node output reference
 * @param state - The current execution state
 * @returns The resolved value
 * @throws ExpressionError if node not executed or path invalid
 */
export function resolveNodeReference(reference: string, state: ExecutionState): unknown {
  // Use expression evaluation which already handles node.output syntax
  return evaluateInContext(reference, state);
}
