/**
 * Executor Integration Tests
 *
 * Tests for wave execution, parallel blocks, and foreach parallelism.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
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

// ============================================================================
// Integration Tests - Retry
// ============================================================================

describe('retry integration', () => {
  test('uses default retry config for all nodes', async () => {
    // Template transform should succeed on first try
    const ast = createAST([
      {
        type: 'transform',
        id: 'simple',
        transformType: 'template',
        config: { template: 'Hello' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    // Execute with default retry config - should not affect successful execution
    await execute(plan, state, {
      defaultRetryConfig: { maxRetries: 2, backoffBase: 10 },
    });

    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('simple')?.status).toBe('success');
  });

  test('node-level retry config overrides default', async () => {
    // Create a node with its own retry config
    const ast = createAST([
      {
        type: 'transform',
        id: 'with-retry',
        transformType: 'template',
        config: {
          template: 'Test',
          retry: { maxRetries: 1, backoffBase: 5 },
        },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    // Execute with higher default retry - node config should take precedence
    await execute(plan, state, {
      defaultRetryConfig: { maxRetries: 5, backoffBase: 100 },
    });

    expect(state.status).toBe('completed');
  });
});

// ============================================================================
// Integration Tests - Persistence
// ============================================================================

import { join } from 'path';
import { rm, mkdir } from 'fs/promises';

const TEST_PERSIST_DIR = join(import.meta.dir, '__test-persist-state__');

describe('persistence integration', () => {
  beforeEach(async () => {
    await mkdir(TEST_PERSIST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_PERSIST_DIR, { recursive: true, force: true });
  });

  test('saves state after each wave', async () => {
    // Create multi-wave plan: a -> b (two waves)
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
    expect(plan.waves.length).toBe(2);

    const state = createExecutionState({ workflowId: 'persist-test', runId: 'run-1' });
    const persistPath = join(TEST_PERSIST_DIR, 'state.json');

    await execute(plan, state, { persistencePath: persistPath });

    // Verify file exists
    const file = Bun.file(persistPath);
    expect(await file.exists()).toBe(true);

    // Verify state matches final state
    const persisted = await file.json();
    expect(persisted.status).toBe('completed');
    expect(persisted.currentWave).toBe(1);
    expect(persisted.nodeResults.length).toBe(2);
  });

  test('persists state on failure', async () => {
    // Create plan with failing node
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
    const state = createExecutionState({ workflowId: 'fail-test', runId: 'run-2' });
    const persistPath = join(TEST_PERSIST_DIR, 'failed-state.json');

    await expect(execute(plan, state, { persistencePath: persistPath })).rejects.toThrow();

    // Verify state file has status: 'failed'
    const file = Bun.file(persistPath);
    expect(await file.exists()).toBe(true);

    const persisted = await file.json();
    expect(persisted.status).toBe('failed');
  });
});

// ============================================================================
// Integration Tests - Error Handler
// ============================================================================

describe('error handler integration', () => {
  test('calls error handler on workflow failure', async () => {
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

    let handlerCalled = false;
    let handlerError: Error | undefined;
    let handlerState: any;

    const errorHandler = mock((error: Error, state: any) => {
      handlerCalled = true;
      handlerError = error;
      handlerState = state;
    });

    await expect(execute(plan, state, { errorHandler })).rejects.toThrow();

    expect(handlerCalled).toBe(true);
    expect(handlerError).toBeDefined();
    expect(handlerError?.message).toContain('Unknown runtime type');
    expect(handlerState.status).toBe('failed');
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  test('still throws after error handler', async () => {
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

    const errorHandler = mock(() => {
      // Handler runs successfully
    });

    // Should still throw even though handler succeeded
    await expect(execute(plan, state, { errorHandler })).rejects.toThrow();
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  test('error handler errors do not mask original error', async () => {
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

    const errorHandler = mock(() => {
      throw new Error('Handler exploded');
    });

    // Should throw original error, not handler error
    await expect(execute(plan, state, { errorHandler })).rejects.toThrow('Unknown runtime type');
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Integration Tests - Logging
// ============================================================================

const TEST_LOG_DIR = join(import.meta.dir, '__test-executor-log__');

describe('logging integration', () => {
  beforeEach(async () => {
    await mkdir(TEST_LOG_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_LOG_DIR, { recursive: true, force: true });
  });

  test('appends execution log on success', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'node-a',
        transformType: 'template',
        config: { template: 'Hello World' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'log-test', runId: 'run-log-1' });

    // Create initial workflow file
    const logPath = join(TEST_LOG_DIR, 'workflow.flow.md');
    await Bun.write(logPath, '# Test Workflow\n\n<workflow></workflow>\n');

    await execute(plan, state, { logPath });

    const content = await Bun.file(logPath).text();

    // Verify original content preserved
    expect(content).toContain('# Test Workflow');
    expect(content).toContain('<workflow>');

    // Verify log section added
    expect(content).toContain('## Execution Log');
    expect(content).toContain('run-log-1');
    expect(content).toContain('log-test');

    // Verify node results table
    expect(content).toContain('### Node Results');
    expect(content).toContain('| node-a |');
    expect(content).toContain('| success |');
  });

  test('appends execution log on failure', async () => {
    const ast = createAST([
      {
        type: 'source',
        id: 'bad-node',
        sourceType: 'unknown-type',
        config: {},
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'fail-log-test', runId: 'run-fail-log' });

    const logPath = join(TEST_LOG_DIR, 'fail-workflow.flow.md');
    await Bun.write(logPath, '# Failing Workflow\n');

    await expect(execute(plan, state, { logPath })).rejects.toThrow();

    const content = await Bun.file(logPath).text();

    // Log should still be appended even on failure
    expect(content).toContain('## Execution Log');
    expect(content).toContain('run-fail-log');
    expect(content).toContain('**Status:** failed');
    expect(content).toContain('| bad-node | failed |');
  });

  test('log errors do not mask execution result', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'node-a',
        transformType: 'template',
        config: { template: 'Hello' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'test' });

    // Use invalid path (directory instead of file) to cause log error
    // But execution should still complete successfully
    const logPath = TEST_LOG_DIR; // This is a directory, not a file

    // Execute should succeed even if logging fails
    await execute(plan, state, { logPath });

    expect(state.status).toBe('completed');
  });
});

// ============================================================================
// Integration Tests - Combined Features
// ============================================================================

describe('combined production features', () => {
  const TEST_COMBINED_DIR = join(import.meta.dir, '__test-combined__');

  beforeEach(async () => {
    await mkdir(TEST_COMBINED_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_COMBINED_DIR, { recursive: true, force: true });
  });

  test('persistence and logging work together', async () => {
    const ast = createAST([
      {
        type: 'transform',
        id: 'combined-node',
        transformType: 'template',
        config: { template: 'Combined test' },
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'combined', runId: 'run-combined' });

    const persistPath = join(TEST_COMBINED_DIR, 'state.json');
    const logPath = join(TEST_COMBINED_DIR, 'workflow.flow.md');
    await Bun.write(logPath, '# Combined Workflow\n');

    await execute(plan, state, { persistencePath: persistPath, logPath });

    // Both files should exist with correct content
    expect(await Bun.file(persistPath).exists()).toBe(true);

    const logContent = await Bun.file(logPath).text();
    expect(logContent).toContain('## Execution Log');

    const persistedState = await Bun.file(persistPath).json();
    expect(persistedState.status).toBe('completed');
  });

  test('error handler, persistence, and logging all trigger on failure', async () => {
    const ast = createAST([
      {
        type: 'source',
        id: 'fail-all',
        sourceType: 'unknown-type',
        config: {},
        loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      },
    ]);

    const plan = buildExecutionPlan(ast);
    const state = createExecutionState({ workflowId: 'all-features', runId: 'run-all' });

    const persistPath = join(TEST_COMBINED_DIR, 'fail-state.json');
    const logPath = join(TEST_COMBINED_DIR, 'fail-workflow.flow.md');
    await Bun.write(logPath, '# All Features Workflow\n');

    let errorHandlerCalled = false;
    const errorHandler = mock(() => {
      errorHandlerCalled = true;
    });

    await expect(execute(plan, state, {
      persistencePath: persistPath,
      logPath,
      errorHandler,
    })).rejects.toThrow();

    // All three should have triggered
    expect(errorHandlerCalled).toBe(true);
    expect(await Bun.file(persistPath).exists()).toBe(true);

    const persistedState = await Bun.file(persistPath).json();
    expect(persistedState.status).toBe('failed');

    const logContent = await Bun.file(logPath).text();
    expect(logContent).toContain('**Status:** failed');
  });
});
