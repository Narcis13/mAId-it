/**
 * CLI Error Formatter
 *
 * Provides compiler-style error formatting with source code context
 * using @babel/code-frame for beautiful error output.
 */

import { codeFrameColumns } from '@babel/code-frame';
import chalk from 'chalk';
import type { ValidationError, ValidationResult } from '../types/errors';

/**
 * Formatter options.
 */
export interface FormatOptions {
  /** Enable colored output (default: true) */
  color?: boolean;
  /** Show source code context (default: true) */
  context?: boolean;
  /** Number of context lines to show (default: 2) */
  contextLines?: number;
  /** Format for output ('text' | 'json') */
  format?: 'text' | 'json';
}

const defaultOptions: Required<FormatOptions> = {
  color: true,
  context: true,
  contextLines: 2,
  format: 'text',
};

/**
 * Format a single validation error with source context.
 *
 * @param error - The validation error to format
 * @param source - The source code string
 * @param filePath - The file path for display
 * @param options - Formatting options
 * @returns Formatted error string
 */
export function formatError(
  error: ValidationError,
  source: string,
  filePath: string,
  options: FormatOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };
  const c = opts.color ? chalk : new chalk.Instance({ level: 0 });

  // Build location string
  let locationStr = filePath;
  if (error.loc) {
    locationStr += `:${error.loc.start.line}:${error.loc.start.column}`;
  }

  // Severity prefix with color
  const severityPrefix = error.severity === 'error'
    ? c.red.bold('error')
    : c.yellow.bold('warning');

  // Error code
  const codeStr = c.gray(`[${error.code}]`);

  // Main error line
  let output = `${severityPrefix}${codeStr}: ${error.message}\n`;
  output += `  ${c.cyan('-->')} ${locationStr}\n`;

  // Add code frame if we have source and location
  if (opts.context && error.loc && source) {
    const frame = codeFrameColumns(
      source,
      {
        start: {
          line: error.loc.start.line,
          column: error.loc.start.column + 1, // code-frame uses 1-indexed columns
        },
        end: error.loc.end ? {
          line: error.loc.end.line,
          column: error.loc.end.column + 1,
        } : undefined,
      },
      {
        highlightCode: opts.color,
        linesAbove: opts.contextLines,
        linesBelow: opts.contextLines,
        message: error.message,
      }
    );
    output += `${frame}\n`;
  }

  // Add hints if available
  if (error.hints && error.hints.length > 0) {
    output += `\n${c.blue.bold('hint')}: ${error.hints[0]}\n`;
    for (let i = 1; i < error.hints.length; i++) {
      output += `      ${error.hints[i]}\n`;
    }
  }

  return output;
}

/**
 * Format validation results for display.
 *
 * @param result - The validation result
 * @param source - The source code string
 * @param filePath - The file path for display
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatValidationResult(
  result: ValidationResult,
  source: string,
  filePath: string,
  options: FormatOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };

  // JSON format
  if (opts.format === 'json') {
    return formatResultAsJson(result, filePath);
  }

  const c = opts.color ? chalk : new chalk.Instance({ level: 0 });
  let output = '';

  // Format all errors
  for (const error of result.errors) {
    output += formatError(error, source, filePath, opts);
    output += '\n';
  }

  // Format all warnings
  for (const warning of result.warnings) {
    output += formatError(warning, source, filePath, opts);
    output += '\n';
  }

  // Summary line
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  if (result.valid) {
    output += c.green.bold(`\nValidation passed`);
    if (warningCount > 0) {
      output += c.yellow(` with ${warningCount} warning${warningCount === 1 ? '' : 's'}`);
    }
    output += '\n';
  } else {
    output += c.red.bold(`\nValidation failed`);
    output += `: ${errorCount} error${errorCount === 1 ? '' : 's'}`;
    if (warningCount > 0) {
      output += `, ${warningCount} warning${warningCount === 1 ? '' : 's'}`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Format validation result as JSON.
 */
function formatResultAsJson(result: ValidationResult, filePath: string): string {
  const jsonResult = {
    valid: result.valid,
    file: filePath,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    errors: result.errors.map(formatErrorAsJson),
    warnings: result.warnings.map(formatErrorAsJson),
  };

  return JSON.stringify(jsonResult, null, 2);
}

/**
 * Format a single error as JSON-serializable object.
 */
function formatErrorAsJson(error: ValidationError) {
  return {
    code: error.code,
    severity: error.severity,
    message: error.message,
    location: error.loc ? {
      line: error.loc.start.line,
      column: error.loc.start.column,
      endLine: error.loc.end?.line,
      endColumn: error.loc.end?.column,
    } : null,
    hints: error.hints || [],
  };
}

/**
 * Format parse errors for display.
 *
 * @param errors - Array of validation errors from parsing
 * @param source - The source code string (may be partial)
 * @param filePath - The file path for display
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatParseErrors(
  errors: ValidationError[],
  source: string,
  filePath: string,
  options: FormatOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };

  // JSON format
  if (opts.format === 'json') {
    return formatParseErrorsAsJson(errors, filePath);
  }

  const c = opts.color ? chalk : new chalk.Instance({ level: 0 });
  let output = '';

  for (const error of errors) {
    output += formatError(error, source, filePath, opts);
    output += '\n';
  }

  output += c.red.bold(`\nParse failed`);
  output += `: ${errors.length} error${errors.length === 1 ? '' : 's'}\n`;

  return output;
}

/**
 * Format parse errors as JSON.
 */
function formatParseErrorsAsJson(errors: ValidationError[], filePath: string): string {
  const jsonResult = {
    valid: false,
    file: filePath,
    stage: 'parse',
    errorCount: errors.length,
    errors: errors.map(formatErrorAsJson),
  };

  return JSON.stringify(jsonResult, null, 2);
}

/**
 * Format a success message.
 *
 * @param filePath - The file path
 * @param nodeCount - Number of nodes in the workflow
 * @param options - Formatting options
 * @returns Formatted success string
 */
export function formatSuccess(
  filePath: string,
  nodeCount: number,
  options: FormatOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };

  if (opts.format === 'json') {
    return JSON.stringify({
      valid: true,
      file: filePath,
      nodeCount,
      errorCount: 0,
      warningCount: 0,
      errors: [],
      warnings: [],
    }, null, 2);
  }

  const c = opts.color ? chalk : new chalk.Instance({ level: 0 });
  return `${c.green.bold('Valid')} ${filePath} (${nodeCount} node${nodeCount === 1 ? '' : 's'})\n`;
}

/**
 * Format file not found error.
 *
 * @param filePath - The file path that was not found
 * @param options - Formatting options
 * @returns Formatted error string
 */
export function formatFileNotFound(
  filePath: string,
  options: FormatOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };

  if (opts.format === 'json') {
    return JSON.stringify({
      valid: false,
      file: filePath,
      stage: 'read',
      errorCount: 1,
      errors: [{
        code: 'FILE_NOT_FOUND',
        severity: 'error',
        message: `File not found: ${filePath}`,
        location: null,
        hints: ['Check that the file path is correct', 'Ensure the file exists'],
      }],
    }, null, 2);
  }

  const c = opts.color ? chalk : new chalk.Instance({ level: 0 });
  let output = `${c.red.bold('error')}: File not found: ${filePath}\n`;
  output += `\n${c.blue.bold('hint')}: Check that the file path is correct\n`;
  output += `      Ensure the file exists\n`;
  return output;
}
