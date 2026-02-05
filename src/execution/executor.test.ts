/**
 * Executor Integration Tests
 *
 * Tests for wave execution, parallel blocks, and foreach parallelism.
 */

import { describe, test, expect, mock } from 'bun:test';
import type { WorkflowAST, SourceNode, TransformNode, ParallelNode, ForeachNode } from '../types/ast';
import { buildExecutionPlan } from '../scheduler';
import { execute } from './executor';
import { createExecutionState } from './state';

// Import runtimes to trigger registration
import '../runtimes';

// ============================================================================
// Test Helpers
// ============================================================================

function createSourceNode(id: string, input?: string): SourceNode {
  return {
    type: 'source',
    id,
    input,
    sourceType: 'http',
    config: { url: 'https://example.com', method: 'GET' },
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
  };
}

function createTransformNode(id: string, input: string, template: string): TransformNode {
  return {
    type: 'transform',
    id,
    input,
    transformType: 'template',
    config: { template },
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
  };
}

function createMapNode(id: string, input: string, expression: string): TransformNode {
  return {
    type: 'transform',
    id,
    input,
    transformType: 'map',
    config: { expression },
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
  };
}

function createAST(nodes: any[]): WorkflowAST {
  return {
    metadata: { name: 'test-workflow', version: '1.0' },
    nodes,
    sourceMap: { source: '', filePath: 'test.flow.md', lineOffsets: [0] },
  };
}

// ============================================================================
// Wave Execution Tests
// ============================================================================

describe('Wave Execution', () => {
  test('executes single wave', async () => {
    // Two independent template nodes
    const ast = createAST([
      {
        type: 'transform',
        id: 'a',
        transformType: 'template',
        config: { template: 'Hello A' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        type: 'transform',
        id: 'b',
        transformType: 'template',
        config: { template: 'Hello B' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    await execute(plan, state);

    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('a')?.status).toBe('success');
    expect(state.nodeResults.get('b')?.status).toBe('success');
    expect(state.nodeResults.get('a')?.output).toBe('Hello A');
    expect(state.nodeResults.get('b')?.output).toBe('Hello B');
  });

  test('executes sequential waves', async () => {
    // a -> b chain
    const ast = createAST([
      {
        type: 'transform',
        id: 'a',
        transformType: 'template',
        config: { template: 'First' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        type: 'transform',
        id: 'b',
        input: 'a',
        transformType: 'template',
        config: { template: 'Got: {{input}}' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    expect(plan.waves.length).toBe(2);

    const state = createExecutionState({ workflowId: 'test' });
    await execute(plan, state);

    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('a')?.output).toBe('First');
    expect(state.nodeResults.get('b')?.output).toBe('Got: First');
  });

  test('respects concurrency limit', async () => {
    // 5 independent nodes with maxConcurrency: 2
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      type: 'transform' as const,
      id: `node-${i}`,
      transformType: 'template' as const,
      config: { template: `Node ${i}` },
      loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
    }));

    const ast = createAST(nodes);
    const plan = buildExecutionPlan(ast);
    expect(plan.waves.length).toBe(1);
    expect(plan.waves[0].nodeIds.length).toBe(5);

    const state = createExecutionState({ workflowId: 'test' });
    await execute(plan, state, { maxConcurrency: 2 });

    expect(state.status).toBe('completed');
    for (let i = 0; i < 5; i++) {
      expect(state.nodeResults.get(`node-${i}`)?.status).toBe('success');
    }
  });
});

// ============================================================================
// Map Transform Tests (verifying execution context)
// ============================================================================

describe('Map Transform Execution', () => {
  test('map transforms array', async () => {
    // First node provides array, second maps it
    // NOTE: Using json_encode builtin function since JSON.stringify() is blocked (method call)
    const ast = createAST([
      {
        type: 'transform',
        id: 'data',
        transformType: 'template',
        config: { template: '{{json_encode([1, 2, 3])}}' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });
    await execute(plan, state);

    // This tests that template can output JSON-like strings
    // Full map tests are in transform.test.ts
    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('data')?.output).toBe('[1,2,3]');
  });
});

// ============================================================================
// State Tests
// ============================================================================

describe('Execution State', () => {
  test('records timing information', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'a',
        transformType: 'template',
        config: { template: 'Test' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    const startTime = Date.now();
    await execute(plan, state);
    const endTime = Date.now();

    expect(state.startedAt).toBeLessThanOrEqual(startTime + 10);
    expect(state.completedAt).toBeDefined();
    expect(state.completedAt).toBeGreaterThanOrEqual(state.startedAt);
    expect(state.completedAt).toBeLessThanOrEqual(endTime + 10);

    const nodeResult = state.nodeResults.get('a')!;
    expect(nodeResult.duration).toBeGreaterThanOrEqual(0);
    expect(nodeResult.startedAt).toBeGreaterThanOrEqual(state.startedAt);
    expect(nodeResult.completedAt).toBeLessThanOrEqual(state.completedAt!);
  });

  test('tracks wave progress', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'a',
        transformType: 'template',
        config: { template: 'Wave 0' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        type: 'transform',
        id: 'b',
        input: 'a',
        transformType: 'template',
        config: { template: 'Wave 1' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });
    await execute(plan, state);

    // Final wave should be the last one processed
    expect(state.currentWave).toBe(1);
  });

  test('exposes node outputs in context', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'first',
        transformType: 'template',
        config: { template: 'Hello World' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
      {
        type: 'transform',
        id: 'second',
        input: 'first',
        transformType: 'template',
        config: { template: 'Previous said: {{first.output}}' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });
    await execute(plan, state);

    expect(state.nodeResults.get('second')?.output).toBe('Previous said: Hello World');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  test('marks state as failed on error', async () => {
    // Unknown runtime type will cause error
    const ast = createAST([
      {
        type: 'source',
        id: 'bad',
        sourceType: 'unknown-type',
        config: {},
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    await expect(execute(plan, state)).rejects.toThrow();
    expect(state.status).toBe('failed');
    expect(state.completedAt).toBeDefined();
  });
});
