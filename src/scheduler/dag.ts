/**
 * DAG Builder for FlowScript Scheduler
 *
 * Extracts dependencies from AST nodes to build a directed acyclic graph.
 */

import type { NodeAST } from '../types/ast';

/**
 * Build a dependency graph from workflow nodes.
 * Maps each node ID to the set of node IDs it depends on (via input).
 *
 * Only top-level nodes participate in wave scheduling.
 * Control flow nodes (loop, if, parallel) handle their body execution internally.
 *
 * @param nodes Top-level nodes from WorkflowAST
 * @returns Map of nodeId -> Set of dependency nodeIds
 */
export function buildDependencyGraph(nodes: NodeAST[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  // Initialize all nodes with empty dependency sets
  for (const node of nodes) {
    graph.set(node.id, new Set());
  }

  // Add dependencies from input references
  for (const node of nodes) {
    if (node.input) {
      const deps = graph.get(node.id);
      if (deps) {
        deps.add(node.input);
      }
    }
  }

  return graph;
}
