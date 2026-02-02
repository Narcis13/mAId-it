/**
 * Array Functions for FlowScript Expressions
 *
 * Safe array manipulation functions available in workflow expressions.
 * All functions handle null/undefined inputs gracefully.
 */

export const arrayFunctions = {
  /**
   * Get length of array or string
   */
  length: (arr: unknown[] | string): number => (arr ?? []).length,

  /**
   * Get first element of array
   */
  first: (arr: unknown[]): unknown => (arr ?? [])[0],

  /**
   * Get last element of array
   */
  last: (arr: unknown[]): unknown => {
    const a = arr ?? [];
    return a[a.length - 1];
  },

  /**
   * Get slice of array from start to end index
   */
  slice: (arr: unknown[], start: number, end?: number): unknown[] =>
    (arr ?? []).slice(start, end),

  /**
   * Flatten nested array by one level
   */
  flatten: (arr: unknown[]): unknown[] => (arr ?? []).flat(),

  /**
   * Get unique elements from array
   */
  unique: (arr: unknown[]): unknown[] => [...new Set(arr ?? [])],

  /**
   * Reverse array order
   */
  reverse: (arr: unknown[]): unknown[] => [...(arr ?? [])].reverse(),

  /**
   * Check if array contains item
   */
  contains: (arr: unknown[], item: unknown): boolean => (arr ?? []).includes(item),

  /**
   * Get index of item in array (-1 if not found)
   */
  index_of: (arr: unknown[], item: unknown): number => (arr ?? []).indexOf(item),

  /**
   * Sort array, optionally by key and direction
   */
  sort: (
    arr: unknown[],
    key?: string,
    dir: 'asc' | 'desc' = 'asc'
  ): unknown[] => {
    const sorted = [...(arr ?? [])].sort((a, b) => {
      const va = key ? (a as Record<string, unknown>)?.[key] : a;
      const vb = key ? (b as Record<string, unknown>)?.[key] : b;
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return va < vb ? -1 : 1;
    });
    return dir === 'desc' ? sorted.reverse() : sorted;
  },

  /**
   * Remove null and undefined values from array
   */
  compact: (arr: unknown[]): unknown[] =>
    (arr ?? []).filter((x) => x !== null && x !== undefined),

  /**
   * Count elements, optionally matching a predicate
   */
  count: (arr: unknown[], predicate?: (item: unknown) => boolean): number =>
    predicate ? (arr ?? []).filter(predicate).length : (arr ?? []).length,

  /**
   * Get element at index (supports negative indices)
   */
  at: (arr: unknown[], index: number): unknown => (arr ?? []).at(index),

  /**
   * Concatenate multiple arrays
   */
  concat: (...arrays: unknown[][]): unknown[] =>
    ([] as unknown[]).concat(...arrays.map((a) => a ?? [])),

  /**
   * Check if all elements match predicate
   */
  every: (arr: unknown[], predicate: (item: unknown) => boolean): boolean =>
    (arr ?? []).every(predicate),

  /**
   * Check if any element matches predicate
   */
  some: (arr: unknown[], predicate: (item: unknown) => boolean): boolean =>
    (arr ?? []).some(predicate),

  /**
   * Find first element matching predicate
   */
  find: (arr: unknown[], predicate: (item: unknown) => boolean): unknown =>
    (arr ?? []).find(predicate),

  /**
   * Take first n elements
   */
  take: (arr: unknown[], n: number): unknown[] => (arr ?? []).slice(0, n),

  /**
   * Skip first n elements
   */
  skip: (arr: unknown[], n: number): unknown[] => (arr ?? []).slice(n),

  /**
   * Create array of integers from start to end (exclusive)
   */
  range: (start: number, end: number, step = 1): number[] => {
    const result: number[] = [];
    for (let i = start; step > 0 ? i < end : i > end; i += step) {
      result.push(i);
    }
    return result;
  },
};
