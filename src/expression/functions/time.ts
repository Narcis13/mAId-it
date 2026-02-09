/**
 * Time Functions for FlowScript Expressions
 *
 * Date/time operations using Luxon for robust handling.
 * All functions handle invalid dates gracefully.
 */

import { DateTime, Duration, type DurationUnit, type DateTimeUnit } from 'luxon';

/**
 * Parse a human-readable duration string into milliseconds.
 * Supports: "500ms", "5s", "1m", "2h", "1d", combined "1h30m",
 * ISO durations ("PT1H30M", "P1D"), and plain numbers (treated as ms).
 */
function parseDurationToMs(input: string | number): number | null {
  if (typeof input === 'number') return input;
  if (!input || typeof input !== 'string') return null;

  const s = input.trim();

  // Plain number string → milliseconds
  if (/^\d+$/.test(s)) return Number(s);

  // ISO 8601 duration (starts with P)
  if (s.startsWith('P') || s.startsWith('p')) {
    const dur = Duration.fromISO(s);
    return dur.isValid ? dur.toMillis() : null;
  }

  // Human-readable: "1h30m5s", "500ms", "2h", "5s" etc.
  const humanRegex = /(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?/;
  const match = s.match(humanRegex);
  if (!match || match[0] === '') return null;

  const [, d, h, m, sec, ms] = match;
  let total = 0;
  if (d) total += parseFloat(d) * 86400000;
  if (h) total += parseFloat(h) * 3600000;
  if (m) total += parseFloat(m) * 60000;
  if (sec) total += parseFloat(sec) * 1000;
  if (ms) total += parseFloat(ms);

  return total > 0 ? total : null;
}

export { parseDurationToMs };

export const timeFunctions = {
  /**
   * Get current datetime as ISO string
   */
  now: (): string | null => DateTime.now().toISO(),

  /**
   * Get current date in ISO format or custom format
   */
  date: (format?: string): string | null => {
    const dt = DateTime.now();
    return format ? dt.toFormat(format) : dt.toISODate();
  },

  /**
   * Get current time in ISO format or custom format
   */
  time: (format?: string): string | null => {
    const dt = DateTime.now();
    return format ? dt.toFormat(format) : dt.toISOTime();
  },

  /**
   * Parse date string, optionally with format
   */
  parse_date: (str: string, format?: string): string | null => {
    if (!str) return null;
    const dt = format ? DateTime.fromFormat(str, format) : DateTime.fromISO(str);
    return dt.isValid ? dt.toISO() : null;
  },

  /**
   * Format ISO date string to custom format
   */
  format_date: (isoDate: string, format: string): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    return dt.isValid ? dt.toFormat(format) : null;
  },

  /**
   * Add duration to date
   * Duration can be ISO duration string or object like { days: 1, hours: 2 }
   */
  add_time: (isoDate: string, duration: string | object): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    if (!dt.isValid) return null;
    const dur =
      typeof duration === 'string'
        ? Duration.fromISO(duration)
        : Duration.fromObject(duration as Record<string, number>);
    return dt.plus(dur).toISO();
  },

  /**
   * Subtract duration from date
   */
  subtract_time: (isoDate: string, duration: string | object): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    if (!dt.isValid) return null;
    const dur =
      typeof duration === 'string'
        ? Duration.fromISO(duration)
        : Duration.fromObject(duration as Record<string, number>);
    return dt.minus(dur).toISO();
  },

  /**
   * Get difference between two dates in specified unit
   */
  diff: (date1: string, date2: string, unit = 'days'): number | null => {
    if (!date1 || !date2) return null;
    const dt1 = DateTime.fromISO(date1);
    const dt2 = DateTime.fromISO(date2);
    if (!dt1.isValid || !dt2.isValid) return null;
    const result = dt1.diff(dt2, unit as DurationUnit).toObject();
    return (result as Record<string, number | undefined>)[unit] ?? null;
  },

  /**
   * Get current Unix timestamp in milliseconds
   */
  timestamp: (): number => Date.now(),

  /**
   * Convert Unix timestamp to ISO date string
   */
  from_timestamp: (ts: number): string | null => DateTime.fromMillis(ts).toISO(),

  /**
   * Get start of time unit (day, week, month, year)
   */
  start_of: (isoDate: string, unit: string): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    if (!dt.isValid) return null;
    return dt.startOf(unit as DateTimeUnit).toISO();
  },

  /**
   * Get end of time unit (day, week, month, year)
   */
  end_of: (isoDate: string, unit: string): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    if (!dt.isValid) return null;
    return dt.endOf(unit as DateTimeUnit).toISO();
  },

  /**
   * Get specific part of date (year, month, day, hour, etc.)
   */
  get_part: (isoDate: string, part: string): number | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    if (!dt.isValid) return null;
    return dt.get(part as keyof DateTime) as number;
  },

  /**
   * Check if date is before another date
   */
  is_before: (date1: string, date2: string): boolean => {
    if (!date1 || !date2) return false;
    const dt1 = DateTime.fromISO(date1);
    const dt2 = DateTime.fromISO(date2);
    return dt1.isValid && dt2.isValid && dt1 < dt2;
  },

  /**
   * Check if date is after another date
   */
  is_after: (date1: string, date2: string): boolean => {
    if (!date1 || !date2) return false;
    const dt1 = DateTime.fromISO(date1);
    const dt2 = DateTime.fromISO(date2);
    return dt1.isValid && dt2.isValid && dt1 > dt2;
  },

  /**
   * Get relative time string (e.g., "2 days ago")
   */
  relative: (isoDate: string): string | null => {
    if (!isoDate) return null;
    const dt = DateTime.fromISO(isoDate);
    return dt.isValid ? dt.toRelative() : null;
  },

  /**
   * Parse a duration string into milliseconds.
   * Accepts ISO ("PT1H30M", "P1D"), human ("5s", "1m", "2h", "1h30m"),
   * or plain numbers (treated as ms).
   * Returns null for invalid input.
   */
  duration: (input: string | number): number | null => parseDurationToMs(input),
};
