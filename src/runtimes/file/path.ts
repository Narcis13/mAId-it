/**
 * Path Utilities for File Runtime
 *
 * Provides template path resolution, security validation against path traversal,
 * and format detection.
 */

import { evaluateTemplateInContext } from '../../execution';
import { PathTraversalError } from '../errors';
import type { ExecutionState } from '../../execution';

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Validate a path for security concerns.
 *
 * Blocks:
 * - Path traversal (../ or ..\)
 * - Absolute paths (starting with / or Windows drive like C:\)
 *
 * @param path - The path to validate
 * @throws PathTraversalError if path is unsafe
 */
export function validatePath(path: string): void {
  // Normalize backslashes to forward slashes for consistent checking
  const normalized = path.replace(/\\/g, '/');

  // Check for path traversal
  if (normalized.includes('../') || path.includes('..\\')) {
    throw new PathTraversalError(`Path traversal not allowed: ${path}`, path);
  }

  // Check for absolute paths (Unix or Windows)
  if (normalized.startsWith('/')) {
    throw new PathTraversalError(`Path traversal not allowed: ${path}`, path);
  }

  // Check for Windows absolute paths (e.g., C:\, D:\)
  if (/^[A-Za-z]:[\\/]/.test(path)) {
    throw new PathTraversalError(`Path traversal not allowed: ${path}`, path);
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
 * @returns Resolved path string
 * @throws PathTraversalError if resolved path is unsafe
 * @throws ExpressionError if template evaluation fails
 */
export function resolveTemplatePath(template: string, state: ExecutionState): string {
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
  validatePath(resolved);

  return resolved;
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect file format based on file extension.
 *
 * @param path - File path to analyze
 * @returns 'json' for .json files, 'text' otherwise
 */
export function detectFormat(path: string): 'json' | 'text' {
  return path.toLowerCase().endsWith('.json') ? 'json' : 'text';
}
