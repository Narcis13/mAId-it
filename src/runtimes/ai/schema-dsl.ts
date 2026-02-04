/**
 * Schema DSL Parser for FlowScript
 *
 * Parses TypeScript-like schema syntax into Zod schemas.
 * Enables users to declare output schemas inline with familiar syntax
 * instead of verbose Zod API calls.
 *
 * @example
 * parseSchemaDSL("string") // => z.string()
 * parseSchemaDSL("number[]") // => z.array(z.number())
 * parseSchemaDSL("{name: string}") // => z.object({name: z.string()})
 * parseSchemaDSL("{user: {name: string}, tags: string[]}")
 *   // => z.object({user: z.object({name: z.string()}), tags: z.array(z.string())})
 */

import { z } from 'zod';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when schema DSL parsing fails.
 */
export class SchemaDSLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaDSLError';
    Object.setPrototypeOf(this, SchemaDSLError.prototype);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Split string by comma, but respect nested braces.
 * "{a: {b: string}, c: number}" should split the inner content to ["a: {b: string}", "c: number"]
 *
 * @param str - The string to split (without outer braces)
 * @returns Array of comma-separated parts
 */
function splitByCommaRespectingBraces(str: string): string[] {
  const pairs: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of str) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === ',' && depth === 0) {
      if (current.trim()) {
        pairs.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    pairs.push(current.trim());
  }

  return pairs;
}

/**
 * Find first colon that isn't inside braces.
 * For "user: {name: string}", should return 4 (the first colon).
 *
 * @param str - The string to search
 * @returns Index of first colon outside braces, or -1 if not found
 */
function findFirstColonOutsideBraces(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === ':' && depth === 0) {
      return i;
    }
  }
  return -1;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parses a TypeScript-like schema DSL string into a Zod schema.
 *
 * **Supported syntax:**
 * - Primitives: `string`, `number`, `boolean`
 * - Arrays: `string[]`, `number[]`, `Type[]`
 * - Objects: `{key: Type, key2: Type2}`
 * - Nested: `{user: {name: string}, tags: string[]}`
 *
 * @param dsl - The schema DSL string to parse
 * @returns A Zod schema corresponding to the DSL
 * @throws {SchemaDSLError} If the syntax is invalid
 *
 * @example
 * ```ts
 * const schema = parseSchemaDSL("{name: string, age: number}");
 * schema.safeParse({ name: "Alice", age: 30 }); // => { success: true, data: {...} }
 * ```
 */
export function parseSchemaDSL(dsl: string): z.ZodType {
  const trimmed = dsl.trim();

  // Primitive types
  if (trimmed === 'string') return z.string();
  if (trimmed === 'number') return z.number();
  if (trimmed === 'boolean') return z.boolean();

  // Array types: Type[]
  if (trimmed.endsWith('[]')) {
    const elementType = trimmed.slice(0, -2);
    return z.array(parseSchemaDSL(elementType));
  }

  // Object types: {key: Type, ...}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') {
      return z.object({});
    }

    const shape: Record<string, z.ZodType> = {};
    const pairs = splitByCommaRespectingBraces(inner);

    for (const pair of pairs) {
      const colonIndex = findFirstColonOutsideBraces(pair);
      if (colonIndex === -1) {
        throw new SchemaDSLError(`Invalid schema syntax: missing colon in "${pair}"`);
      }

      const key = pair.slice(0, colonIndex).trim();
      const valueType = pair.slice(colonIndex + 1).trim();

      if (!key) {
        throw new SchemaDSLError(`Invalid schema syntax: empty key in "${pair}"`);
      }
      if (!valueType) {
        throw new SchemaDSLError(`Invalid schema syntax: empty type for key "${key}"`);
      }

      shape[key] = parseSchemaDSL(valueType);
    }

    return z.object(shape);
  }

  throw new SchemaDSLError(`Unknown schema type: "${trimmed}"`);
}
