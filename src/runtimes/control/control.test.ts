/**
 * Control Flow Runtime Tests
 *
 * Tests for break, goto signals and control flow runtimes.
 * Note: Full integration tests with body execution are for Phase 6 (Scheduling).
 * These tests verify runtime behavior in isolation.
 */

import { test, expect, describe } from 'bun:test';
import { BreakSignal, GotoSignal } from './signals.ts';
import { breakRuntime } from './break.ts';
import { gotoRuntime } from './goto.ts';
import { branchRuntime, type BranchResult } from './branch.ts';
import { ifRuntime, type IfResult } from './if.ts';
import { loopRuntime, type LoopResult } from './loop.ts';
import { whileRuntime, type WhileResult } from './while.ts';
import { foreachRuntime, type ForeachResult } from './foreach.ts';
import { parallelRuntime, type ParallelResult } from './parallel.ts';
import { DEFAULT_MAX_ITERATIONS } from './types.ts';
import type { ExecutionState } from '../../execution/types.ts';
import type { BranchNode, IfNode, LoopNode, WhileNode, ForeachNode, ParallelNode, NodeAST } from '../../types/ast.ts';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal ExecutionState for testing.
 */
function createTestState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    workflowId: 'test-workflow',
    runId: 'test-run',
    status: 'running',
    currentWave: 0,
    startedAt: Date.now(),
    nodeResults: new Map(),
    globalContext: {},
    phaseContext: {},
    nodeContext: {},
    config: {},
    secrets: {},
    ...overrides,
  };
}

/**
 * Create a minimal NodeAST for testing.
 */
function createTestNode(overrides: Partial<NodeAST> = {}): NodeAST {
  return {
    id: 'test-node',
    type: 'control',
    source: { line: 1, column: 0, file: 'test.flow' },
    ...overrides,
  } as NodeAST;
}

/**
 * Create a mock branch node for testing.
 */
function createBranchNode(cases: Array<{ condition: string; nodeIds: string[] }>, defaultNodeIds?: string[]): BranchNode {
  return {
    id: 'test-branch',
    type: 'branch',
    source: { line: 1, column: 0, file: 'test.flow' },
    cases: cases.map((c) => ({
      condition: c.condition,
      nodes: c.nodeIds.map((id) => createTestNode({ id })),
    })),
    default: defaultNodeIds?.map((id) => createTestNode({ id })),
  } as BranchNode;
}

/**
 * Create a mock if node for testing.
 */
function createIfNode(condition: string, thenIds: string[], elseIds?: string[]): IfNode {
  return {
    id: 'test-if',
    type: 'if',
    source: { line: 1, column: 0, file: 'test.flow' },
    condition,
    then: thenIds.map((id) => createTestNode({ id })),
    else: elseIds?.map((id) => createTestNode({ id })),
  } as IfNode;
}

/**
 * Create a mock loop node for testing.
 */
function createLoopNode(bodyIds: string[], maxIterations?: number, breakCondition?: string): LoopNode {
  return {
    id: 'test-loop',
    type: 'loop',
    source: { line: 1, column: 0, file: 'test.flow' },
    body: bodyIds.map((id) => createTestNode({ id })),
    maxIterations,
    breakCondition,
  } as LoopNode;
}

/**
 * Create a mock while node for testing.
 */
function createWhileNode(condition: string, bodyIds: string[]): WhileNode {
  return {
    id: 'test-while',
    type: 'while',
    source: { line: 1, column: 0, file: 'test.flow' },
    condition,
    body: bodyIds.map((id) => createTestNode({ id })),
  } as WhileNode;
}

/**
 * Create a mock foreach node for testing.
 */
function createForeachNode(
  collection: string,
  bodyIds: string[],
  itemVar?: string,
  maxConcurrency?: number
): ForeachNode {
  return {
    id: 'test-foreach',
    type: 'foreach',
    source: { line: 1, column: 0, file: 'test.flow' },
    collection,
    body: bodyIds.map((id) => createTestNode({ id })),
    itemVar,
    maxConcurrency,
  } as ForeachNode;
}

