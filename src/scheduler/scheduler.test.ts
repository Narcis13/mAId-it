/**
 * Scheduler Module Tests
 *
 * Tests for DAG building, wave computation, semaphore, and execution plan.
 */

import { describe, test, expect } from 'bun:test';
import type { NodeAST, WorkflowAST, SourceNode } from '../types/ast';
import {
  buildExecutionPlan,
  buildDependencyGraph,
  computeWaves,
  Semaphore,
  DEFAULT_MAX_CONCURRENCY,
} from './index';

// ============================================================================
// Test Helpers
// ============================================================================

function createSourceNode(id: string, input?: string): SourceNode {
  return {
    type: 'source',
    id,
    input,
    sourceType: 'http',
    config: { url: 'https://example.com' },
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
  };
}

function createMinimalAST(nodes: NodeAST[]): WorkflowAST {
  return {
    metadata: { name: 'test-workflow', version: '1.0' },
    nodes,
    sourceMap: { source: '', filePath: 'test.flow.md', lineOffsets: [0] },
  };
}

// ============================================================================
// Semaphore Tests
// ============================================================================

describe('Semaphore', () => {
  test('creates with valid capacity', () => {
    const sem = new Semaphore(3);
    expect(sem.available).toBe(3);
    expect(sem.waiting).toBe(0);
  });

  test('throws for capacity < 1', () => {
    expect(() => new Semaphore(0)).toThrow('capacity must be at least 1');
    expect(() => new Semaphore(-1)).toThrow('capacity must be at least 1');
  });

  test('acquire decrements available permits', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem.available).toBe(1);
    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  test('release increments available permits', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.available).toBe(0);
    sem.release();
    expect(sem.available).toBe(1);
    sem.release();
    expect(sem.available).toBe(2);
  });

  test('blocks when no permits available', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire();
    order.push(1);

    // This will block until release
    const p2 = sem.acquire().then(() => order.push(2));

    // Allow p2 to start waiting
    await new Promise((r) => setTimeout(r, 10));
    expect(sem.waiting).toBe(1);

    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  test('concurrent tasks respect limit', async () => {
    const sem = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, async (_, i) => {
      await sem.acquire();
      try {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
      } finally {
        sem.release();
      }
      return i;
    });

    await Promise.all(tasks);

    expect(maxConcurrent).toBe(2);
  });
});

// ============================================================================
// DAG Builder Tests
// ============================================================================

describe('buildDependencyGraph', () => {
  test('returns empty deps for nodes without input', () => {
    const nodes = [createSourceNode('a'), createSourceNode('b')];
    const graph = buildDependencyGraph(nodes);

    expect(graph.get('a')?.size).toBe(0);
    expect(graph.get('b')?.size).toBe(0);
  });

  test('records input as dependency', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b', 'a'),
    ];
    const graph = buildDependencyGraph(nodes);

    expect(graph.get('a')?.size).toBe(0);
    expect(graph.get('b')?.has('a')).toBe(true);
  });

  test('handles chain of dependencies', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b', 'a'),
      createSourceNode('c', 'b'),
    ];
    const graph = buildDependencyGraph(nodes);

    expect(graph.get('a')?.size).toBe(0);
    expect(graph.get('b')?.has('a')).toBe(true);
    expect(graph.get('c')?.has('b')).toBe(true);
  });
});

// ============================================================================
// Wave Computation Tests
// ============================================================================

describe('computeWaves', () => {
  test('single node is wave 0', () => {
    const nodes = [createSourceNode('a')];
    const deps = buildDependencyGraph(nodes);
    const waves = computeWaves(nodes, deps);

    expect(waves.length).toBe(1);
    expect(waves[0].waveNumber).toBe(0);
    expect(waves[0].nodeIds).toEqual(['a']);
  });

  test('independent nodes are same wave', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b'),
      createSourceNode('c'),
    ];
    const deps = buildDependencyGraph(nodes);
    const waves = computeWaves(nodes, deps);

    expect(waves.length).toBe(1);
    expect(waves[0].nodeIds).toContain('a');
    expect(waves[0].nodeIds).toContain('b');
    expect(waves[0].nodeIds).toContain('c');
  });

  test('dependent node is next wave', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b', 'a'),
    ];
    const deps = buildDependencyGraph(nodes);
    const waves = computeWaves(nodes, deps);

    expect(waves.length).toBe(2);
    expect(waves[0].nodeIds).toEqual(['a']);
    expect(waves[1].nodeIds).toEqual(['b']);
  });

  test('chain creates sequential waves', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b', 'a'),
      createSourceNode('c', 'b'),
    ];
    const deps = buildDependencyGraph(nodes);
    const waves = computeWaves(nodes, deps);

    expect(waves.length).toBe(3);
    expect(waves[0].nodeIds).toEqual(['a']);
    expect(waves[1].nodeIds).toEqual(['b']);
    expect(waves[2].nodeIds).toEqual(['c']);
  });

  test('diamond pattern creates correct waves', () => {
    // a -> b, a -> c, b -> d, c -> d
    const nodes: NodeAST[] = [
      createSourceNode('a'),
      createSourceNode('b', 'a'),
      createSourceNode('c', 'a'),
      createSourceNode('d', 'b'), // d also implicitly depends on c for full diamond
    ];
    // Add c dependency to d manually for full diamond
    nodes[3].input = 'b'; // Note: single input limitation

    const deps = buildDependencyGraph(nodes);
    const waves = computeWaves(nodes, deps);

    // Wave 0: a
    // Wave 1: b, c
    // Wave 2: d
    expect(waves.length).toBe(3);
    expect(waves[0].nodeIds).toEqual(['a']);
    expect(waves[1].nodeIds.sort()).toEqual(['b', 'c']);
  });
});

// ============================================================================
// Execution Plan Tests
// ============================================================================

describe('buildExecutionPlan', () => {
  test('creates plan for empty workflow', () => {
    const ast = createMinimalAST([]);
    const plan = buildExecutionPlan(ast);

    expect(plan.workflowId).toBe('test-workflow');
    expect(plan.totalNodes).toBe(0);
    expect(plan.waves.length).toBe(0);
  });

  test('creates plan with node lookup', () => {
    const nodes = [createSourceNode('fetch'), createSourceNode('process', 'fetch')];
    const ast = createMinimalAST(nodes);
    const plan = buildExecutionPlan(ast);

    expect(plan.totalNodes).toBe(2);
    expect(plan.nodes.get('fetch')).toBeDefined();
    expect(plan.nodes.get('process')).toBeDefined();
  });

  test('computes waves correctly', () => {
    const nodes = [
      createSourceNode('a'),
      createSourceNode('b'),
      createSourceNode('c', 'a'),
      createSourceNode('d', 'b'),
    ];
    const ast = createMinimalAST(nodes);
    const plan = buildExecutionPlan(ast);

    expect(plan.waves.length).toBe(2);
    expect(plan.waves[0].nodeIds.sort()).toEqual(['a', 'b']);
    expect(plan.waves[1].nodeIds.sort()).toEqual(['c', 'd']);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  test('DEFAULT_MAX_CONCURRENCY is 10', () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(10);
  });
});
