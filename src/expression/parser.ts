/**
 * Expression Parser for FlowScript
 *
 * Extracts template expressions from strings and parses them using jsep.
 * Template expressions use {{...}} delimiters.
 */

import jsep from 'jsep';
import type { Expression } from 'jsep';
import { ExpressionError, type TemplateSegment } from './types.ts';

// ============================================================================
// jsep Configuration
// ============================================================================

// Remove bitwise operators (not needed in workflow expressions)
jsep.removeBinaryOp('>>>');
jsep.removeBinaryOp('>>');
jsep.removeBinaryOp('<<');
jsep.removeBinaryOp('|');
jsep.removeBinaryOp('^');
jsep.removeBinaryOp('&');

// Add nullish coalescing operator with lowest precedence
jsep.addBinaryOp('??', 1);

// ============================================================================
// Template Segment Extraction
// ============================================================================

/**
 * Extract segments from a template string.
 *
 * Parses a string containing {{expression}} placeholders into an array
 * of text and expression segments with their positions.
 *
 * @param template - The template string to parse
 * @returns Array of segments with type, value, and position
 *
 * @example
 * ```ts
 * extractTemplateSegments('Hello {{name}}!')
 * // [
 * //   { type: 'text', value: 'Hello ', start: 0, end: 6 },
 * //   { type: 'expression', value: 'name', start: 6, end: 14 },
 * //   { type: 'text', value: '!', start: 14, end: 15 }
 * // ]
 * ```
 */
export function extractTemplateSegments(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  const regex = /\{\{(.+?)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    // Add text segment before the expression (if any)
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: template.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }

    // Add expression segment
    segments.push({
      type: 'expression',
      value: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text segment (if any)
  if (lastIndex < template.length) {
    segments.push({
      type: 'text',
      value: template.slice(lastIndex),
      start: lastIndex,
      end: template.length,
    });
  }

  return segments;
}

// ============================================================================
// Expression Parsing
// ============================================================================

/**
 * Parse an expression string into an AST.
 *
 * Uses jsep to parse the expression, with bitwise operators removed
 * and nullish coalescing added.
 *
 * @param expr - The expression to parse (without {{}} delimiters)
 * @returns jsep Expression AST node
 * @throws ExpressionError if parsing fails
 *
 * @example
 * ```ts
 * parseExpression('user.name')
 * // { type: 'MemberExpression', object: {...}, property: {...} }
 *
 * parseExpression('a ?? b')
 * // { type: 'BinaryExpression', operator: '??', left: {...}, right: {...} }
 * ```
 */
export function parseExpression(expr: string): Expression {
  try {
    return jsep(expr);
  } catch (error) {
    throw new ExpressionError(
      `Failed to parse expression: ${expr}`,
      {
        expression: expr,
        cause: error,
      }
    );
  }
}
