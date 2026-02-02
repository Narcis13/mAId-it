/**
 * FlowScript Parser
 *
 * Main entry point for parsing .flow.md workflow files.
 * Orchestrates YAML frontmatter and XML body parsing into a complete AST.
 */

import type { WorkflowAST } from '../types';
import type { ParseResult, ValidationError } from '../types/errors';
import { createError } from '../types/errors';
import { splitFile, parseFrontmatter } from './frontmatter';
import { parseBody } from './body';
import { buildLineOffsets, createSourceMap } from './location';

/**
 * Parse a .flow.md file into a complete WorkflowAST.
 *
 * @param source - The complete file content as a string
 * @param filePath - Path to the file (for error messages)
 * @returns ParseResult containing either the AST or validation errors
 *
 * @example
 * ```typescript
 * const source = await Bun.file('workflow.flow.md').text();
 * const result = parse(source, 'workflow.flow.md');
 *
 * if (result.success) {
 *   console.log(result.data.metadata.name);
 *   console.log(result.data.nodes.length);
 * } else {
 *   for (const error of result.errors) {
 *     console.error(`${error.loc?.start.line}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function parse(source: string, filePath: string): ParseResult<WorkflowAST> {
  const errors: ValidationError[] = [];

  // Step 1: Build source map for location tracking
  const sourceMap = createSourceMap(source, filePath);
  const lineOffsets = sourceMap.lineOffsets;

  // Step 2: Split file into frontmatter and body sections
  const splitResult = splitFile(source);

  if (!splitResult.success) {
    const errorCode = splitResult.error.includes('frontmatter')
      ? 'PARSE_MISSING_FRONTMATTER'
      : 'PARSE_MISSING_BODY';

    return {
      success: false,
      errors: [
        createError(
          errorCode as 'PARSE_MISSING_FRONTMATTER' | 'PARSE_MISSING_BODY',
          splitResult.error,
          {
            start: { line: splitResult.line || 1, column: 0, offset: 0 },
            end: { line: splitResult.line || 1, column: 0, offset: 0 },
          }
        ),
      ],
    };
  }

  const { sections } = splitResult;

  // Step 3: Parse YAML frontmatter
  const frontmatterResult = parseFrontmatter(
    sections.frontmatter,
    lineOffsets,
    sections.frontmatterStart
  );

  if (!frontmatterResult.success) {
    errors.push(...frontmatterResult.errors);
  }

  // Step 4: Parse XML body
  const bodyResult = parseBody(
    sections.body,
    sections.frontmatterLineCount,
    sections.bodyStart,
    source
  );

  if (!bodyResult.success) {
    errors.push(...bodyResult.errors);
  }

  // Return errors if any occurred
  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Step 5: Assemble complete AST
  const ast: WorkflowAST = {
    metadata: frontmatterResult.success ? frontmatterResult.metadata : {
      name: '',
      version: '',
    },
    nodes: bodyResult.success ? bodyResult.nodes : [],
    sourceMap,
  };

  return { success: true, data: ast };
}

/**
 * Parse a .flow.md file from disk.
 *
 * @param filePath - Path to the .flow.md file
 * @returns ParseResult containing either the AST or validation errors
 *
 * @example
 * ```typescript
 * const result = await parseFile('./workflows/my-workflow.flow.md');
 *
 * if (result.success) {
 *   console.log('Parsed workflow:', result.data.metadata.name);
 * }
 * ```
 */
export async function parseFile(filePath: string): Promise<ParseResult<WorkflowAST>> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return {
        success: false,
        errors: [
          createError(
            'PARSE_MISSING_FRONTMATTER',
            `File not found: ${filePath}`,
            {
              start: { line: 1, column: 0, offset: 0 },
              end: { line: 1, column: 0, offset: 0 },
            }
          ),
        ],
      };
    }

    const source = await file.text();
    return parse(source, filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errors: [
        createError(
          'PARSE_MISSING_FRONTMATTER',
          `Error reading file: ${message}`,
          {
            start: { line: 1, column: 0, offset: 0 },
            end: { line: 1, column: 0, offset: 0 },
          }
        ),
      ],
    };
  }
}

// Re-export types and utilities that may be useful externally
export { createSourceMap, buildLineOffsets, createLocation, adjustLocation, findOffset } from './location';
export { splitFile, parseFrontmatter } from './frontmatter';
export { parseBody } from './body';
export type { FileSections, SplitResult, RawXMLNode } from './types';
