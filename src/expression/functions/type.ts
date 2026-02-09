/**
 * Type Functions for FlowScript Expressions
 *
 * Type checking and conversion functions available in workflow expressions.
 * All functions handle edge cases gracefully.
 */

export const typeFunctions = {
  /**
   * Get type of value as string
   * Returns: 'null', 'undefined', 'array', 'object', 'string', 'number', 'boolean', 'function'
   */
  typeof: (val: unknown): string => {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  },

  /**
   * Check if value is null or undefined
   */
  is_null: (val: unknown): boolean => val === null || val === undefined,

  /**
   * Check if value is an array
   */
  is_array: (val: unknown): boolean => Array.isArray(val),

  /**
   * Check if value is a plain object (not null, not array)
   */
  is_object: (val: unknown): boolean =>
    typeof val === 'object' && val !== null && !Array.isArray(val),

  /**
   * Check if value is a string
   */
  is_string: (val: unknown): boolean => typeof val === 'string',

  /**
   * Check if value is a number (excluding NaN)
   */
  is_number: (val: unknown): boolean =>
    typeof val === 'number' && !Number.isNaN(val),

  /**
   * Check if value is a boolean
   */
  is_boolean: (val: unknown): boolean => typeof val === 'boolean',

  /**
   * Check if value is empty (null, undefined, empty string, empty array, empty object)
   */
  is_empty: (val: unknown): boolean => {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.length === 0;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val).length === 0;
    return false;
  },

  /**
   * Convert value to string
   */
  to_string: (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  },

  /**
   * Convert value to number (returns 0 for invalid)
   */
  to_number: (val: unknown): number => {
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  },

  /**
   * Convert value to boolean
   */
  to_boolean: (val: unknown): boolean => Boolean(val),

  /**
   * Convert value to array (wraps non-arrays, returns empty for null/undefined)
   */
  to_array: (val: unknown): unknown[] => {
    if (Array.isArray(val)) return val;
    if (val === null || val === undefined) return [];
    return [val];
  },

  /**
   * Return first non-null/undefined argument
   */
  coalesce: (...args: unknown[]): unknown =>
    args.find((a) => a !== null && a !== undefined),

  /**
   * Return value or default if value is null/undefined
   */
  default: (val: unknown, defaultValue: unknown): unknown =>
    val === null || val === undefined ? defaultValue : val,

  /**
   * Conditional expression (ternary)
   */
  if_else: (condition: unknown, thenValue: unknown, elseValue: unknown): unknown =>
    condition ? thenValue : elseValue,

  /**
   * Check if value is finite number
   */
  is_finite: (val: unknown): boolean =>
    typeof val === 'number' && Number.isFinite(val),

  /**
   * Check if value is an integer
   */
  is_integer: (val: unknown): boolean =>
    typeof val === 'number' && Number.isInteger(val),

  /**
   * Check if value is NaN
   */
  is_nan: (val: unknown): boolean =>
    typeof val === 'number' && Number.isNaN(val),

  /**
   * Check if value is truthy
   */
  is_truthy: (val: unknown): boolean => Boolean(val),

  /**
   * Check if value is falsy
   */
  is_falsy: (val: unknown): boolean => !val,

  /**
   * Dictionary lookup with default.
   * switch(val, cases, defaultVal) — looks up val in cases object, returns defaultVal if not found.
   * Example: switch("a", {"a": 1, "b": 2}, 0) → 1
   */
  switch: (val: unknown, cases: unknown, defaultVal?: unknown): unknown => {
    if (cases === null || cases === undefined || typeof cases !== 'object' || Array.isArray(cases)) {
      return defaultVal ?? null;
    }
    const key = String(val);
    const obj = cases as Record<string, unknown>;
    return key in obj ? obj[key] : (defaultVal ?? null);
  },
};
