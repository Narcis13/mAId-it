/**
 * Object Functions for FlowScript Expressions
 *
 * Safe object manipulation functions available in workflow expressions.
 * All functions handle null/undefined inputs gracefully.
 */

export const objectFunctions = {
  /**
   * Get keys of object as array
   */
  keys: (obj: object): string[] => Object.keys(obj ?? {}),

  /**
   * Get values of object as array
   */
  values: (obj: object): unknown[] => Object.values(obj ?? {}),

  /**
   * Get entries of object as [key, value] pairs
   */
  entries: (obj: object): [string, unknown][] => Object.entries(obj ?? {}),

  /**
   * Create object from [key, value] entries
   */
  from_entries: (entries: [string, unknown][]): Record<string, unknown> =>
    Object.fromEntries(entries ?? []),

  /**
   * Get nested value by dot-separated path
   */
  get: (obj: object, path: string, defaultValue?: unknown): unknown => {
    if (!obj || !path) return defaultValue;
    const parts = path.split('.');
    let val: unknown = obj;
    for (const part of parts) {
      if (val === null || val === undefined) return defaultValue;
      val = (val as Record<string, unknown>)[part];
    }
    return val ?? defaultValue;
  },

  /**
   * Check if object has key
   */
  has: (obj: object, key: string): boolean =>
    obj != null && key in (obj as object),

  /**
   * Merge multiple objects (shallow)
   */
  merge: (...objects: object[]): Record<string, unknown> =>
    Object.assign({}, ...objects.filter((o) => o != null)),

  /**
   * Pick specified keys from object
   */
  pick: (obj: object, keys: string[]): Record<string, unknown> => {
    if (!obj) return {};
    return Object.fromEntries(
      (keys ?? [])
        .filter((k) => k in obj)
        .map((k) => [k, (obj as Record<string, unknown>)[k]])
    );
  },

  /**
   * Omit specified keys from object
   */
  omit: (obj: object, keys: string[]): Record<string, unknown> => {
    if (!obj) return {};
    const set = new Set(keys ?? []);
    return Object.fromEntries(Object.entries(obj).filter(([k]) => !set.has(k)));
  },

  /**
   * Get number of keys in object
   */
  size: (obj: object): number => Object.keys(obj ?? {}).length,

  /**
   * Set nested value by dot-separated path (returns new object)
   */
  set: (obj: object, path: string, value: unknown): Record<string, unknown> => {
    if (!path) return obj as Record<string, unknown>;
    const result = { ...(obj ?? {}) } as Record<string, unknown>;
    const parts = path.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current[part] = { ...(current[part] as object) };
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
    return result;
  },

  /**
   * Delete key from object (returns new object)
   */
  delete: (obj: object, key: string): Record<string, unknown> => {
    if (!obj || !key) return (obj ?? {}) as Record<string, unknown>;
    const result = { ...obj } as Record<string, unknown>;
    delete result[key];
    return result;
  },

  /**
   * Check if two objects are deeply equal
   */
  equals: (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      objectFunctions.equals(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  },

  /**
   * Deep clone an object
   */
  clone: (obj: unknown): unknown => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(objectFunctions.clone);
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, objectFunctions.clone(v)])
    );
  },
};
