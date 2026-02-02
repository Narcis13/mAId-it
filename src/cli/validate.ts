/**
 * CLI Validate Command
 *
 * Implements the `flowscript validate <file>` command.
 * Parses and validates .flow.md files, reporting errors with source context.
 */

import { parseFile } from '../parser';
import { validate } from '../validator';
import {
  formatValidationResult,
  formatParseErrors,
  formatSuccess,
  formatFileNotFound,
  type FormatOptions,
} from './format';

/**
 * Options for the validate command.
 */
export interface ValidateOptions {
  /** Output format ('text' | 'json') */
  format?: 'text' | 'json';
  /** Disable colored output */
  noColor?: boolean;
  /** Show warnings as errors */
  strict?: boolean;
}

/**
 * Result of validation.
 */
export interface ValidateResult {
  /** Whether validation passed */
  valid: boolean;
  /** Formatted output string */
  output: string;
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
}

/**
 * Validate a .flow.md file.
 *
 * @param filePath - Path to the file to validate
 * @param options - Validation options
 * @returns ValidateResult with status and formatted output
 *
 * @example
 * ```typescript
 * const result = await validateFile('./workflow.flow.md');
 *
 * console.log(result.output);
 *
 * if (result.valid) {
 *   process.exit(0);
 * } else {
 *   process.exit(1);
 * }
 * ```
 */
export async function validateFile(
  filePath: string,
  options: ValidateOptions = {}
): Promise<ValidateResult> {
  const formatOpts: FormatOptions = {
    color: !options.noColor,
    format: options.format || 'text',
  };

  // Check if file exists
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    return {
      valid: false,
      output: formatFileNotFound(filePath, formatOpts),
      errorCount: 1,
      warningCount: 0,
    };
  }

  // Read source for error formatting
  const source = await file.text();

  // Parse the file
  const parseResult = await parseFile(filePath);

  if (!parseResult.success) {
    return {
      valid: false,
      output: formatParseErrors(parseResult.errors, source, filePath, formatOpts),
      errorCount: parseResult.errors.length,
      warningCount: 0,
    };
  }

  // Validate the AST
  const validationResult = validate(parseResult.data);

  // In strict mode, treat warnings as errors
  const isValid = options.strict
    ? validationResult.valid && validationResult.warnings.length === 0
    : validationResult.valid;

  // Format output
  if (isValid && validationResult.warnings.length === 0) {
    // Clean success
    const nodeCount = countNodes(parseResult.data.nodes);
    return {
      valid: true,
      output: formatSuccess(filePath, nodeCount, formatOpts),
      errorCount: 0,
      warningCount: 0,
    };
  }

  // Has errors or warnings
  const output = formatValidationResult(validationResult, source, filePath, formatOpts);

  return {
    valid: isValid,
    output,
    errorCount: validationResult.errors.length,
    warningCount: validationResult.warnings.length,
  };
}

/**
 * Count total nodes including nested nodes.
 */
function countNodes(nodes: unknown[]): number {
  let count = 0;

  for (const node of nodes) {
    count++;
    const nodeObj = node as Record<string, unknown>;

    // Count nested nodes based on type
    if ('cases' in nodeObj && Array.isArray(nodeObj.cases)) {
      for (const branchCase of nodeObj.cases as Array<{ nodes?: unknown[] }>) {
        if (branchCase.nodes) {
          count += countNodes(branchCase.nodes);
        }
      }
    }
    if ('default' in nodeObj && Array.isArray(nodeObj.default)) {
      count += countNodes(nodeObj.default as unknown[]);
    }
    if ('then' in nodeObj && Array.isArray(nodeObj.then)) {
      count += countNodes(nodeObj.then as unknown[]);
    }
    if ('else' in nodeObj && Array.isArray(nodeObj.else)) {
      count += countNodes(nodeObj.else as unknown[]);
    }
    if ('body' in nodeObj && Array.isArray(nodeObj.body)) {
      count += countNodes(nodeObj.body as unknown[]);
    }
    if ('branches' in nodeObj && Array.isArray(nodeObj.branches)) {
      for (const branch of nodeObj.branches as unknown[][]) {
        count += countNodes(branch);
      }
    }
  }

  return count;
}

/**
 * Validate multiple files.
 *
 * @param filePaths - Paths to files to validate
 * @param options - Validation options
 * @returns Combined result
 */
export async function validateFiles(
  filePaths: string[],
  options: ValidateOptions = {}
): Promise<ValidateResult> {
  let allValid = true;
  let totalErrors = 0;
  let totalWarnings = 0;
  const outputs: string[] = [];

  for (const filePath of filePaths) {
    const result = await validateFile(filePath, options);

    if (!result.valid) {
      allValid = false;
    }

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    outputs.push(result.output);
  }

  return {
    valid: allValid,
    output: outputs.join('\n'),
    errorCount: totalErrors,
    warningCount: totalWarnings,
  };
}
