/**
 * Expression Module for FlowScript
 *
 * Provides template expression parsing and sandboxed evaluation.
 * Main entry point for all expression functionality.
 */

// Re-export types
export {
  type TemplateSegment,
  type EvalContext,
  type ExpressionErrorOptions,
  ExpressionError,
  type Expression,
} from './types.ts';

// Re-export parser functions
export { extractTemplateSegments, parseExpression } from './parser.ts';

// Re-export evaluator functions
export { evaluate, evaluateNode } from './evaluator.ts';

// Re-export context utilities
export {
  buildEvaluationContext,
  createEvalContext,
  redactSecrets,
  contextToString,
} from './context.ts';

// Re-export functions
export { getBuiltinFunctions } from './functions';

// Import for evaluateTemplate implementation
import { extractTemplateSegments } from './parser.ts';
import { evaluate } from './evaluator.ts';
import { ExpressionError, type EvalContext } from './types.ts';

/**
 * Evaluate a template string with embedded expressions.
 *
 * Template expressions use {{...}} syntax. Each expression is evaluated
 * and its result is converted to a string and concatenated.
 *
 * @param template - Template string with {{expression}} placeholders
 * @param context - Evaluation context with variables and functions
 * @returns String with all expressions evaluated
 *
 * @example
 * ```ts
 * evaluateTemplate('Hello {{name}}!', { variables: { name: 'World' }, functions: {} });
 * // 'Hello World!'
 *
 * evaluateTemplate('{{a}} + {{b}} = {{a + b}}', { variables: { a: 1, b: 2 }, functions: {} });
 * // '1 + 2 = 3'
 * ```
 */
export function evaluateTemplate(template: string, context: EvalContext): string {
  const segments = extractTemplateSegments(template);

  // If no segments, return empty string
  if (segments.length === 0) {
    return '';
  }

  // Build result by evaluating each segment
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      parts.push(segment.value);
    } else {
      try {
        const result = evaluate(segment.value, context);
        // Convert result to string
        if (result === null || result === undefined) {
          parts.push('');
        } else if (typeof result === 'object') {
          parts.push(JSON.stringify(result));
        } else {
          parts.push(String(result));
        }
      } catch (error) {
        // Re-throw with template context
        if (error instanceof ExpressionError) {
          // Add template context to the error
          throw new ExpressionError(error.message, {
            expression: error.expression,
            template,
            position: { start: segment.start, end: segment.end },
            cause: error.cause,
          });
        }
        throw error;
      }
    }
  }

  return parts.join('');
}
