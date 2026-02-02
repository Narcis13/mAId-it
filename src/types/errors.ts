/**
 * Error Type Definitions for FlowScript
 *
 * Defines validation errors with source location attachment
 * for compiler-style error messages.
 */

import type { SourceLocation } from './ast.ts';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Severity level for validation messages.
 */
export type ErrorSeverity = 'error' | 'warning';

/**
 * Error codes for all possible validation errors.
 * Grouped by category for easier maintenance.
 */
export type ErrorCode =
  // Parse errors
  | 'PARSE_YAML_INVALID'
  | 'PARSE_XML_INVALID'
  | 'PARSE_MISSING_FRONTMATTER'
  | 'PARSE_MISSING_BODY'
  // Structural validation
  | 'VALID_MISSING_REQUIRED_FIELD'
  | 'VALID_INVALID_FIELD_TYPE'
  | 'VALID_UNKNOWN_NODE_TYPE'
  // Reference validation
  | 'VALID_UNDEFINED_NODE_REF'
  | 'VALID_UNDEFINED_SECRET_REF'
  | 'VALID_DUPLICATE_NODE_ID'
  // Graph validation
  | 'VALID_CIRCULAR_DEPENDENCY';

/**
 * A single validation error or warning.
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Source location where the error occurred */
  loc?: SourceLocation;
  /** Severity level (error or warning) */
  severity: ErrorSeverity;
  /** Suggestions for fixing the issue */
  hints?: string[];
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a parse operation.
 * Either succeeds with data or fails with errors.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Result of a validation operation.
 * Contains both errors (fatal) and warnings (non-fatal).
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an error with consistent structure.
 *
 * @param code - Error code for programmatic handling
 * @param message - Human-readable error message
 * @param loc - Optional source location
 * @param hints - Optional array of suggestions for fixing
 * @returns ValidationError with severity 'error'
 */
export function createError(
  code: ErrorCode,
  message: string,
  loc?: SourceLocation,
  hints?: string[]
): ValidationError {
  return {
    code,
    message,
    loc,
    severity: 'error',
    hints,
  };
}

/**
 * Create a warning with consistent structure.
 *
 * @param code - Error code for programmatic handling
 * @param message - Human-readable warning message
 * @param loc - Optional source location
 * @param hints - Optional array of suggestions
 * @returns ValidationError with severity 'warning'
 */
export function createWarning(
  code: ErrorCode,
  message: string,
  loc?: SourceLocation,
  hints?: string[]
): ValidationError {
  return {
    code,
    message,
    loc,
    severity: 'warning',
    hints,
  };
}
