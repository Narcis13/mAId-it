/**
 * Path Utilities for File Runtime
 *
 * Provides template path resolution, security validation against path traversal,
 * and format detection.
 */

import { resolve as pathResolve } from 'path';
import { evaluateTemplateInContext } from '../../execution';
import { PathTraversalError } from '../errors';
import type { ExecutionState } from '../../execution';

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Validate a path for security concerns.
 *
 * Uses path.resolve() to normalize the path and verifies the resolved path
 * stays within the allowed base directory. This catches:
 * - Path traversal (../, ..\, URL-encoded variants like ..%2F)
 * - Absolute paths (starting with / or Windows drive like C:\)
 * - Null byte injection
 *
 * @param filePath - The path to validate
 * @param baseDir - Base directory to constrain paths within (defaults to cwd)
 * @throws PathTraversalError if path is unsafe
 */
export function validatePath(filePath: string, baseDir?: string): void {
  const base = baseDir ?? process.cwd();

  // Block null bytes
  if (filePath.includes('\0')) {
    throw new PathTraversalError(`Path traversal not allowed: ${filePath}`, filePath);
  }

  // URL-decode the path to catch encoded traversals like ..%2F
  let decoded: string;
  try {
    decoded = decodeURIComponent(filePath);
  } catch {
    decoded = filePath;
  }

  // Block null bytes in decoded form too
  if (decoded.includes('\0')) {
    throw new PathTraversalError(`Path traversal not allowed: ${filePath}`, filePath);
  }

  // Normalize backslashes to forward slashes
  const normalized = decoded.replace(/\\/g, '/');

  // Check for Windows absolute paths (e.g., C:\, D:\)
  if (/^[A-Za-z]:[\\/]/.test(decoded)) {
    throw new PathTraversalError(`Path traversal not allowed: ${filePath}`, filePath);
  }

  // Resolve to absolute path and verify it stays within base
  const resolvedBase = pathResolve(base);
  const resolved = pathResolve(base, normalized);

  if (!resolved.startsWith(resolvedBase + '/') && resolved !== resolvedBase) {
    throw new PathTraversalError(`Path traversal not allowed: ${filePath}`, filePath);
  }
}

// ============================================================================
// Template Path Resolution
// ============================================================================

/**
 * Resolve a template path string in the context of workflow execution.
 *
 * Resolves {{expressions}} in the path and validates the result.
 *
 * @param template - Path template with optional {{expressions}}
 * @param state - The current execution state
 * @param baseDir - Base directory to constrain paths within (defaults to cwd)
 * @returns Resolved path string
 * @throws PathTraversalError if resolved path is unsafe
 * @throws ExpressionError if template evaluation fails
 */
export function resolveTemplatePath(
  template: string,
  state: ExecutionState,
  baseDir?: string
): string {
  // Resolve template expressions
  const resolved = evaluateTemplateInContext(template, state);

  // Validate resolved path type
  if (typeof resolved !== 'string') {
    throw new PathTraversalError(
      `Path template resolved to non-string: ${typeof resolved}`,
      String(resolved)
    );
  }

  // Validate path security
  validatePath(resolved, baseDir);

  return resolved;
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect file format based on file extension.
 *
 * @param path - File path to analyze
 * @returns Detected format based on extension
 */
export function detectFormat(path: string): 'json' | 'csv' | 'yaml' | 'text' {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  return 'text';
}
