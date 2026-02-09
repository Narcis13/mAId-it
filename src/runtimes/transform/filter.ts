/**
 * Filter Runtime for FlowScript
 *
 * Filters an array by evaluating a condition expression for each item.
 * Items where the condition is truthy are included in the output.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { FilterConfig } from './types.ts';
import { evaluate, buildEvaluationContext, type EvalContext } from '../../expression/index.ts';

// ============================================================================
// Filter Runtime Implementation
// ============================================================================

/**
 * Filter Runtime implementation.
 *
 * Filters the input array, keeping only items where the condition
 * expression evaluates to a truthy value.
 *
 * **Available iteration variables:**
 * - `$item` - The current item being tested
 * - `$index` - Zero-based index of the current item
 *
 * IMPORTANT: Returns the original items, not the boolean condition results.
 *
 * @example
 * ```xml
 * <transform type="filter" id="active-users" input="users">
 *   <condition>$item.isActive</condition>
 * </transform>
 *
 * <transform type="filter" id="even-indexed" input="items">
 *   <condition>$index % 2 === 0</condition>
 * </transform>
 * ```
 */
class FilterRuntime implements NodeRuntime<FilterConfig, unknown[], unknown[]> {
  readonly type = 'transform:filter';

  async execute(params: ExecutionParams<FilterConfig, unknown[]>): Promise<unknown[]> {
    const { config, state, input } = params;

    // Coerce input to array (wrap single values)
    const items = Array.isArray(input) ? input : [input];

    // Get base evaluation context
    const baseContext = buildEvaluationContext(state);

    // Filter items
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i++) {
      // Create item context with iteration variables (matches map runtime)
      const itemContext: EvalContext = {
        variables: {
          ...baseContext.variables,
          $item: items[i],
          $index: i,
          $first: i === 0,
          $last: i === items.length - 1,
          $items: items,
        },
        functions: baseContext.functions,
      };

      // Evaluate condition with item context
      const conditionResult = evaluate(config.condition, itemContext);

      // If truthy, include the ORIGINAL ITEM (not the boolean result)
      if (conditionResult) {
        results.push(items[i]);
      }
    }

    return results;
  }
}

/**
 * Filter runtime instance.
 */
export const filterRuntime = new FilterRuntime();
