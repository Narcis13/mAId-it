/**
 * Built-in Functions Registry for FlowScript Expressions
 *
 * Central registry that exports all built-in functions for use in expression evaluation.
 * Functions are organized by category: string, array, math, time, object, type, and utility.
 */

import { stringFunctions } from './string';
import { arrayFunctions } from './array';
import { mathFunctions } from './math';
import { timeFunctions } from './time';
import { objectFunctions } from './object';
import { typeFunctions } from './type';

/**
 * Additional utility functions for encoding, UUID generation, and regex operations
 */
const utilityFunctions = {
  // JSON encoding/decoding
  /**
   * Encode value as JSON string
   */
  json_encode: (obj: unknown): string => JSON.stringify(obj),

  /**
   * Decode JSON string to value (returns null on parse error)
   */
  json_decode: (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  },

  // Base64 encoding/decoding
  /**
   * Encode string as base64
   */
  base64_encode: (s: string): string => btoa(String(s ?? '')),

  /**
   * Decode base64 string (returns null on decode error)
   */
  base64_decode: (s: string): string | null => {
    try {
      return atob(String(s ?? ''));
    } catch {
      return null;
    }
  },

  // URL encoding/decoding
  /**
   * URL-encode string
   */
  url_encode: (s: string): string => encodeURIComponent(String(s ?? '')),

  /**
   * URL-decode string (returns original on decode error)
   */
  url_decode: (s: string): string => {
    try {
      return decodeURIComponent(String(s ?? ''));
    } catch {
      return s;
    }
  },

  // UUID generation
  /**
   * Generate random UUID v4
   */
  uuid: (): string => crypto.randomUUID(),

  // Regex operations
  /**
   * Match string against pattern, return first match or null
   */
  match: (s: string, pattern: string): string | null => {
    try {
      const regex = new RegExp(pattern);
      const match = String(s ?? '').match(regex);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  },

  /**
   * Test if string matches pattern
   */
  test: (s: string, pattern: string): boolean => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(String(s ?? ''));
    } catch {
      return false;
    }
  },

  /**
   * Extract all matches from string
   */
  match_all: (s: string, pattern: string): string[] => {
    try {
      const regex = new RegExp(pattern, 'g');
      return [...String(s ?? '').matchAll(regex)].map((m) => m[0]);
    } catch {
      return [];
    }
  },

  // Hashing (simple hash for non-cryptographic use)
  /**
   * Simple string hash (djb2 algorithm) - NOT cryptographic
   */
  hash: (s: string): number => {
    const str = String(s ?? '');
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  },

  // Debug/introspection
  /**
   * Pretty-print value as formatted JSON
   */
  pretty: (val: unknown, indent = 2): string => {
    try {
      return JSON.stringify(val, null, indent);
    } catch {
      return String(val);
    }
  },
};

/**
 * Get all built-in functions as a Record<string, Function>.
 * This is passed to the evaluator as the function context.
 *
 * @returns Record containing all built-in functions by name
 */
export function getBuiltinFunctions(): Record<string, Function> {
  return {
    ...stringFunctions,
    ...arrayFunctions,
    ...mathFunctions,
    ...timeFunctions,
    ...objectFunctions,
    ...typeFunctions,
    ...utilityFunctions,
  };
}

// Re-export individual function sets for testing and selective imports
export {
  stringFunctions,
  arrayFunctions,
  mathFunctions,
  timeFunctions,
  objectFunctions,
  typeFunctions,
  utilityFunctions,
};
