/**
 * AI Runtime Retry Utilities for FlowScript
 *
 * Provides exponential backoff with jitter, sleep helper, and retry prompt
 * building for handling rate limits and validation failures.
 */

// ============================================================================
// Backoff Calculation
// ============================================================================

/**
 * Calculate exponential backoff with full jitter.
 * Uses AWS recommended "full jitter" strategy for optimal retry distribution.
 *
 * Formula: random(0, min(cap, base * 2^attempt))
 *
 * @param attempt - Zero-based attempt number (0, 1, 2, ...)
 * @param baseMs - Base delay in milliseconds (default: 1000)
 * @returns Delay in milliseconds with jitter applied
 *
 * @example
 * ```ts
 * // First retry: random between 0-1000ms
 * calculateBackoffMs(0);  // e.g., 423
 *
 * // Second retry: random between 0-2000ms
 * calculateBackoffMs(1);  // e.g., 1847
 *
 * // Fifth retry: random between 0-32000ms (capped)
 * calculateBackoffMs(5);  // e.g., 28451
 *
 * // Tenth retry: still capped at 0-32000ms
 * calculateBackoffMs(10); // e.g., 15234
 * ```
 */
export function calculateBackoffMs(attempt: number, baseMs: number = 1000): number {
  // Exponential: 1s, 2s, 4s, 8s, 16s, 32s
  const exponentialDelay = baseMs * Math.pow(2, attempt);

  // Cap at 32 seconds
  const cappedDelay = Math.min(exponentialDelay, 32000);

  // Full jitter: random value between 0 and delay
  const jitter = Math.random() * cappedDelay;

  return Math.floor(jitter);
}

// ============================================================================
// Sleep Utility
// ============================================================================

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 *
 * @example
 * ```ts
 * await sleep(1000);  // Wait 1 second
 *
 * // With backoff
 * await sleep(calculateBackoffMs(retryCount));
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Retry Prompt Builder
// ============================================================================

/**
 * Build a retry prompt that includes the validation error feedback.
 * Helps the model self-correct on subsequent attempts by showing:
 * - The original prompt
 * - What the model output
 * - Why it failed validation
 *
 * @param originalPrompt - The original user prompt
 * @param failedOutput - The output that failed validation
 * @param validationError - The validation error (string or object)
 * @returns Enhanced prompt with error feedback
 *
 * @example
 * ```ts
 * const retryPrompt = buildRetryPrompt(
 *   'Extract the user name from: "Hi, I am John"',
 *   { name: 123 },  // Model returned number
 *   'Expected string at path: name'
 * );
 *
 * // retryPrompt now includes feedback to help model correct
 * ```
 */
export function buildRetryPrompt(
  originalPrompt: string,
  failedOutput: unknown,
  validationError: string | object
): string {
  const errorStr = typeof validationError === 'string'
    ? validationError
    : JSON.stringify(validationError, null, 2);

  return `${originalPrompt}

---

Your previous response did not match the required output schema.

Your output:
\`\`\`json
${JSON.stringify(failedOutput, null, 2)}
\`\`\`

Schema validation error:
${errorStr}

Please provide a corrected response that strictly matches the required schema.`;
}
