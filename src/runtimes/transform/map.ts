/**
 * Map Runtime for FlowScript
 *
 * Transforms each item in an array by evaluating an expression
 * with iteration context variables ($item, $index, $first, $last, $items).
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { MapConfig } from './types.ts';
import { evaluate, buildEvaluationContext, type EvalContext } from '../../expression/index.ts';

// ============================================================================
// Map Runtime Implementation
// ============================================================================

/**
 * Map Runtime implementation.
 *
 * Transforms each item in the input array by evaluating an expression
 * with special iteration context variables.
 *
 * **Available iteration variables:**
 * - `$item` - The current item being processed
 * - `$index` - Zero-based index of the current item
 * - `$first` - Boolean, true if this is the first item
 * - `$last` - Boolean, true if this is the last item
 * - `$items` - Reference to the full input array
 *
 * @example
 * ```xml
 * <transform type="map" id="extract-names" input="users">
 *   <expression>$item.name</expression>
 * </transform>
 *
 * <transform type="map" id="add-position" input="items">
 *   <expression>{ ...item, position: $index + 1 }</expression>
 * </transform>
 * ```
 */
class MapRuntime implements NodeRuntime<MapConfig, unknown[], unknown[]> {
  readonly type = 'transform:map';

  async execute(params: ExecutionParams<MapConfig, unknown[]>): Promise<unknown[]> {
    const { config, state, input } = params;

    // Coerce input to array (wrap single values)
    const items = Array.isArray(input) ? input : [input];

    // Get base evaluation context
    const baseContext = buildEvaluationContext(state);

    // Map each item
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i++) {
      // Create item context with iteration variables
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

      // Evaluate expression with item context
      const result = evaluate(config.expression, itemContext);
      results.push(result);
    }

    return results;
  }
}

/**
 * Map runtime instance.
 */
export const mapRuntime = new MapRuntime();
