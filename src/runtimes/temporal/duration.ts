/**
 * Duration Parsing Utility for Temporal Runtimes
 *
 * Wraps the expression-level parseDurationToMs with error handling
 * suitable for runtime use (throws on invalid input).
 */

import { parseDurationToMs } from '../../expression/functions/time.ts';

/**
 * Parse a duration string into milliseconds.
 * Throws on invalid input (unlike the expression-level function which returns null).
 *
 * @param input Duration string ("5s", "1m", "PT30S", "500ms") or number (milliseconds)
 * @returns Duration in milliseconds
 * @throws Error if input is invalid or not parseable
 */
export function parseDuration(input: string | number): number {
  const ms = parseDurationToMs(input);
  if (ms === null || ms <= 0) {
    throw new Error(`Invalid duration: ${JSON.stringify(input)}`);
  }
  return ms;
}
