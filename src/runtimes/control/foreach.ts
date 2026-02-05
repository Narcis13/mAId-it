/**
 * Foreach Runtime for FlowScript
 *
 * Collection iteration loop that executes body nodes for each item.
 * Injects item and index variables into context for each iteration.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { ForeachConfig } from './types.ts';
import type { ForeachNode } from '../../types/ast.ts';
import { evaluateInContext } from '../../execution/index.ts';

// ============================================================================
// Foreach Result Types
// ============================================================================

/**
 * Result returned by foreach runtime with collection and iteration metadata.
 */
export interface ForeachResult {
  /** Evaluated collection array to iterate over */
  collection: unknown[];
  /** Variable name for current item */
  itemVar: string;
  /** Variable name for current index */
  indexVar: string;
  /** Maximum concurrent iterations (1 = sequential) */
  maxConcurrency: number;
  /** Body node IDs to execute per iteration */
  bodyNodeIds: string[];
}

// ============================================================================
// Foreach Runtime Implementation
// ============================================================================

/**
 * Foreach Runtime - evaluates collection and returns iteration metadata.
 *
 * Evaluates the collection expression to get the array, then returns
 * metadata for the executor to iterate with item/index context injection.
 *
 * @example
 * ```xml
 * <foreach id="process-users" collection="users" itemVar="user" indexVar="idx">
 *   <transform:template id="greet" template="Hello, {{user.name}} (#{{idx}})!" />
 *   <sink:http id="notify" url="https://api.example.com/notify" />
 * </foreach>
 * ```
 */
class ForeachRuntime implements NodeRuntime<ForeachConfig, unknown, ForeachResult> {
  readonly type = 'control:foreach';

  async execute(params: ExecutionParams<ForeachConfig, unknown>): Promise<ForeachResult> {
    const { node, config, state } = params;

    // Cast to ForeachNode to access collection, itemVar, and body
    const foreachNode = node as unknown as ForeachNode;

    // Get collection expression from AST node first, then config
    const collectionExpr = foreachNode.collection ?? config.collection;

    // Evaluate collection expression to get the array
    const collectionValue = evaluateInContext(collectionExpr, state);

    // Ensure collection is an array
    const collection = Array.isArray(collectionValue)
      ? (collectionValue as unknown[])
      : [collectionValue];

    // Get variable names (AST node > config > defaults)
    const itemVar = foreachNode.itemVar ?? config.itemVar ?? 'item';
    const indexVar = config.indexVar ?? 'index';

    // Get concurrency from AST node first, then config, default to sequential
    const maxConcurrency = foreachNode.maxConcurrency ?? config.maxConcurrency ?? 1;

    // Extract body node IDs
    const bodyNodeIds = foreachNode.body.map((n) => n.id);

    return {
      collection,
      itemVar,
      indexVar,
      maxConcurrency,
      bodyNodeIds,
    };
  }
}

/**
 * Foreach runtime instance.
 */
export const foreachRuntime = new ForeachRuntime();