// ============================================================================
// Signal Class Tests
// ============================================================================

describe('BreakSignal', () => {
  test('is instance of Error', () => {
    const signal = new BreakSignal();
    expect(signal).toBeInstanceOf(Error);
  });

  test('is instance of BreakSignal', () => {
    const signal = new BreakSignal();
    expect(signal).toBeInstanceOf(BreakSignal);
  });

  test('has name property set to BreakSignal', () => {
    const signal = new BreakSignal();
    expect(signal.name).toBe('BreakSignal');
  });

  test('has undefined targetLoopId when not specified', () => {
    const signal = new BreakSignal();
    expect(signal.targetLoopId).toBeUndefined();
  });

  test('has correct targetLoopId when specified', () => {
    const signal = new BreakSignal('outer-loop');
    expect(signal.targetLoopId).toBe('outer-loop');
  });

  test('has descriptive message without target', () => {
    const signal = new BreakSignal();
    expect(signal.message).toBe('Break');
  });

  test('has descriptive message with target', () => {
    const signal = new BreakSignal('outer-loop');
    expect(signal.message).toBe('Break to loop: outer-loop');
  });

  test('instanceof works correctly after throw and catch', () => {
    try {
      throw new BreakSignal('test-loop');
    } catch (e) {
      expect(e).toBeInstanceOf(BreakSignal);
      expect((e as BreakSignal).targetLoopId).toBe('test-loop');
    }
  });
});

describe('GotoSignal', () => {
  test('is instance of Error', () => {
    const signal = new GotoSignal('target-node');
    expect(signal).toBeInstanceOf(Error);
  });

  test('is instance of GotoSignal', () => {
    const signal = new GotoSignal('target-node');
    expect(signal).toBeInstanceOf(GotoSignal);
  });

  test('has name property set to GotoSignal', () => {
    const signal = new GotoSignal('target-node');
    expect(signal.name).toBe('GotoSignal');
  });

  test('has correct targetNodeId', () => {
    const signal = new GotoSignal('some-target');
    expect(signal.targetNodeId).toBe('some-target');
  });

  test('has descriptive message', () => {
    const signal = new GotoSignal('retry-point');
    expect(signal.message).toBe('Goto: retry-point');
  });

  test('instanceof works correctly after throw and catch', () => {
    try {
      throw new GotoSignal('target-node');
    } catch (e) {
      expect(e).toBeInstanceOf(GotoSignal);
      expect((e as GotoSignal).targetNodeId).toBe('target-node');
    }
  });
});

// ============================================================================
// Break Runtime Tests
// ============================================================================

describe('breakRuntime', () => {
  test('has correct type identifier', () => {
    expect(breakRuntime.type).toBe('control:break');
  });

  test('throws BreakSignal when executed', async () => {
    await expect(
      breakRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: {},
        state: createTestState(),
      })
    ).rejects.toBeInstanceOf(BreakSignal);
  });

  test('throws BreakSignal with undefined targetLoopId when not specified', async () => {
    try {
      await breakRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: {},
        state: createTestState(),
      });
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BreakSignal);
      expect((e as BreakSignal).targetLoopId).toBeUndefined();
    }
  });

  test('throws BreakSignal with correct targetLoopId when specified', async () => {
    try {
      await breakRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: { loop: 'outer-loop' },
        state: createTestState(),
      });
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BreakSignal);
      expect((e as BreakSignal).targetLoopId).toBe('outer-loop');
    }
  });
});

// ============================================================================
// Goto Runtime Tests
// ============================================================================

describe('gotoRuntime', () => {
  test('has correct type identifier', () => {
    expect(gotoRuntime.type).toBe('control:goto');
  });

  test('throws GotoSignal when executed', async () => {
    await expect(
      gotoRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: { target: 'target-node' },
        state: createTestState(),
      })
    ).rejects.toBeInstanceOf(GotoSignal);
  });

  test('throws GotoSignal with correct targetNodeId', async () => {
    try {
      await gotoRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: { target: 'retry-point' },
        state: createTestState(),
      });
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(GotoSignal);
      expect((e as GotoSignal).targetNodeId).toBe('retry-point');
    }
  });
});

