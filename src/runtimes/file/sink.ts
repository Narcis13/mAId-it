/**
 * File Sink Runtime
 *
 * Writes data to local files with template path support.
 * Automatically creates parent directories and handles JSON formatting.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NodeRuntime, FileSinkConfig, FileSinkResult, ExecutionParams } from '../types';
import { resolveTemplatePath } from './path';

// ============================================================================
// File Sink Runtime
// ============================================================================

/**
 * Runtime implementation for writing files.
 *
 * Features:
 * - Template paths with {{expressions}}
 * - Auto-creation of parent directories
 * - Pretty-printed JSON by default
 * - Returns bytes written for verification
 *
 * @example
 * ```ts
 * const runtime = fileSinkRuntime;
 * const result = await runtime.execute({
 *   node: nodeAst,
 *   input: { users: [...] },
 *   config: { path: 'output/{{config.env}}/result.json' },
 *   state: executionState,
 * });
 * console.log(`Wrote ${result.bytes} bytes to ${result.path}`);
 * ```
 */
class FileSinkRuntime implements NodeRuntime<FileSinkConfig, unknown, FileSinkResult> {
  readonly type = 'file:sink';

  async execute(params: ExecutionParams<FileSinkConfig, unknown>): Promise<FileSinkResult> {
    const { config, input, state } = params;

    // Resolve template path (validates security)
    const resolvedPath = resolveTemplatePath(config.path, state);

    // Create parent directory if needed (default: true)
    if (config.createDir !== false) {
      const dir = dirname(resolvedPath);
      // Only create if there's a directory component
      if (dir && dir !== '.') {
        await mkdir(dir, { recursive: true });
      }
    }

    // Determine content to write
    let content: string;
    const isObject = input !== null && typeof input === 'object';

    if (config.format === 'json' || (config.format === undefined && isObject)) {
      // Format as JSON (pretty by default)
      const indent = config.pretty !== false ? 2 : 0;
      content = JSON.stringify(input, null, indent);
    } else {
      // Format as text
      content = String(input);
    }

    // Write file using Bun.write (optimized)
    const bytes = await Bun.write(resolvedPath, content);

    return {
      path: resolvedPath,
      bytes,
    };
  }
}

/**
 * Singleton instance of the File Sink runtime.
 */
export const fileSinkRuntime = new FileSinkRuntime();
