/**
 * Tests for Temporal Runtimes (Batch 4)
 *
 * Covers: duration parsing, delay runtime, timeout runtime,
 * global execution timeout, and signal threading.
 */

import { test, expect, describe } from 'bun:test';
import { parseDuration } from './duration.ts';
import { delayRuntime } from './delay.ts';
import { timeoutRuntime } from './timeout.ts';
import { TimeoutError } from '../errors.ts';
import { hasRuntime, getRuntime } from '../registry.ts';
import type { ExecutionState } from '../../execution/types.ts';
import type { DelayNode, TimeoutNode, NodeAST, SourceLocation } from '../../types/ast.ts';

// Ensure runtimes are registered
import './index.ts';

// ============================================================================
// Test Helpers
// ============================================================================

const dummyLoc: SourceLocation = {
  start: { line: 1, column: 0, offset: 0 },
  end: { line: 1, column: 10, offset: 10 },
};

function makeState(): ExecutionState {
  return {
    workflowId: 'test',
    runId: 'run-1',
    status: 'running',
    currentWave: 0,
    startedAt: Date.now(),
    nodeResults: new Map(),
    globalContext: {},
    phaseContext: {},
    nodeContext: {},
    config: {},
    secrets: {},
  };
}

function makeDelayNode(id: string, duration: string): DelayNode {
  return {
    type: 'delay',
    id,
    duration,
    loc: dummyLoc,
  };
}

function makeTimeoutNode(
  id: string,
  duration: string,
  children: NodeAST[],
  onTimeout?: string
): TimeoutNode {
  return {
    type: 'timeout',
    id,
    duration,
    onTimeout,
    children,
    loc: dummyLoc,
  };
}

// ============================================================================
// 4.1 Duration Parsing
// ============================================================================

describe('parseDuration', () => {
  test('parses seconds', () => {
    expect(parseDuration('5s')).toBe(5000);
  });

  test('parses milliseconds', () => {
    expect(parseDuration('500ms')).toBe(500);
  });

  test('parses minutes', () => {
    expect(parseDuration('2m')).toBe(120000);
  });

  test('parses hours', () => {
    expect(parseDuration('1h')).toBe(3600000);
  });

  test('parses combined duration', () => {
    expect(parseDuration('1h30m')).toBe(5400000);
  });

  test('parses ISO duration', () => {
    expect(parseDuration('PT30S')).toBe(30000);
    expect(parseDuration('PT1H')).toBe(3600000);
    expect(parseDuration('P1D')).toBe(86400000);
  });

  test('parses number input (milliseconds)', () => {
    expect(parseDuration(5000)).toBe(5000);
  });

  test('throws on invalid input', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration');
  });

  test('throws on empty string', () => {
    expect(() => parseDuration('')).toThrow('Invalid duration');
  });

  test('throws on zero', () => {
    expect(() => parseDuration(0)).toThrow('Invalid duration');
  });

  test('throws on negative', () => {
    expect(() => parseDuration(-1000)).toThrow('Invalid duration');
  });
});

// ============================================================================
// 4.2 Delay Runtime
// ============================================================================

describe('delayRuntime', () => {
  test('is registered as temporal:delay', () => {
    expect(hasRuntime('temporal:delay')).toBe(true);
    expect(getRuntime('temporal:delay')).toBe(delayRuntime);
  });

  test('has correct type', () => {
    expect(delayRuntime.type).toBe('temporal:delay');
  });

  test('passes input through after delay', async () => {
    const node = makeDelayNode('wait', '10ms');
    const input = { data: 'test' };
    const state = makeState();

    const start = Date.now();
    const result = await delayRuntime.execute({
      node,
      input,
      config: {},
      state,
    });
    const elapsed = Date.now() - start;

    expect(result).toEqual({ data: 'test' });
    expect(elapsed).toBeGreaterThanOrEqual(5); // Allow some timing slack
  });

  test('passes undefined input through', async () => {
    const node = makeDelayNode('wait', '10ms');
    const state = makeState();

    const result = await delayRuntime.execute({
      node,
      input: undefined,
      config: {},
      state,
    });

    expect(result).toBeUndefined();
  });

  test('throws on missing duration', async () => {
    const node: DelayNode = {
      type: 'delay',
      id: 'wait',
      duration: '',
      loc: dummyLoc,
    };

    const state = makeState();
    await expect(
      delayRuntime.execute({ node, input: undefined, config: {}, state })
    ).rejects.toThrow('duration');
  });

  test('throws on invalid duration', async () => {
    const node = makeDelayNode('wait', 'invalid');
    const state = makeState();

    await expect(
      delayRuntime.execute({ node, input: undefined, config: {}, state })
    ).rejects.toThrow('Invalid duration');
  });

  test('respects abort signal', async () => {
    const node = makeDelayNode('wait', '10ms');
    const state = makeState();
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    await expect(
      delayRuntime.execute({
        node,
        input: undefined,
        config: {},
        state,
        signal: controller.signal,
      })
    ).rejects.toThrow('aborted');
  });
});

