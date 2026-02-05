/**
 * Persistence Tests
 *
 * Tests for state save/load functions and path utilities.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { saveState, loadState, getStatePath } from './persistence';
import { createExecutionState, recordNodeResult } from './state';
import { FileError } from '../runtimes/errors';
import type { ExecutionState, NodeResult } from './types';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = '.maidit-state-test';

async function cleanup() {
  try {
    await Bun.$`rm -rf ${TEST_DIR}`.quiet();
  } catch {
    // Ignore cleanup errors
  }
}

beforeEach(async () => {
  await cleanup();
});

afterEach(async () => {
  await cleanup();
});

// ============================================================================
// getStatePath Tests
// ============================================================================

describe('getStatePath', () => {
  test('generates correct path pattern', () => {
    const path = getStatePath('my-workflow', 'run-123');
    expect(path).toBe('.maidit-state/my-workflow/run-123.json');
  });

  test('handles special characters in IDs', () => {
    const path = getStatePath('workflow-v1.0', 'run_2024_01');
    expect(path).toBe('.maidit-state/workflow-v1.0/run_2024_01.json');
  });
});

// ============================================================================
// saveState Tests
// ============================================================================

describe('saveState', () => {
  test('saves state to JSON file', async () => {
    const state = createExecutionState({
      workflowId: 'test-workflow',
      runId: 'test-run',
      config: { debug: true },
      secrets: { API_KEY: 'secret123' },
    });

    const filePath = `${TEST_DIR}/test-workflow/test-run.json`;
    await saveState(state, filePath);

    // Verify file exists and is valid JSON
    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);

    const persisted = await file.json();
    expect(persisted.workflowId).toBe('test-workflow');
    expect(persisted.runId).toBe('test-run');
    expect(persisted.config).toEqual({ debug: true });
    expect(persisted.secrets).toEqual({ API_KEY: 'secret123' });
  });

  test('serializes nodeResults Map as array', async () => {
    const state = createExecutionState({
      workflowId: 'test-workflow',
      runId: 'test-run',
    });

    // Add some node results
    const result1: NodeResult = {
      status: 'success',
      output: { data: 'test' },
      duration: 100,
      startedAt: 1000,
      completedAt: 1100,
    };

    const result2: NodeResult = {
      status: 'failed',
      error: new Error('Test error'),
      duration: 50,
      startedAt: 1200,
      completedAt: 1250,
    };

    recordNodeResult(state, 'node1', result1);
    recordNodeResult(state, 'node2', result2);

    const filePath = `${TEST_DIR}/map-test/run.json`;
    await saveState(state, filePath);

    const file = Bun.file(filePath);
    const persisted = await file.json();

    // nodeResults should be an array of tuples
    expect(Array.isArray(persisted.nodeResults)).toBe(true);
    expect(persisted.nodeResults.length).toBe(2);

    // Check tuple format
    const node1Tuple = persisted.nodeResults.find(
      ([id]: [string, unknown]) => id === 'node1'
    );
    expect(node1Tuple).toBeDefined();
    expect(node1Tuple[1].status).toBe('success');
    expect(node1Tuple[1].output).toEqual({ data: 'test' });
  });

  test('creates parent directories', async () => {
    const state = createExecutionState({
      workflowId: 'nested',
      runId: 'deep',
    });

    const filePath = `${TEST_DIR}/deep/nested/path/state.json`;
    await saveState(state, filePath);

    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);
  });

  test('preserves all state fields', async () => {
    const state = createExecutionState({
      workflowId: 'full-test',
      runId: 'full-run',
      config: { timeout: 5000, debug: false },
      secrets: { TOKEN: 'abc', KEY: 'xyz' },
      globalContext: { env: 'test' },
    });

    state.status = 'running';
    state.currentWave = 2;
    state.phaseContext = { phase: 'process' };
    state.nodeContext = { current: 'nodeA' };

    const filePath = `${TEST_DIR}/full/run.json`;
    await saveState(state, filePath);

    const file = Bun.file(filePath);
    const persisted = await file.json();

    expect(persisted.workflowId).toBe('full-test');
    expect(persisted.runId).toBe('full-run');
    expect(persisted.status).toBe('running');
    expect(persisted.currentWave).toBe(2);
    expect(persisted.config).toEqual({ timeout: 5000, debug: false });
    expect(persisted.secrets).toEqual({ TOKEN: 'abc', KEY: 'xyz' });
    expect(persisted.globalContext).toEqual({ env: 'test' });
    expect(persisted.phaseContext).toEqual({ phase: 'process' });
    expect(persisted.nodeContext).toEqual({ current: 'nodeA' });
  });
});

// ============================================================================
// loadState Tests
// ============================================================================

describe('loadState', () => {
  test('loads state from JSON file', async () => {
    // Create and save state
    const original = createExecutionState({
      workflowId: 'load-test',
      runId: 'load-run',
      config: { debug: true },
    });

    const filePath = `${TEST_DIR}/load/state.json`;
    await saveState(original, filePath);

    // Load state
    const loaded = await loadState(filePath);

    expect(loaded.workflowId).toBe('load-test');
    expect(loaded.runId).toBe('load-run');
    expect(loaded.config).toEqual({ debug: true });
  });

  test('restores nodeResults as Map', async () => {
    const original = createExecutionState({
      workflowId: 'map-restore',
      runId: 'run',
    });

    const result: NodeResult = {
      status: 'success',
      output: { value: 42 },
      duration: 100,
      startedAt: 1000,
      completedAt: 1100,
    };

    recordNodeResult(original, 'testNode', result);

    const filePath = `${TEST_DIR}/map-restore/run.json`;
    await saveState(original, filePath);

    // Load and verify Map is restored
    const loaded = await loadState(filePath);

    expect(loaded.nodeResults instanceof Map).toBe(true);
    expect(loaded.nodeResults.size).toBe(1);
    expect(loaded.nodeResults.has('testNode')).toBe(true);

    const loadedResult = loaded.nodeResults.get('testNode');
    expect(loadedResult?.status).toBe('success');
    expect(loadedResult?.output).toEqual({ value: 42 });
  });

  test('throws FileError for non-existent file', async () => {
    await expect(
      loadState(`${TEST_DIR}/nonexistent/file.json`)
    ).rejects.toThrow(FileError);
  });

  test('applies config overrides', async () => {
    const original = createExecutionState({
      workflowId: 'override-test',
      runId: 'run',
      config: { debug: false, timeout: 1000 },
    });

    const filePath = `${TEST_DIR}/override/run.json`;
    await saveState(original, filePath);

    // Load with override
    const loaded = await loadState(filePath, {
      config: { debug: true, timeout: 5000 },
    });

    expect(loaded.config).toEqual({ debug: true, timeout: 5000 });
  });

  test('applies secrets overrides', async () => {
    const original = createExecutionState({
      workflowId: 'secrets-test',
      runId: 'run',
      secrets: { OLD_KEY: 'old-value' },
    });

    const filePath = `${TEST_DIR}/secrets/run.json`;
    await saveState(original, filePath);

    // Load with new secrets
    const loaded = await loadState(filePath, {
      secrets: { NEW_KEY: 'new-value' },
    });

    expect(loaded.secrets).toEqual({ NEW_KEY: 'new-value' });
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('round-trip', () => {
  test('preserves all state through save/load cycle', async () => {
    const original = createExecutionState({
      workflowId: 'roundtrip',
      runId: 'test-123',
      config: { retry: 3, debug: true },
      secrets: { API_KEY: 'secret', TOKEN: 'token123' },
      globalContext: { env: 'production', version: '1.0' },
    });

    // Modify state
    original.status = 'completed';
    original.currentWave = 5;
    original.completedAt = Date.now();
    original.phaseContext = { phase: 'final' };
    original.nodeContext = { lastNode: 'sink' };

    // Add multiple node results
    const results: Array<[string, NodeResult]> = [
      [
        'source1',
        {
          status: 'success',
          output: { data: [1, 2, 3] },
          duration: 150,
          startedAt: 1000,
          completedAt: 1150,
        },
      ],
      [
        'transform1',
        {
          status: 'success',
          output: 'transformed',
          duration: 50,
          startedAt: 1200,
          completedAt: 1250,
        },
      ],
      [
        'sink1',
        {
          status: 'success',
          output: { written: true },
          duration: 200,
          startedAt: 1300,
          completedAt: 1500,
        },
      ],
    ];

    for (const [nodeId, result] of results) {
      recordNodeResult(original, nodeId, result);
    }

    // Save and load
    const filePath = `${TEST_DIR}/roundtrip/state.json`;
    await saveState(original, filePath);
    const loaded = await loadState(filePath);

    // Verify all fields
    expect(loaded.workflowId).toBe(original.workflowId);
    expect(loaded.runId).toBe(original.runId);
    expect(loaded.status).toBe(original.status);
    expect(loaded.currentWave).toBe(original.currentWave);
    expect(loaded.startedAt).toBe(original.startedAt);
    expect(loaded.completedAt).toBe(original.completedAt);
    expect(loaded.config).toEqual(original.config);
    expect(loaded.secrets).toEqual(original.secrets);
    expect(loaded.globalContext).toEqual(original.globalContext);
    expect(loaded.phaseContext).toEqual(original.phaseContext);
    expect(loaded.nodeContext).toEqual(original.nodeContext);

    // Verify Map contents
    expect(loaded.nodeResults.size).toBe(original.nodeResults.size);
    for (const [nodeId, result] of original.nodeResults) {
      const loadedResult = loaded.nodeResults.get(nodeId);
      expect(loadedResult).toBeDefined();
      expect(loadedResult?.status).toBe(result.status);
      expect(loadedResult?.output).toEqual(result.output);
      expect(loadedResult?.duration).toBe(result.duration);
    }
  });

  test('preserves Map entries with complex output values', async () => {
    const original = createExecutionState({
      workflowId: 'complex',
      runId: 'run',
    });

    // Complex nested output
    const complexResult: NodeResult = {
      status: 'success',
      output: {
        users: [
          { id: 1, name: 'Alice', tags: ['admin', 'user'] },
          { id: 2, name: 'Bob', tags: ['user'] },
        ],
        metadata: {
          total: 2,
          nested: { deep: { value: true } },
        },
        nullValue: null,
        undefinedValue: undefined,
      },
      duration: 100,
      startedAt: 1000,
      completedAt: 1100,
    };

    recordNodeResult(original, 'complex-node', complexResult);

    const filePath = `${TEST_DIR}/complex/state.json`;
    await saveState(original, filePath);
    const loaded = await loadState(filePath);

    const loadedResult = loaded.nodeResults.get('complex-node');
    expect(loadedResult?.output).toEqual(complexResult.output);
  });
});
