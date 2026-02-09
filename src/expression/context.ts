/**
 * Context Management for FlowScript Expression Evaluation
 *
 * Builds evaluation context from execution state with proper hierarchy:
 * node variables override phase variables override global variables.
 * Provides special prefixes ($config, $secrets, $context) and node output access.
 */

import type { EvalContext } from './types';
import type { ExecutionState } from '../execution/types';
import { getBuiltinFunctions } from './functions';
import { getNodeOutputs } from '../execution/state';

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build evaluation context from execution state.
 * Applies context hierarchy: node > phase > global
 * Adds special prefixes: $config, $secrets, $context
 * Makes node outputs available as nodeId.output
 */
export function buildEvaluationContext(state: ExecutionState): EvalContext {
  const variables: Record<string, unknown> = {};

  // Layer 1: Global context (base)
  Object.assign(variables, state.globalContext);

  // Layer 2: Phase context (overrides global)
  Object.assign(variables, state.phaseContext);

  // Layer 3: Node context (overrides phase)
  Object.assign(variables, state.nodeContext);

  // Special prefixes
  variables['$config'] = state.config;
  variables['$secrets'] = state.secrets;
  variables['$context'] = {
    ...state.globalContext,
    ...state.phaseContext,
    ...state.nodeContext,
  };
  variables['$env'] = process.env;

  // Add node outputs as direct references (e.g., fetch.output -> { output: {...} })
  const outputs = getNodeOutputs(state);
  for (const [nodeId, output] of outputs) {
    variables[nodeId] = { output };
  }

  return {
    variables,
    functions: getBuiltinFunctions(),
  };
}

/**
 * Create a minimal evaluation context for standalone expression evaluation.
 */
export function createEvalContext(
  variables: Record<string, unknown> = {},
  functions?: Record<string, (...args: unknown[]) => unknown>
): EvalContext {
  return {
    variables,
    functions: functions ?? getBuiltinFunctions(),
  };
}

// ============================================================================
// Secret Redaction
// ============================================================================

/**
 * Redact secret values from context for safe logging/error messages.
 */
export function redactSecrets(context: EvalContext): EvalContext {
  const secrets = context.variables['$secrets'];
  if (!secrets || typeof secrets !== 'object') {
    return context;
  }

  const redactedSecrets = Object.fromEntries(
    Object.keys(secrets as object).map((k) => [k, '[REDACTED]'])
  );

  return {
    ...context,
    variables: {
      ...context.variables,
      $secrets: redactedSecrets,
    },
  };
}

/**
 * Create a safe string representation of context for error messages.
 */
export function contextToString(context: EvalContext): string {
  const redacted = redactSecrets(context);
  const keys = Object.keys(redacted.variables);

  // Show variable names only, not values (to avoid leaking data)
  return `{ variables: [${keys.join(', ')}], functions: [${Object.keys(redacted.functions).length} built-in] }`;
}
