/**
 * YAML Frontmatter Parser
 *
 * Parses YAML frontmatter from .flow.md files into WorkflowMetadata.
 * Uses Bun.YAML for safe YAML parsing (prevents deserialization attacks).
 */

import type { WorkflowMetadata, SourceLocation } from '../types';
import type { FileSections, SplitResult } from './types';
import { createError, type ValidationError } from '../types/errors';
import { buildLineOffsets, createLocation } from './location';

/**
 * Split a .flow.md file into frontmatter and body sections.
 * Frontmatter must be at the start, delimited by --- on its own lines.
 */
export function splitFile(source: string): SplitResult {
  // Check for frontmatter delimiter at start
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    return {
      success: false,
      error: 'File must start with YAML frontmatter (---)',
      line: 1,
    };
  }

  // Find closing delimiter
  const startDelimiterLength = source.startsWith('---\r\n') ? 5 : 4;
  const closingIndex = source.indexOf('\n---\n', startDelimiterLength);
  const closingIndexCRLF = source.indexOf('\r\n---\r\n', startDelimiterLength);

  let actualClosingIndex: number;
  let closingDelimiterLength: number;

  if (closingIndex === -1 && closingIndexCRLF === -1) {
    return {
      success: false,
      error: 'Could not find closing frontmatter delimiter (---)',
      line: 1,
    };
  }

  if (closingIndex !== -1 && (closingIndexCRLF === -1 || closingIndex < closingIndexCRLF)) {
    actualClosingIndex = closingIndex;
    closingDelimiterLength = 5; // \n---\n
  } else {
    actualClosingIndex = closingIndexCRLF;
    closingDelimiterLength = 7; // \r\n---\r\n
  }

  const frontmatter = source.slice(startDelimiterLength, actualClosingIndex);
  const frontmatterStart = startDelimiterLength;
  const frontmatterEnd = actualClosingIndex;

  // Count lines in frontmatter section (including delimiters)
  const frontmatterSection = source.slice(0, actualClosingIndex + closingDelimiterLength);
  const frontmatterLineCount = frontmatterSection.split('\n').length - 1;

  const bodyStart = actualClosingIndex + closingDelimiterLength;
  const body = source.slice(bodyStart);

  // Check if body is empty or whitespace only
  if (body.trim() === '') {
    return {
      success: false,
      error: 'File must contain XML body after frontmatter',
      line: frontmatterLineCount + 1,
    };
  }

  return {
    success: true,
    sections: {
      frontmatter,
      frontmatterStart,
      frontmatterEnd,
      frontmatterLineCount,
      body,
      bodyStart,
    },
  };
}

/**
 * Parse result for frontmatter parsing.
 */
export type FrontmatterResult =
  | { success: true; metadata: WorkflowMetadata }
  | { success: false; errors: ValidationError[] };

/**
 * Parse YAML frontmatter into WorkflowMetadata.
 * Uses Bun.YAML which is safe by default (no arbitrary code execution).
 */
export function parseFrontmatter(
  yaml: string,
  lineOffsets: number[],
  frontmatterStart: number
): FrontmatterResult {
  let parsed: unknown;

  try {
    // Bun.YAML.parse is safe by default - no code execution
    parsed = Bun.YAML.parse(yaml);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract line number from YAML error message
    // Common format: "YAML Error at line X, column Y: message"
    const lineMatch = errorMessage.match(/line\s+(\d+)/i);
    const errorLine = lineMatch && lineMatch[1] ? parseInt(lineMatch[1], 10) : 1;

    // Calculate location in original file
    const originalLine = errorLine + 1; // +1 for opening ---
    const loc = createLocation(frontmatterStart, frontmatterStart, lineOffsets);

    return {
      success: false,
      errors: [
        createError(
          'PARSE_YAML_INVALID',
          `Invalid YAML in frontmatter: ${errorMessage}`,
          { ...loc, start: { ...loc.start, line: originalLine } },
          ['Check YAML syntax', 'Ensure proper indentation']
        ),
      ],
    };
  }

  // Validate that parsed YAML is an object
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      success: false,
      errors: [
        createError(
          'PARSE_YAML_INVALID',
          'Frontmatter must be a YAML object',
          createLocation(frontmatterStart, frontmatterStart, lineOffsets),
          ['Frontmatter should contain key-value pairs']
        ),
      ],
    };
  }

  const data = parsed as Record<string, unknown>;

  // Validate required fields
  const errors: ValidationError[] = [];

  if (typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        'Frontmatter must include a "name" field',
        createLocation(frontmatterStart, frontmatterStart, lineOffsets),
        ['Add name: "your-workflow-name" to frontmatter']
      )
    );
  }

  if (typeof data.version !== 'string') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        'Frontmatter must include a "version" field',
        createLocation(frontmatterStart, frontmatterStart, lineOffsets),
        ['Add version: "1.0.0" to frontmatter']
      )
    );
  }

  // Validate semver format: X.Y.Z or X.Y
  const semverPattern = /^\d+\.\d+(\.\d+)?$/;
  if (typeof data.version === 'string' && !semverPattern.test(data.version)) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Invalid version format "${data.version}"`,
        createLocation(frontmatterStart, frontmatterStart, lineOffsets),
        [
          'Version must be in semver format: X.Y.Z or X.Y',
          'Examples: "1.0.0", "2.1", "0.0.1"'
        ]
      )
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build metadata object with proper typing
  const metadata: WorkflowMetadata = {
    name: data.name as string,
    version: data.version as string,
    description: typeof data.description === 'string' ? data.description : undefined,
    trigger: parseTrigger(data.trigger),
    config: parseConfig(data.config),
    secrets: parseSecrets(data.secrets),
    schemas: typeof data.schemas === 'object' && data.schemas !== null
      ? (data.schemas as Record<string, unknown>)
      : undefined,
  };

  return { success: true, metadata };
}

/**
 * Parse trigger configuration from frontmatter.
 */
function parseTrigger(
  value: unknown
): { type: 'manual' | 'webhook' | 'schedule'; config?: Record<string, unknown> } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    if (value === 'manual' || value === 'webhook' || value === 'schedule') {
      return { type: value };
    }
    return { type: 'manual' };
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const type = typeof obj.type === 'string' &&
      (obj.type === 'manual' || obj.type === 'webhook' || obj.type === 'schedule')
        ? obj.type
        : 'manual';
    const config = typeof obj.config === 'object' && obj.config !== null
      ? (obj.config as Record<string, unknown>)
      : undefined;
    return { type, config };
  }

  return undefined;
}

/**
 * Parse config fields from frontmatter.
 */
function parseConfig(value: unknown): Record<string, {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default?: unknown;
  required?: boolean;
  description?: string;
}> | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const config: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    default?: unknown;
    required?: boolean;
    description?: string;
  }> = {};

  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
      const field = fieldValue as Record<string, unknown>;
      const type = typeof field.type === 'string' &&
        ['string', 'number', 'boolean', 'object', 'array'].includes(field.type)
          ? (field.type as 'string' | 'number' | 'boolean' | 'object' | 'array')
          : 'string';

      config[key] = {
        type,
        default: field.default,
        required: typeof field.required === 'boolean' ? field.required : undefined,
        description: typeof field.description === 'string' ? field.description : undefined,
      };
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Parse secrets array from frontmatter.
 */
function parseSecrets(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const secrets = value.filter((item): item is string => typeof item === 'string');
  return secrets.length > 0 ? secrets : undefined;
}
