/**
 * Wave Computation for FlowScript Scheduler
 *
 * Uses Kahn's algorithm to compute execution waves from dependency graph.
 */

import type { NodeAST } from '../types/ast';
import type { ExecutionWave } from './types';

/**
 * Compute execution waves from dependency graph using Kahn's algorithm.
 *
 * Nodes with no dependencies form wave 0.
 * Nodes whose dependencies are all in earlier waves form the next wave.
 * Continues until all nodes are assigned to waves.
 *
 * @param nodes Array of nodes to schedule
 * @param dependencies Map of nodeId -> Set of dependency nodeIds
 * @returns Array of execution waves in order
 * @throws Error if cycle detected (shouldn't happen if validator ran)
 */
export function computeWaves(
  nodes: NodeAST[],
  dependencies: Map<string, Set<string>>
): ExecutionWave[] {
  const waves: ExecutionWave[] = [];
  const remaining = new Set(nodes.map((n) => n.id));
  const completed = new Set<string>();
  let waveNumber = 0;

  while (remaining.size > 0) {
    // Find all nodes with no unmet dependencies
    const ready: string[] = [];

    for (const nodeId of remaining) {
      const deps = dependencies.get(nodeId) ?? new Set();
      const unmetDeps = [...deps].filter((d) => !completed.has(d));

      if (unmetDeps.length === 0) {
        ready.push(nodeId);
      }
    }

    // Cycle detection (shouldn't happen if validator caught cycles)
    if (ready.length === 0 && remaining.size > 0) {
      const remainingIds = [...remaining].join(', ');
      throw new Error(`Cycle detected in dependency graph: ${remainingIds}`);
    }

    // All ready nodes form this wave
    waves.push({ waveNumber, nodeIds: ready });

    // Mark as completed and remove from remaining
    for (const nodeId of ready) {
      completed.add(nodeId);
      remaining.delete(nodeId);
    }

    waveNumber++;
  }

  return waves;
}
