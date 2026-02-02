/**
 * Cycle Detector
 *
 * Detects circular dependencies in the workflow graph using Kahn's algorithm.
 * This is O(V+E) where V is nodes and E is edges (input references).
 */

import type {
  WorkflowAST,
  NodeAST,
  BranchNode,
  IfNode,
  LoopNode,
  WhileNode,
  ForeachNode,
  ParallelNode,
  SourceLocation,
} from '../types';
import { createError, type ValidationError } from '../types/errors';

/**
 * Represents a node in the dependency graph.
 */
interface GraphNode {
  id: string;
  loc: SourceLocation;
  dependencies: Set<string>; // nodes this node depends on (via input)
  dependents: Set<string>;   // nodes that depend on this node
}

/**
 * Detect circular dependencies in the workflow.
 *
 * Uses Kahn's algorithm for topological sorting:
 * 1. Build a graph of node dependencies based on input references
 * 2. Find nodes with no dependencies (in-degree = 0)
 * 3. Remove them and their edges, repeat
 * 4. If any nodes remain, they form a cycle
 *
 * @param ast - The parsed workflow AST
 * @returns Array of validation errors (empty if no cycles)
 */
export function detectCycles(ast: WorkflowAST): ValidationError[] {
  // Build the dependency graph
  const graph = buildDependencyGraph(ast.nodes);

  // Run Kahn's algorithm
  return kahnsAlgorithm(graph);
}

/**
 * Build the dependency graph from AST nodes.
 */
