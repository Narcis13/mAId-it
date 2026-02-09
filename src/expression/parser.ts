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
  let i = 0;
  let textStart = 0;

  while (i < template.length) {
    // Check for escaped \{{ — produces literal {{
    if (
      template[i] === '\\' &&
      i + 2 < template.length &&
      template[i + 1] === '{' &&
      template[i + 2] === '{'
    ) {
      // Emit text accumulated before the backslash
      if (i > textStart) {
        segments.push({
          type: 'text',
          value: template.slice(textStart, i),
          start: textStart,
          end: i,
        });
      }
      // Emit literal {{ as text (consuming \{{ = 3 chars)
      segments.push({
        type: 'text',
        value: '{{',
        start: i,
        end: i + 3,
      });
      i += 3;
      textStart = i;
      continue;
    }

    // Check for {{ expression opening
    if (template[i] === '{' && i + 1 < template.length && template[i + 1] === '{') {
      // Emit text before this
      if (i > textStart) {
        segments.push({
          type: 'text',
          value: template.slice(textStart, i),
          start: textStart,
          end: i,
        });
      }

      const exprStart = i;
      i += 2; // Skip {{

      // Find matching }} while respecting string literals
      const exprEnd = findExpressionEnd(template, i);
      if (exprEnd === -1) {
        // No matching }} — treat rest as text
        segments.push({
          type: 'text',
          value: template.slice(exprStart),
          start: exprStart,
          end: template.length,
        });
        return segments;
      }

      segments.push({
        type: 'expression',
        value: template.slice(i, exprEnd).trim(),
        start: exprStart,
        end: exprEnd + 2, // +2 for }}
      });
      i = exprEnd + 2;
      textStart = i;
      continue;
    }

    i++;
  }

  // Remaining text
  if (textStart < template.length) {
    segments.push({
      type: 'text',
      value: template.slice(textStart),
      start: textStart,
      end: template.length,
    });
  }

  return segments;
}

/**
 * Find the position of the closing }} for a template expression,
 * skipping over string literals so that }} inside quotes is ignored.
 * Returns the index of the first } of }}, or -1 if not found.
 */
function findExpressionEnd(template: string, start: number): number {
  let i = start;

  while (i < template.length) {
    const ch = template[i]!;

    // Found closing }}
    if (ch === '}' && i + 1 < template.length && template[i + 1] === '}') {
      return i;
    }

    // Skip string literals (so }} inside strings doesn't close the expression)
    if (ch === '"' || ch === "'") {
      i = skipStringLiteral(template, i);
      continue;
    }

    i++;
  }

  return -1;
}

/**
 * Skip past a string literal starting at the given quote character.
 * Handles backslash escapes inside the string.
 */
function skipStringLiteral(template: string, start: number): number {
  const quote = template[start];
  let i = start + 1;

  while (i < template.length) {
    if (template[i] === '\\') {
      i += 2; // Skip escaped character
      continue;
    }
    if (template[i] === quote) {
      return i + 1;
    }
    i++;
  }

  return i; // Unterminated string — return end
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
