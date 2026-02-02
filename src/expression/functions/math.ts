/**
 * Math Functions for FlowScript Expressions
 *
 * Safe math operations available in workflow expressions.
 * All functions handle non-numeric inputs gracefully.
 */

export const mathFunctions = {
  /**
   * Get minimum value from arguments
   */
  min: (...args: number[]): number =>
    Math.min(...args.filter((n) => typeof n === 'number')),

  /**
   * Get maximum value from arguments
   */
  max: (...args: number[]): number =>
    Math.max(...args.filter((n) => typeof n === 'number')),

  /**
   * Sum all numbers in array
   */
  sum: (arr: number[]): number =>
    (arr ?? []).reduce((a, b) => a + (Number(b) || 0), 0),

  /**
   * Calculate average of numbers in array
   */
  avg: (arr: number[]): number => {
    const nums = (arr ?? []).filter((n) => typeof n === 'number');
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  },

  /**
   * Round number to specified decimal places
   */
  round: (n: number, decimals = 0): number => {
    const factor = 10 ** decimals;
    return Math.round((Number(n) || 0) * factor) / factor;
  },

  /**
   * Round down to nearest integer
   */
  floor: (n: number): number => Math.floor(Number(n) || 0),

  /**
   * Round up to nearest integer
   */
  ceil: (n: number): number => Math.ceil(Number(n) || 0),

  /**
   * Get absolute value
   */
  abs: (n: number): number => Math.abs(Number(n) || 0),

  /**
   * Raise base to exponent power
   */
  pow: (base: number, exp: number): number =>
    Math.pow(Number(base) || 0, Number(exp) || 0),

  /**
   * Get square root
   */
  sqrt: (n: number): number => Math.sqrt(Number(n) || 0),

  /**
   * Get random number between 0 and 1
   */
  random: (): number => Math.random(),

  /**
   * Get random integer between min and max (inclusive)
   */
  random_int: (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min,

  /**
   * Clamp value between min and max
   */
  clamp: (n: number, min: number, max: number): number =>
    Math.min(Math.max(Number(n) || 0, min), max),

  /**
   * Get modulo (remainder)
   */
  mod: (n: number, divisor: number): number => (Number(n) || 0) % divisor,

  /**
   * Get sign of number (-1, 0, or 1)
   */
  sign: (n: number): number => Math.sign(Number(n) || 0),

  /**
   * Truncate towards zero (remove decimal part)
   */
  trunc: (n: number): number => Math.trunc(Number(n) || 0),

  /**
   * Calculate percentage (value / total * 100)
   */
  percent: (value: number, total: number, decimals = 2): number => {
    if (!total) return 0;
    const pct = (Number(value) / Number(total)) * 100;
    const factor = 10 ** decimals;
    return Math.round(pct * factor) / factor;
  },
};