function buildDependencyGraph(nodes: NodeAST[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  // First pass: collect all nodes
  collectAllNodes(nodes, graph);

  // Second pass: build edges based on input references
  buildEdges(nodes, graph);

  return graph;
}

/**
 * Recursively collect all nodes into the graph.
 */
function collectAllNodes(nodes: NodeAST[], graph: Map<string, GraphNode>): void {
  for (const node of nodes) {
    if (!graph.has(node.id)) {
      graph.set(node.id, {
        id: node.id,
        loc: node.loc,
        dependencies: new Set(),
        dependents: new Set(),
      });
    }

    // Collect child nodes based on type
    collectChildNodes(node, graph);
  }
}

/**
 * Collect child nodes based on node type.
 */
function collectChildNodes(node: NodeAST, graph: Map<string, GraphNode>): void {
  switch (node.type) {
    case 'branch': {
      const branchNode = node as BranchNode;
      for (const branchCase of branchNode.cases) {
        collectAllNodes(branchCase.nodes, graph);
      }
      if (branchNode.default) {
        collectAllNodes(branchNode.default, graph);
      }
      break;
    }
    case 'if': {
      const ifNode = node as IfNode;
      collectAllNodes(ifNode.then, graph);
      if (ifNode.else) {
        collectAllNodes(ifNode.else, graph);
      }
      break;
    }
    case 'loop': {
      const loopNode = node as LoopNode;
      collectAllNodes(loopNode.body, graph);
      break;
    }
    case 'while': {
      const whileNode = node as WhileNode;
      collectAllNodes(whileNode.body, graph);
      break;
    }
    case 'foreach': {
      const foreachNode = node as ForeachNode;
      collectAllNodes(foreachNode.body, graph);
      break;
    }
    case 'parallel': {
      const parallelNode = node as ParallelNode;
      for (const branch of parallelNode.branches) {
        collectAllNodes(branch, graph);
      }
      break;
    }
    // source, transform, sink, checkpoint have no children
    default:
      break;
  }
}

/**
 * Build edges based on input references.
 */
function buildEdges(nodes: NodeAST[], graph: Map<string, GraphNode>): void {
  for (const node of nodes) {
    if (node.input) {
      const source = graph.get(node.input);
      const target = graph.get(node.id);

      if (source && target) {
        // node depends on node.input
        target.dependencies.add(node.input);
        source.dependents.add(node.id);
      }
    }

    // Build edges for child nodes
    buildChildEdges(node, graph);
  }
}

/**
 * Build edges for child nodes.
 */
function buildChildEdges(node: NodeAST, graph: Map<string, GraphNode>): void {
  switch (node.type) {
    case 'branch': {
      const branchNode = node as BranchNode;
      for (const branchCase of branchNode.cases) {
        buildEdges(branchCase.nodes, graph);
      }
      if (branchNode.default) {
        buildEdges(branchNode.default, graph);
      }
      break;
    }
    case 'if': {
      const ifNode = node as IfNode;
      buildEdges(ifNode.then, graph);
      if (ifNode.else) {
        buildEdges(ifNode.else, graph);
      }
      break;
    }
    case 'loop': {
      const loopNode = node as LoopNode;
      buildEdges(loopNode.body, graph);
      break;
    }
    case 'while': {
      const whileNode = node as WhileNode;
      buildEdges(whileNode.body, graph);
      break;
    }
    case 'foreach': {
      const foreachNode = node as ForeachNode;
      buildEdges(foreachNode.body, graph);
      break;
    }
    case 'parallel': {
      const parallelNode = node as ParallelNode;
      for (const branch of parallelNode.branches) {
        buildEdges(branch, graph);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Run Kahn's algorithm to detect cycles.
 *
 * Algorithm:
 * 1. Find all nodes with no dependencies (in-degree 0)
 * 2. Add them to a queue
 * 3. While queue is not empty:
 *    - Remove node from queue
 *    - For each node that depends on it, decrement their in-degree
 *    - If in-degree becomes 0, add to queue
 * 4. If processed nodes < total nodes, there's a cycle
 */
function kahnsAlgorithm(graph: Map<string, GraphNode>): ValidationError[] {
  // Copy the graph so we don't mutate it
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();

  for (const [id, node] of graph) {
    inDegree.set(id, node.dependencies.size);
    dependents.set(id, new Set(node.dependents));
  }

  // Find all nodes with in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // Process the queue
  const processed = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    processed.add(nodeId);

    // Decrease in-degree for all dependents
    const nodeDependents = dependents.get(nodeId);
    if (nodeDependents) {
      for (const dependentId of nodeDependents) {
        const currentDegree = inDegree.get(dependentId);
        if (currentDegree !== undefined) {
          const newDegree = currentDegree - 1;
          inDegree.set(dependentId, newDegree);
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
    }
  }

  // If not all nodes were processed, there's a cycle
  if (processed.size < graph.size) {
    // Find the cycle
    const remainingNodes = Array.from(graph.keys()).filter(id => !processed.has(id));
    const cyclePath = findCyclePath(remainingNodes, graph);

    // Get the first node in the cycle for location
    const firstNodeId = cyclePath[0];
    const firstNode = firstNodeId ? graph.get(firstNodeId) : undefined;

    return [
      createError(
        'VALID_CIRCULAR_DEPENDENCY',
        `Circular dependency detected: ${cyclePath.join(' -> ')}`,
        firstNode?.loc,
        [
          'Break the cycle by removing one of the input references',
          `Nodes involved: ${remainingNodes.join(', ')}`
        ]
      )
    ];
  }

  return [];
}

/**
 * Find the actual cycle path for a better error message.
 * Uses DFS to trace the cycle.
 */
function findCyclePath(remainingNodes: string[], graph: Map<string, GraphNode>): string[] {
  if (remainingNodes.length === 0) return [];

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): string[] | null {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        // Only consider nodes that are in the remaining set (part of cycle)
        if (!remainingNodes.includes(depId)) continue;

        if (!visited.has(depId)) {
          const result = dfs(depId);
          if (result) return result;
        } else if (recursionStack.has(depId)) {
          // Found the cycle - extract it from path
          const cycleStart = path.indexOf(depId);
          const cyclePath = path.slice(cycleStart);
          cyclePath.push(depId); // Close the cycle
          return cyclePath;
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return null;
  }

  // Start DFS from first remaining node
  const startNode = remainingNodes[0];
  if (startNode) {
    const cycle = dfs(startNode);
    if (cycle) return cycle;
  }

  // Fallback if cycle detection fails
  return [...remainingNodes, remainingNodes[0] || ''];
}

/**
 * Get execution order for nodes (topological sort).
 * Returns undefined if there's a cycle.
 *
 * @param ast - The parsed workflow AST
 * @returns Array of node IDs in execution order, or undefined if cycle exists
 */
export function getExecutionOrder(ast: WorkflowAST): string[] | undefined {
  const graph = buildDependencyGraph(ast.nodes);

  // Copy in-degrees
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();

  for (const [id, node] of graph) {
    inDegree.set(id, node.dependencies.size);
    dependents.set(id, new Set(node.dependents));
  }

  // Find all nodes with in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // Process the queue
  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    const nodeDependents = dependents.get(nodeId);
    if (nodeDependents) {
      for (const dependentId of nodeDependents) {
        const currentDegree = inDegree.get(dependentId);
        if (currentDegree !== undefined) {
          const newDegree = currentDegree - 1;
          inDegree.set(dependentId, newDegree);
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
    }
  }

  // Return undefined if cycle detected
  if (order.length < graph.size) {
    return undefined;
  }

  return order;
}
