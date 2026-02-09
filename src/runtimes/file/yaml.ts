/**
 * YAML Parsing and Serialization
 *
 * Uses Bun.YAML (built-in, safe by default).
 */

/**
 * Parse a YAML string into a JS value.
 */
export function parseYAML(text: string): unknown {
  return Bun.YAML.parse(text);
}

/**
 * Convert a JS value to YAML string.
 */
export function toYAML(data: unknown): string {
  return Bun.YAML.stringify(data);
}
