/**
 * FlowScript Validator
 *
 * Main entry point for multi-pass workflow validation.
 * Orchestrates structural, reference, and cycle validation passes.
 */

import type { WorkflowAST, ValidationResult, ValidationError } from '../types';
import { validateStructural } from './structural';
import { validateReferences } from './references';
import { detectCycles, getExecutionOrder } from './cycles';

/**
 * Validate a parsed workflow AST.
 *
 * Runs multiple validation passes in order:
 * 1. Structural validation - required fields, valid types
 * 2. Reference validation - node refs, secret refs, duplicate IDs
 * 3. Cycle detection - circular dependencies
 *
 * @param ast - The parsed workflow AST
 * @returns ValidationResult with valid flag, errors, and warnings
 *
 * @example
 * ```typescript
 * const parseResult = parse(source, 'workflow.flow.md');
 *
 * if (parseResult.success) {
 *   const validationResult = validate(parseResult.data);
 *
 *   if (validationResult.valid) {
 *     console.log('Workflow is valid!');
 *   } else {
 *     for (const error of validationResult.errors) {
 *       console.error(`${error.loc?.start.line}: ${error.message}`);
 *     }
 *   }
 * }
 * ```
 */
export function validate(ast: WorkflowAST): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Pass 1: Structural validation
  const structuralResults = validateStructural(ast);
  categorizeErrors(structuralResults, errors, warnings);

  // Pass 2: Reference validation
  const referenceResults = validateReferences(ast);
  categorizeErrors(referenceResults, errors, warnings);

  // Pass 3: Cycle detection (only if no reference errors that would cause false positives)
  const hasReferenceErrors = referenceResults.some(e => e.severity === 'error');
  if (!hasReferenceErrors) {
    const cycleResults = detectCycles(ast);
    categorizeErrors(cycleResults, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Categorize validation errors into errors and warnings arrays.
 */
function categorizeErrors(
  results: ValidationError[],
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  for (const result of results) {
    if (result.severity === 'error') {
      errors.push(result);
    } else {
      warnings.push(result);
    }
  }
}

/**
 * Validate and return execution order if valid.
 *
 * Convenience function that combines validation with execution order calculation.
 * Returns the topological sort of nodes if the workflow is valid.
 *
 * @param ast - The parsed workflow AST
 * @returns Object with validation result and optional execution order
 *
 * @example
 * ```typescript
 * const { validation, executionOrder } = validateWithOrder(ast);
 *
 * if (validation.valid && executionOrder) {
 *   console.log('Execution order:', executionOrder.join(' -> '));
 * }
 * ```
 */
export function validateWithOrder(ast: WorkflowAST): {
  validation: ValidationResult;
  executionOrder?: string[];
} {
  const validation = validate(ast);

  if (validation.valid) {
    const executionOrder = getExecutionOrder(ast);
    return { validation, executionOrder };
  }

  return { validation };
}

// Re-export individual validators for advanced usage
export { validateStructural } from './structural';
export { validateReferences } from './references';
export { detectCycles, getExecutionOrder } from './cycles';
