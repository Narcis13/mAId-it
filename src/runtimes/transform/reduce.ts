/**
 * Reduce Runtime for FlowScript
 *
 * Reduces an array to a single value by evaluating an expression
 * for each item with $acc (accumulator) and $item in context.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { ReduceConfig } from './types.ts';
import { evaluate, buildEvaluationContext, type EvalContext } from '../../expression/index.ts';

// ============================================================================
// Reduce Runtime Implementation
// ============================================================================

/**
 * Reduce Runtime implementation.
 *
 * Reduces the input array by evaluating the expression for each item,
 * carrying an accumulator ($acc) from one iteration to the next.
 *
 * **Available iteration variables:**
 * - `$acc` - The current accumulator value
 * - `$item` - The current item being processed
 * - `$index` - Zero-based index of the current item
 *
 * @example
 * ```xml
 * <transform type="reduce" id="sum" input="numbers">
 *   <initial>0</initial>
 *   <expression>$acc + $item</expression>
 * </transform>
 *
 * <transform type="reduce" id="flatten" input="arrays">
 *   <initial>[]</initial>
 *   <expression>concat($acc, $item)</expression>
 * </transform>
 * ```
 */
class ReduceRuntime implements NodeRuntime<ReduceConfig, unknown[], unknown> {
  readonly type = 'transform:reduce';

  async execute(params: ExecutionParams<ReduceConfig, unknown[]>): Promise<unknown> {
    const { config, state, input } = params;

    // Coerce input to array
    const items = Array.isArray(input) ? input : [input];

    // Get base evaluation context
    const baseContext = buildEvaluationContext(state);

    // Evaluate initial value (or use undefined/first item)
    let acc: unknown;
    if (config.initial !== undefined) {
      acc = evaluate(config.initial, baseContext);
    } else {
      acc = undefined;
    }

    // Reduce items
    for (let i = 0; i < items.length; i++) {
      const itemContext: EvalContext = {
        variables: {
          ...baseContext.variables,
          $acc: acc,
          $item: items[i],
          $index: i,
        },
        functions: baseContext.functions,
      };

      acc = evaluate(config.expression, itemContext);
    }

    // Apply finalize expression if present
    if (config.finalize) {
      const finalizeContext: EvalContext = {
        variables: {
          ...baseContext.variables,
          $acc: acc,
        },
        functions: baseContext.functions,
      };
      acc = evaluate(config.finalize, finalizeContext);
    }

    return acc;
  }
}

/**
 * Reduce runtime instance.
 */
export const reduceRuntime = new ReduceRuntime();
