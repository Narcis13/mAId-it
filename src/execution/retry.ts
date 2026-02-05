/**
 * Retry Utilities for FlowScript Execution
 *
 * Provides executeWithRetry wrapper for resilient node execution
 * with configurable retries, timeouts, and fallback handling.
 */

import { calculateBackoffMs, sleep } from '../runtimes/ai/retry';
import { HttpError } from '../runtimes/errors';
import { AIError } from '../runtimes/ai/errors';
import type { RetryConfig } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

/** Default maximum retry attempts */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay for exponential backoff (1 second) */
const DEFAULT_BACKOFF_BASE = 1000;

/** Default timeout per attempt (30 seconds) */
const DEFAULT_TIMEOUT = 30000;

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Check if an error is retryable.
 *
 * Retryable errors:
 * - HttpError with isRetryable === true (429 or 5xx)
 * - AIError with retryable === true
 * - TimeoutError (from AbortSignal.timeout)
 *
 * NOT retryable:
 * - AbortError (user-initiated cancellation)
 * - Other errors
 *
 * @param error - The error to check
 * @returns true if the error should trigger a retry
 *
 * @example
 * ```ts
 * if (isRetryableError(error)) {
 *   await sleep(calculateBackoffMs(attempt));
 *   // retry
 * }
 * ```
 */
export function isRetryableError(error: unknown): boolean {
  // Check for user-initiated abort (NOT retryable)
  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  // Check for HttpError with isRetryable
  if (error instanceof HttpError) {
    return error.isRetryable;
  }

  // Check for AIError with retryable flag
  if (error instanceof AIError) {
    return error.retryable;
  }

  // Check for TimeoutError (from AbortSignal.timeout)
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true;
  }

  // Check for DOMException TimeoutError (browser-compatible)
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'TimeoutError'
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Retry Wrapper
// ============================================================================

/**
 * Execute a function with retry logic, timeout, and optional fallback.
 *
 * Features:
 * - Configurable max retries with exponential backoff
 * - Per-attempt timeout via AbortSignal
 * - Optional fallback function when all retries fail
 * - Proper error classification (only retryable errors trigger retry)
 *
 * @param fn - Async function to execute (receives AbortSignal for timeout)
 * @param config - Retry configuration
 * @param onFallback - Optional fallback function if all retries fail
 * @returns Result of fn or fallback
 * @throws Last error if all retries exhausted and no fallback provided
 *
 * @example
 * ```ts
 * // Basic usage with timeout
 * const result = await executeWithRetry(
 *   async (signal) => {
 *     const response = await fetch(url, { signal });
 *     return response.json();
 *   },
 *   { maxRetries: 3, timeout: 5000 }
 * );
 *
 * // With fallback
 * const result = await executeWithRetry(
 *   async (signal) => fetchPrimaryData(signal),
 *   { maxRetries: 2 },
 *   async () => fetchFallbackData()
 * );
 * ```
 */
export async function executeWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: RetryConfig = {},
  onFallback?: () => Promise<T>
): Promise<T> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffBase = config.backoffBase ?? DEFAULT_BACKOFF_BASE;
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Create timeout signal for this attempt
      const signal = AbortSignal.timeout(timeout);

      // Execute the function
      return await fn(signal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Non-retryable error, throw immediately
        throw lastError;
      }

      // Check if we have retries remaining
      if (attempt >= maxRetries) {
        break;
      }

      // Wait with exponential backoff before next attempt
      const delay = calculateBackoffMs(attempt, backoffBase);
      await sleep(delay);

      attempt++;
    }
  }

  // All retries exhausted - try fallback if provided
  if (onFallback) {
    return await onFallback();
  }

  // No fallback, throw last error
  throw lastError ?? new Error('All retries exhausted');
}