// ============================================================================
// Branch Runtime Tests
// ============================================================================

describe('branchRuntime', () => {
  test('has correct type identifier', () => {
    expect(branchRuntime.type).toBe('control:branch');
  });

  test('returns first matching case', async () => {
    const branchNode = createBranchNode([
      { condition: 'status === "error"', nodeIds: ['error-handler'] },
      { condition: 'status === "success"', nodeIds: ['success-handler'] },
    ]);

    const result = await branchRuntime.execute({
      node: branchNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { status: 'success' } }),
    });

    expect(result.matched).toBe(true);
    expect(result.caseIndex).toBe(1);
    expect(result.bodyNodeIds).toEqual(['success-handler']);
    expect(result.useDefault).toBe(false);
  });

  test('returns first case when multiple match', async () => {
    const branchNode = createBranchNode([
      { condition: 'x > 0', nodeIds: ['case-a'] },
      { condition: 'x > 5', nodeIds: ['case-b'] },
    ]);

    const result = await branchRuntime.execute({
      node: branchNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { x: 10 } }),
    });

    expect(result.matched).toBe(true);
    expect(result.caseIndex).toBe(0);
    expect(result.bodyNodeIds).toEqual(['case-a']);
  });

  test('returns default when no case matches', async () => {
    const branchNode = createBranchNode(
      [
        { condition: 'status === "a"', nodeIds: ['case-a'] },
        { condition: 'status === "b"', nodeIds: ['case-b'] },
      ],
      ['default-handler']
    );

    const result = await branchRuntime.execute({
      node: branchNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { status: 'c' } }),
    });

    expect(result.matched).toBe(true);
    expect(result.caseIndex).toBeUndefined();
    expect(result.bodyNodeIds).toEqual(['default-handler']);
    expect(result.useDefault).toBe(true);
  });

  test('returns no match when no case matches and no default', async () => {
    const branchNode = createBranchNode([
      { condition: 'status === "a"', nodeIds: ['case-a'] },
    ]);

    const result = await branchRuntime.execute({
      node: branchNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { status: 'b' } }),
    });

    expect(result.matched).toBe(false);
    expect(result.caseIndex).toBeUndefined();
    expect(result.bodyNodeIds).toEqual([]);
    expect(result.useDefault).toBe(false);
  });

  test('returns multiple body node IDs in order', async () => {
    const branchNode = createBranchNode([
      { condition: 'true', nodeIds: ['step1', 'step2', 'step3'] },
    ]);

    const result = await branchRuntime.execute({
      node: branchNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.bodyNodeIds).toEqual(['step1', 'step2', 'step3']);
  });
});

// ============================================================================
// If Runtime Tests
// ============================================================================

describe('ifRuntime', () => {
  test('has correct type identifier', () => {
    expect(ifRuntime.type).toBe('control:if');
  });

  test('returns then branch when condition is true', async () => {
    const ifNode = createIfNode('x > 5', ['then-step'], ['else-step']);

    const result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { x: 10 } }),
    });

    expect(result.condition).toBe(true);
    expect(result.branch).toBe('then');
    expect(result.bodyNodeIds).toEqual(['then-step']);
  });

  test('returns else branch when condition is false', async () => {
    const ifNode = createIfNode('x > 5', ['then-step'], ['else-step']);

    const result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { x: 3 } }),
    });

    expect(result.condition).toBe(false);
    expect(result.branch).toBe('else');
    expect(result.bodyNodeIds).toEqual(['else-step']);
  });

  test('returns none branch when condition is false and no else', async () => {
    const ifNode = createIfNode('x > 5', ['then-step']);

    const result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { x: 3 } }),
    });

    expect(result.condition).toBe(false);
    expect(result.branch).toBe('none');
    expect(result.bodyNodeIds).toEqual([]);
  });

  test('evaluates truthy values correctly', async () => {
    const ifNode = createIfNode('value', ['then-step']);

    // Non-empty string is truthy
    let result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: 'hello' } }),
    });
    expect(result.condition).toBe(true);

    // Non-zero number is truthy
    result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: 1 } }),
    });
    expect(result.condition).toBe(true);

    // Empty object is truthy
    result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: {} } }),
    });
    expect(result.condition).toBe(true);
  });

  test('evaluates falsy values correctly', async () => {
    const ifNode = createIfNode('value', ['then-step'], ['else-step']);

    // 0 is falsy
    let result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: 0 } }),
    });
    expect(result.condition).toBe(false);

    // Empty string is falsy
    result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: '' } }),
    });
    expect(result.condition).toBe(false);

    // null is falsy
    result = await ifRuntime.execute({
      node: ifNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { value: null } }),
    });
    expect(result.condition).toBe(false);
  });
});

