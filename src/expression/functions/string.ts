/**
 * String Functions for FlowScript Expressions
 *
 * Safe string manipulation functions available in workflow expressions.
 * All functions handle null/undefined inputs gracefully.
 */

export const stringFunctions = {
  /**
   * Convert string to uppercase
   */
  upper: (s: string): string => String(s ?? '').toUpperCase(),

  /**
   * Convert string to lowercase
   */
  lower: (s: string): string => String(s ?? '').toLowerCase(),

  /**
   * Remove leading and trailing whitespace
   */
  trim: (s: string): string => String(s ?? '').trim(),

  /**
   * Replace all occurrences of old with replacement
   */
  replace: (s: string, old: string, repl: string): string =>
    String(s ?? '').replaceAll(old ?? '', repl ?? ''),

  /**
   * Split string by delimiter into array
   */
  split: (s: string, delim: string): string[] => String(s ?? '').split(delim ?? ''),

  /**
   * Join array elements with delimiter
   */
  join: (arr: unknown[], delim: string): string => (arr ?? []).join(delim ?? ''),

  /**
   * Truncate string to length, adding suffix if truncated
   */
  truncate: (s: string, len: number, suffix = '...'): string => {
    const str = String(s ?? '');
    if (str.length <= len) return str;
    return str.slice(0, len - suffix.length) + suffix;
  },

  /**
   * Concatenate multiple strings
   */
  concat: (...args: string[]): string => args.map((a) => String(a ?? '')).join(''),

  /**
   * Check if string includes substring
   */
  includes: (s: string, search: string): boolean =>
    String(s ?? '').includes(search ?? ''),

  /**
   * Check if string starts with prefix
   */
  starts_with: (s: string, prefix: string): boolean =>
    String(s ?? '').startsWith(prefix ?? ''),

  /**
   * Check if string ends with suffix
   */
  ends_with: (s: string, suffix: string): boolean =>
    String(s ?? '').endsWith(suffix ?? ''),

  /**
   * Extract substring from start to end index
   */
  substring: (s: string, start: number, end?: number): string =>
    String(s ?? '').substring(start ?? 0, end),

  /**
   * Pad string at start to target length
   */
  pad_start: (s: string, len: number, fill = ' '): string =>
    String(s ?? '').padStart(len ?? 0, fill),

  /**
   * Pad string at end to target length
   */
  pad_end: (s: string, len: number, fill = ' '): string =>
    String(s ?? '').padEnd(len ?? 0, fill),

  /**
   * Repeat string n times
   */
  repeat: (s: string, count: number): string => String(s ?? '').repeat(count ?? 0),

  /**
   * Get character at index
   */
  char_at: (s: string, index: number): string => String(s ?? '').charAt(index ?? 0),

  /**
   * Get length of string
   */
  len: (s: string): number => String(s ?? '').length,
};
