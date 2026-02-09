/**
 * DAG Builder for FlowScript Scheduler
 *
 * Extracts dependencies from AST nodes to build a directed acyclic graph.
 * Scans both explicit `input` attributes and implicit template expression
 * references (e.g., `{{nodeId.output}}`) in node configs.
 */

import type { NodeAST } from '../types/ast';
import { extractTemplateSegments } from '../expression/parser';

/**
 * Build a dependency graph from workflow nodes.
 * Maps each node ID to the set of node IDs it depends on.
 *
 * Dependencies come from two sources:
 * 1. Explicit `input` attribute on a node
 * 2. Template expression references in node config values (e.g., `{{otherNode.output}}`)
 *
 * Only top-level nodes participate in wave scheduling.
 * Control flow nodes (loop, if, parallel) handle their body execution internally.
 *
 * @param nodes Top-level nodes from WorkflowAST
 * @returns Map of nodeId -> Set of dependency nodeIds
 */
export function buildDependencyGraph(nodes: NodeAST[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const nodeIds = new Set(nodes.map((n) => n.id));

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

  // Scan config values for template expression references to other nodes
  for (const node of nodes) {
    if ('config' in node) {
      const deps = graph.get(node.id);
      if (deps) {
        const refs = extractNodeReferences(node.config as Record<string, unknown>, nodeIds);
        for (const ref of refs) {
          if (ref !== node.id) {
            deps.add(ref);
          }
        }
      }
    }
  }

  return graph;
}

/**
 * Extract references to other nodes from config values.
 * Scans all string values for `{{nodeId.xxx}}` patterns.
 */
function extractNodeReferences(
  config: Record<string, unknown>,
  nodeIds: Set<string>
): Set<string> {
  const refs = new Set<string>();

  function scanValue(value: unknown): void {
    if (typeof value === 'string') {
      const segments = extractTemplateSegments(value);
      for (const seg of segments) {
        if (seg.type === 'expression') {
          // Check if expression references any known node ID
          // Pattern: nodeId.something or just nodeId
          for (const nodeId of nodeIds) {
            if (
              seg.value === nodeId ||
              seg.value.startsWith(nodeId + '.') ||
              seg.value.includes(' ' + nodeId + '.') ||
              seg.value.includes('(' + nodeId + '.') ||
              seg.value.includes(',' + nodeId + '.') ||
              seg.value.includes('!' + nodeId + '.')
            ) {
              refs.add(nodeId);
            }
          }
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        for (const item of value) {
          scanValue(item);
        }
      } else {
        for (const v of Object.values(value as Record<string, unknown>)) {
          scanValue(v);
        }
      }
    }
  }

  for (const v of Object.values(config)) {
    scanValue(v);
  }

  return refs;
}