// ============================================================================
// Loop Runtime Tests
// ============================================================================

describe('loopRuntime', () => {
  test('has correct type identifier', () => {
    expect(loopRuntime.type).toBe('control:loop');
  });

  test('returns maxIterations from AST node', async () => {
    const loopNode = createLoopNode(['step1'], 5);

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.maxIterations).toBe(5);
    expect(result.bodyNodeIds).toEqual(['step1']);
  });

  test('returns maxIterations from config when not in AST', async () => {
    const loopNode = createLoopNode(['step1']);

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: { maxIterations: 10 },
      state: createTestState(),
    });

    expect(result.maxIterations).toBe(10);
  });

  test('uses DEFAULT_MAX_ITERATIONS when not specified', async () => {
    const loopNode = createLoopNode(['step1']);

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.maxIterations).toBe(DEFAULT_MAX_ITERATIONS);
    expect(result.maxIterations).toBe(1000);
  });

  test('returns breakCondition when specified', async () => {
    const loopNode = createLoopNode(['step1'], 10, 'success === true');

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.breakCondition).toBe('success === true');
  });

  test('returns undefined breakCondition when not specified', async () => {
    const loopNode = createLoopNode(['step1'], 10);

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.breakCondition).toBeUndefined();
  });

  test('returns multiple body node IDs', async () => {
    const loopNode = createLoopNode(['fetch', 'process', 'save'], 3);

    const result = await loopRuntime.execute({
      node: loopNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.bodyNodeIds).toEqual(['fetch', 'process', 'save']);
  });
});

// ============================================================================
// While Runtime Tests
// ============================================================================

describe('whileRuntime', () => {
  test('has correct type identifier', () => {
    expect(whileRuntime.type).toBe('control:while');
  });

  test('returns condition expression', async () => {
    const whileNode = createWhileNode('status !== "complete"', ['poll']);

    const result = await whileRuntime.execute({
      node: whileNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.condition).toBe('status !== "complete"');
    expect(result.bodyNodeIds).toEqual(['poll']);
  });

  test('returns maxIterations from config', async () => {
    const whileNode = createWhileNode('true', ['step']);

    const result = await whileRuntime.execute({
      node: whileNode as unknown as NodeAST,
      input: undefined,
      config: { maxIterations: 50 },
      state: createTestState(),
    });

    expect(result.maxIterations).toBe(50);
  });

  test('uses DEFAULT_MAX_ITERATIONS when not specified', async () => {
    const whileNode = createWhileNode('true', ['step']);

    const result = await whileRuntime.execute({
      node: whileNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.maxIterations).toBe(DEFAULT_MAX_ITERATIONS);
  });

  test('returns body node IDs', async () => {
    const whileNode = createWhileNode('x > 0', ['check', 'update']);

    const result = await whileRuntime.execute({
      node: whileNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.bodyNodeIds).toEqual(['check', 'update']);
  });
});

// ============================================================================
// Foreach Runtime Tests
// ============================================================================

describe('foreachRuntime', () => {
  test('has correct type identifier', () => {
    expect(foreachRuntime.type).toBe('control:foreach');
  });

  test('evaluates collection expression', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [1, 2, 3] } }),
    });

    expect(result.collection).toEqual([1, 2, 3]);
    expect(result.bodyNodeIds).toEqual(['process']);
  });

  test('coerces single value to array', async () => {
    const foreachNode = createForeachNode('singleItem', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { singleItem: 'value' } }),
    });

    expect(result.collection).toEqual(['value']);
  });

  test('returns itemVar from AST node', async () => {
    const foreachNode = createForeachNode('items', ['process'], 'user');

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.itemVar).toBe('user');
  });

  test('returns default itemVar when not specified', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.itemVar).toBe('item');
  });

  test('returns indexVar from config', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: { indexVar: 'idx' },
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.indexVar).toBe('idx');
  });

  test('returns default indexVar when not specified', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.indexVar).toBe('index');
  });

  test('returns maxConcurrency from AST node', async () => {
    const foreachNode = createForeachNode('items', ['process'], 'item', 5);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.maxConcurrency).toBe(5);
  });

  test('returns default maxConcurrency (sequential) when not specified', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.maxConcurrency).toBe(1);
  });

  test('handles empty array collection', async () => {
    const foreachNode = createForeachNode('items', ['process']);

    const result = await foreachRuntime.execute({
      node: foreachNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState({ globalContext: { items: [] } }),
    });

    expect(result.collection).toEqual([]);
  });
});

