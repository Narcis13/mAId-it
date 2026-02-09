/**
 * Checkpoint Runtime Tests
 *
 * Tests for human-in-the-loop checkpoint functionality.
 * Note: These tests mock stdin/readline since actual terminal
 * interaction is not possible in automated tests.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { CheckpointRuntime } from './runtime';
import type { ExecutionParams } from '../types';
import type { CheckpointConfig, CheckpointResult } from './types';
import type { ExecutionState } from '../../execution/types';
import type { CheckpointNode } from '../../types/ast';

// Helper to create execution params
function createParams(config: CheckpointConfig): ExecutionParams<CheckpointConfig, unknown> {
  const node: CheckpointNode = {
    id: 'test-checkpoint',
    type: 'checkpoint',
    prompt: config.message,
    timeout: config.timeout,
    defaultAction: config.defaultAction,
    loc: {
      start: { line: 1, column: 0, offset: 0 },
      end: { line: 1, column: 10, offset: 10 },
    },
  };

  const state: ExecutionState = {
    workflowId: 'test-workflow',
    runId: 'test-run',
    status: 'running',
    currentWave: 0,
    startedAt: Date.now(),
    globalContext: {},
    phaseContext: {},
    nodeContext: {},
    nodeResults: new Map(),
    config: {},
    secrets: {},
  };

  return { node, input: undefined, config, state };
}

describe('CheckpointRuntime', () => {
  let runtime: CheckpointRuntime;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    runtime = new CheckpointRuntime();
    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    // Restore isTTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe('type identifier', () => {
    test('has correct type', () => {
      expect(runtime.type).toBe('checkpoint');
    });
  });

  describe('non-TTY environment', () => {
    beforeEach(() => {
      // Simulate non-TTY environment
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test('returns default action immediately when defaultAction is reject', async () => {
      const params = createParams({
        message: 'Approve deployment?',
        defaultAction: 'reject',
      });

      const result = await runtime.execute(params);

      expect(result.action).toBe('reject');
      expect(result.timedOut).toBe(false);
      expect(result.respondedAt).toBeGreaterThan(0);
    });

    test('returns default action immediately when defaultAction is approve', async () => {
      const params = createParams({
        message: 'Approve deployment?',
        defaultAction: 'approve',
      });

      const result = await runtime.execute(params);

      expect(result.action).toBe('approve');
      expect(result.timedOut).toBe(false);
    });

    test('defaults to reject when defaultAction not specified', async () => {
      const params = createParams({
        message: 'Approve deployment?',
      });

      const result = await runtime.execute(params);

      expect(result.action).toBe('reject');
    });

    test('does not wait for timeout in non-TTY', async () => {
      const params = createParams({
        message: 'Approve deployment?',
        timeout: 10000, // 10 seconds - would timeout if waiting
        defaultAction: 'approve',
      });

      const start = Date.now();
      const result = await runtime.execute(params);
      const elapsed = Date.now() - start;

      expect(result.action).toBe('approve');
      expect(elapsed).toBeLessThan(100); // Should return almost immediately
    });
  });

  describe('CheckpointResult structure', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test('result has all required fields', async () => {
      const params = createParams({
        message: 'Test message',
        defaultAction: 'approve',
      });

      const result = await runtime.execute(params);

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('timedOut');
      expect(result).toHaveProperty('respondedAt');
      expect(typeof result.action).toBe('string');
      expect(typeof result.timedOut).toBe('boolean');
      expect(typeof result.respondedAt).toBe('number');
    });

    test('input field is optional and not present by default', async () => {
      const params = createParams({
        message: 'Test message',
        defaultAction: 'approve',
      });

      const result = await runtime.execute(params);

      expect(result.input).toBeUndefined();
    });
  });

  describe('configuration options', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test('allowInput option is accepted', async () => {
      const params = createParams({
        message: 'Test message',
        allowInput: true,
        defaultAction: 'approve',
      });

      // Should not throw
      const result = await runtime.execute(params);
      expect(result.action).toBe('approve');
    });

    test('timeout option is accepted', async () => {
      const params = createParams({
        message: 'Test message',
        timeout: 5000,
        defaultAction: 'reject',
      });

      // In non-TTY, timeout is not used but should be accepted
      const result = await runtime.execute(params);
      expect(result.action).toBe('reject');
    });
  });
});

describe('CheckpointRuntime parseAction (via type checking)', () => {
  // We can't easily test the private parseAction method directly,
  // but we verify the valid action types are correct
  test('CheckpointAction type includes approve', () => {
    const action: CheckpointResult['action'] = 'approve';
    expect(action).toBe('approve');
  });

  test('CheckpointAction type includes reject', () => {
    const action: CheckpointResult['action'] = 'reject';
    expect(action).toBe('reject');
  });

  test('CheckpointAction type includes input', () => {
    const action: CheckpointResult['action'] = 'input';
    expect(action).toBe('input');
  });

  test('CheckpointAction type includes custom named actions', () => {
    const action: CheckpointResult['action'] = 'edit';
    expect(action).toBe('edit');
  });
});

// ============================================================================
// Checkpoint Conditional Display Tests (Item 7.5)
// ============================================================================

describe('CheckpointRuntime conditional display', () => {
  let runtime: CheckpointRuntime;

  beforeEach(() => {
    runtime = new CheckpointRuntime();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  test('skips checkpoint when condition evaluates to false', async () => {
    const params = createParams({
      message: 'Review this?',
      condition: 'word_count > 1000',
    });
    // Inject word_count into state's globalContext
    params.state.globalContext = { word_count: 500 };

    const result = await runtime.execute(params);

    expect(result.action).toBe('approve');
    expect(result.skipped).toBe(true);
  });

  test('shows checkpoint when condition evaluates to true', async () => {
    const params = createParams({
      message: 'Review this?',
      defaultAction: 'reject',
      condition: 'word_count > 1000',
    });
    params.state.globalContext = { word_count: 1500 };

    const result = await runtime.execute(params);

    // In non-TTY, should use default action (not skipped)
    expect(result.action).toBe('reject');
    expect(result.skipped).toBeUndefined();
  });

  test('shows checkpoint when condition is not specified', async () => {
    const params = createParams({
      message: 'Review this?',
      defaultAction: 'approve',
    });

    const result = await runtime.execute(params);

    expect(result.action).toBe('approve');
    expect(result.skipped).toBeUndefined();
  });

  test('shows checkpoint when condition evaluation throws', async () => {
    const params = createParams({
      message: 'Review this?',
      defaultAction: 'reject',
      // Invalid expression syntax should throw during evaluation
      condition: '===invalid===',
    });

    const result = await runtime.execute(params);

    // On error, should fall through and show checkpoint
    expect(result.action).toBe('reject');
    expect(result.skipped).toBeUndefined();
  });
});

// ============================================================================
// Checkpoint Action Config Tests (Item 7.4)
// ============================================================================

describe('CheckpointRuntime action config', () => {
  let runtime: CheckpointRuntime;

  beforeEach(() => {
    runtime = new CheckpointRuntime();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  test('accepts actions in config without error', async () => {
    const params = createParams({
      message: 'Choose action',
      defaultAction: 'approve',
      actions: [
        { id: 'edit', label: 'Edit', goto: 'apply-edits' },
        { id: 'skip', label: 'Skip' },
      ],
    });

    // In non-TTY, should use default action
    const result = await runtime.execute(params);
    expect(result.action).toBe('approve');
  });

  test('CheckpointResult can have goto field', () => {
    const result: CheckpointResult = {
      action: 'edit',
      timedOut: false,
      respondedAt: Date.now(),
      goto: 'apply-edits',
    };

    expect(result.goto).toBe('apply-edits');
    expect(result.action).toBe('edit');
  });
});
