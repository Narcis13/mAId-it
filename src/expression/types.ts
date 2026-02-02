/**
 * Expression Type Definitions for FlowScript
 *
 * Types for template expression parsing and evaluation,
 * including the ExpressionError class for detailed error reporting.
 */

import type jsep from 'jsep';

// Re-export jsep Expression type for consumers
export type { Expression } from 'jsep';

// ============================================================================
// Template Segment Types
// ============================================================================

/**
 * A segment of a template string.
 * Templates are parsed into alternating text and expression segments.
 *
 * Example: "Hello {{name}}!" becomes:
 *   [{ type: 'text', value: 'Hello ', start: 0, end: 6 },
 *    { type: 'expression', value: 'name', start: 6, end: 14 },
 *    { type: 'text', value: '!', start: 14, end: 15 }]
 */
export interface TemplateSegment {
  /** Type of segment */
  type: 'text' | 'expression';
  /** Content of the segment (raw text or expression string without delimiters) */
  value: string;
  /** Start position in original template */
  start: number;
  /** End position in original template */
  end: number;
}

// ============================================================================
// Evaluation Context Types
// ============================================================================

/**
 * Context provided for expression evaluation.
 * Contains variables and whitelisted functions.
 */
export interface EvalContext {
  /** Variables accessible in expressions (e.g., { user: { name: 'Alice' } }) */
  variables: Record<string, unknown>;
  /** Whitelisted functions that can be called in expressions */
  functions: Record<string, (...args: unknown[]) => unknown>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Options for constructing an ExpressionError.
 */
export interface ExpressionErrorOptions {
  /** The expression that failed (without template delimiters) */
  expression?: string;
  /** The full template string (if in template context) */
  template?: string;
  /** Position within the template where the error occurred */
  position?: { start: number; end: number };
  /** The underlying error that caused this error */
  cause?: unknown;
}

/**
 * Error thrown during expression parsing or evaluation.
 * Includes contextual information for debugging.
 */
export class ExpressionError extends Error {
  /** The expression that failed (without template delimiters) */
  readonly expression?: string;

  /** The full template string (if in template context) */
  readonly template?: string;

  /** Position within the template where the error occurred */
  readonly position?: { start: number; end: number };

  /** The underlying error that caused this error */
  override readonly cause?: unknown;

  constructor(message: string, options: ExpressionErrorOptions = {}) {
    super(message);
    this.name = 'ExpressionError';
    this.expression = options.expression;
    this.template = options.template;
    this.position = options.position;
    this.cause = options.cause;

    // Maintain proper stack trace in V8/Bun
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExpressionError);
    }
  }

  /**
   * Create a formatted error message with context.
   */
  toDetailedString(): string {
    const parts: string[] = [this.message];

    if (this.expression) {
      parts.push(`  Expression: ${this.expression}`);
    }

    if (this.template && this.position) {
      parts.push(`  Template: ${this.template}`);
      parts.push(`  Position: ${this.position.start}-${this.position.end}`);
    }

    if (this.cause instanceof Error) {
      parts.push(`  Caused by: ${this.cause.message}`);
    }

    return parts.join('\n');
  }
}