// ============================================================================
// 4.3 Timeout Runtime
// ============================================================================

describe('timeoutRuntime', () => {
  test('is registered as temporal:timeout', () => {
    expect(hasRuntime('temporal:timeout')).toBe(true);
    expect(getRuntime('temporal:timeout')).toBe(timeoutRuntime);
  });

  test('has correct type', () => {
    expect(timeoutRuntime.type).toBe('temporal:timeout');
  });

  test('returns TimeoutResult with correct metadata', async () => {
    const childNode: NodeAST = {
      type: 'source',
      id: 'fetch',
      sourceType: 'http',
      config: { url: 'https://example.com' },
      loc: dummyLoc,
    };
    const node = makeTimeoutNode('safe', '30s', [childNode], 'fallback');
    const state = makeState();

    const result = await timeoutRuntime.execute({
      node,
      input: undefined,
      config: {},
      state,
    });

    expect(result.durationMs).toBe(30000);
    expect(result.children).toEqual([childNode]);
    expect(result.onTimeout).toBe('fallback');
  });

  test('returns TimeoutResult without onTimeout', async () => {
    const childNode: NodeAST = {
      type: 'source',
      id: 'fetch',
      sourceType: 'http',
      config: { url: 'https://example.com' },
      loc: dummyLoc,
    };
    const node = makeTimeoutNode('safe', '5s', [childNode]);
    const state = makeState();

    const result = await timeoutRuntime.execute({
      node,
      input: undefined,
      config: {},
      state,
    });

    expect(result.durationMs).toBe(5000);
    expect(result.children).toEqual([childNode]);
    expect(result.onTimeout).toBeUndefined();
  });

  test('throws on missing duration', async () => {
    const node: TimeoutNode = {
      type: 'timeout',
      id: 'safe',
      duration: '',
      children: [],
      loc: dummyLoc,
    };
    const state = makeState();

    await expect(
      timeoutRuntime.execute({ node, input: undefined, config: {}, state })
    ).rejects.toThrow('duration');
  });
});

// ============================================================================
// 4.4 Global Execution Timeout (integration)
// ============================================================================

describe('global execution timeout', () => {
  test('TimeoutError has correct properties', () => {
    const err = new TimeoutError('timed out', 5000);
    expect(err.name).toBe('TimeoutError');
    expect(err.timeout).toBe(5000);
    expect(err.code).toBe('RUNTIME_TIMEOUT');
    expect(err.message).toBe('timed out');
  });
});

// ============================================================================
// 4.5 Signal in ExecutionParams
// ============================================================================

describe('ExecutionParams signal', () => {
  test('signal is optional and accepted', async () => {
    const node = makeDelayNode('wait', '10ms');
    const state = makeState();

    // Without signal
    const result1 = await delayRuntime.execute({
      node,
      input: 'data',
      config: {},
      state,
    });
    expect(result1).toBe('data');

    // With signal (not aborted)
    const controller = new AbortController();
    const result2 = await delayRuntime.execute({
      node,
      input: 'data',
      config: {},
      state,
      signal: controller.signal,
    });
    expect(result2).toBe('data');
  });
});
