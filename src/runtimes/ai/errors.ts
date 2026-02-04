/**
 * AI Runtime Error Classes for FlowScript
 *
 * Custom error classes for AI operations including API errors,
 * schema validation failures, and rate limiting.
 */

import type { AIErrorCode } from './types.ts';

// ============================================================================
// AI Error
// ============================================================================

/**
 * Error thrown when AI operations fail.
 *
 * @example
 * ```ts
 * // API timeout
 * throw new AIError('Request timed out', 'TIMEOUT', true);
 *
 * // Rate limit
 * throw new AIError('Rate limit exceeded', 'RATE_LIMIT', true);
 *
 * // Validation failure (retryable with corrected prompt)
 * throw new AIError('Output schema validation failed', 'VALIDATION', true);
 *
 * // Non-retryable API error
 * throw new AIError('Invalid API key', 'API_ERROR', false);
 * ```
 */
export class AIError extends Error {
  constructor(
    message: string,
    /** Error code for classification */
    public readonly code: AIErrorCode,
    /** Whether this error type can be retried */
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'AIError';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AIError.prototype);
  }

  /**
   * Whether this error is retryable.
   * Returns true for RATE_LIMIT and TIMEOUT codes.
   */
  get isRetryable(): boolean {
    return this.retryable;
  }
}

// ============================================================================
// Schema Validation Error
// ============================================================================

/**
 * Error thrown when AI output fails schema validation.
 * Contains the failed output and validation message to enable retry prompts.
 *
 * @example
 * ```ts
 * const error = new SchemaValidationError(
 *   'Output does not match schema',
 *   { summary: 123 },  // AI returned number instead of string
 *   'Expected string at path: summary'
 * );
 *
 * // Use in retry prompt
 * console.log('Your output:', error.failedOutput);
 * console.log('Error:', error.validationMessage);
 * ```
 */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    /** The output that failed validation */
    public readonly failedOutput: unknown,
    /** Human-readable validation error message */
    public readonly validationMessage: string
  ) {
    super(message);
    this.name = 'SchemaValidationError';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error indicates a rate limit (HTTP 429).
 *
 * Detects:
 * - HttpError with status 429
 * - Error messages containing "rate limit" (case insensitive)
 *
 * @param error - The error to check
 * @returns true if the error indicates rate limiting
 *
 * @example
 * ```ts
 * try {
 *   await makeApiCall();
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     await sleep(calculateBackoffMs(attempt));
 *     // retry
 *   }
 * }
 * ```
 */
export function isRateLimitError(error: unknown): boolean {
  // Check for HttpError with status 429
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status: number }).status === 429
  ) {
    return true;
  }

  // Check for rate limit in message
  if (error instanceof Error) {
    return /rate\s*limit/i.test(error.message);
  }

  // Check for string error messages
  if (typeof error === 'string') {
    return /rate\s*limit/i.test(error);
  }

  return false;
}
