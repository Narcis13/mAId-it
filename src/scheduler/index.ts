/**
 * Scheduler Module for FlowScript
 *
 * Builds execution plans from workflow AST, computing waves for parallel execution.
 */

import type { WorkflowAST, NodeAST } from '../types/ast';
import type { ExecutionPlan } from './types';
import { buildDependencyGraph } from './dag';
import { computeWaves } from './waves';

// Re-export types and utilities
export * from './types';
export * from './concurrency';
export { buildDependencyGraph } from './dag';
export { computeWaves } from './waves';

/**
 * Build an execution plan from a workflow AST.
 *
 * Analyzes node dependencies to compute execution waves.
 * Nodes in the same wave have no dependencies on each other and can run in parallel.
 *
 * @param ast Parsed workflow AST
 * @returns Execution plan with waves and node lookup
 *
 * @example
 * ```typescript
 * const plan = buildExecutionPlan(ast);
 * console.log(`${plan.waves.length} waves for ${plan.totalNodes} nodes`);
 * ```
 */
export function buildExecutionPlan(ast: WorkflowAST): ExecutionPlan {
  const nodes = new Map<string, NodeAST>();

  // Build node lookup from top-level nodes
  for (const node of ast.nodes) {
    nodes.set(node.id, node);
  }

  // Build dependency graph and compute waves
  const dependencies = buildDependencyGraph(ast.nodes);
  const waves = computeWaves(ast.nodes, dependencies);

  return {
    workflowId: ast.metadata.name,
    totalNodes: nodes.size,
    waves,
    nodes,
  };
}
