/**
 * File Source Runtime
 *
 * Reads data from local files with template path support.
 * Automatically detects JSON vs text format.
 */

import type { NodeRuntime, FileSourceConfig, ExecutionParams } from '../types';
import { FileError } from '../errors';
import { resolveTemplatePath, detectFormat } from './path';
import { parseCSV } from './csv';
import { parseYAML } from './yaml';

// ============================================================================
// File Source Runtime
// ============================================================================

/**
 * Runtime implementation for reading files.
 *
 * Features:
 * - Template paths with {{expressions}}
 * - Auto-detection of JSON vs text format
 * - Optimized JSON parsing via Bun.file().json()
 * - Existence checking with clear error messages
 *
 * @example
 * ```ts
 * const runtime = fileSourceRuntime;
 * const data = await runtime.execute({
 *   node: nodeAst,
 *   input: undefined,
 *   config: { path: 'data/{{config.env}}/users.json' },
 *   state: executionState,
 * });
 * ```
 */
class FileSourceRuntime implements NodeRuntime<FileSourceConfig, void, unknown> {
  readonly type = 'file:source';

  async execute(params: ExecutionParams<FileSourceConfig, void>): Promise<unknown> {
    const { config, state } = params;

    // Resolve template path (validates security)
    const resolvedPath = resolveTemplatePath(config.path, state);

    // Get BunFile handle
    const file = Bun.file(resolvedPath);

    // Check existence
    if (!(await file.exists())) {
      throw new FileError(`File not found: ${resolvedPath}`, resolvedPath, 'ENOENT');
    }

    // Determine format (explicit config or detect from extension)
    const format = config.format === 'auto' || config.format === undefined
      ? detectFormat(resolvedPath)
      : config.format;

    // Read file based on format
    if (format === 'json') {
      return file.json();
    }

    const text = await file.text();

    if (format === 'csv') {
      return parseCSV(text);
    }

    if (format === 'yaml') {
      return parseYAML(text);
    }

    return text;
  }
}

/**
 * Singleton instance of the File Source runtime.
 */
export const fileSourceRuntime = new FileSourceRuntime();