// ============================================================================
// Parallel Runtime Tests (Items 7.1, 7.2)
// ============================================================================

/**
 * Create a mock parallel node for testing.
 */
function createParallelNode(
  branches: NodeAST[][],
  options?: { wait?: string; merge?: string }
): ParallelNode {
  return {
    id: 'test-parallel',
    type: 'parallel',
    loc: {
      start: { line: 1, column: 0, offset: 0 },
      end: { line: 1, column: 10, offset: 10 },
    },
    branches,
    wait: options?.wait,
    merge: options?.merge,
  };
}

describe('parallelRuntime', () => {
  test('has correct type identifier', () => {
    expect(parallelRuntime.type).toBe('control:parallel');
  });

  test('returns branch count and branches', async () => {
    const branches = [
      [createTestNode({ id: 'a' })],
      [createTestNode({ id: 'b' })],
    ];
    const parallelNode = createParallelNode(branches);

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.branchCount).toBe(2);
    expect(result.branches).toHaveLength(2);
  });

  test('passes through wait strategy from AST', async () => {
    const parallelNode = createParallelNode(
      [[createTestNode({ id: 'a' })]],
      { wait: 'any' }
    );

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.wait).toBe('any');
  });

  test('passes through n(N) wait strategy', async () => {
    const parallelNode = createParallelNode(
      [[createTestNode({ id: 'a' })], [createTestNode({ id: 'b' })], [createTestNode({ id: 'c' })]],
      { wait: 'n(2)' }
    );

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.wait).toBe('n(2)');
  });

  test('passes through merge strategy from AST', async () => {
    const parallelNode = createParallelNode(
      [[createTestNode({ id: 'a' })]],
      { merge: 'concat' }
    );

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.merge).toBe('concat');
  });

  test('passes through object merge strategy', async () => {
    const parallelNode = createParallelNode(
      [[createTestNode({ id: 'a' })]],
      { merge: 'object' }
    );

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.merge).toBe('object');
  });

  test('wait and merge are undefined when not specified', async () => {
    const parallelNode = createParallelNode([[createTestNode({ id: 'a' })]]);

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: {},
      state: createTestState(),
    });

    expect(result.wait).toBeUndefined();
    expect(result.merge).toBeUndefined();
  });

  test('passes maxConcurrency from config', async () => {
    const parallelNode = createParallelNode([[createTestNode({ id: 'a' })]]);

    const result = await parallelRuntime.execute({
      node: parallelNode as unknown as NodeAST,
      input: undefined,
      config: { maxConcurrency: 3 },
      state: createTestState(),
    });

    expect(result.maxConcurrency).toBe(3);
  });
});
