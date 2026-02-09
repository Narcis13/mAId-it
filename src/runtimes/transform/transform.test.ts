/**
 * Transform Runtime Tests
 *
 * Tests for template, map, and filter runtimes.
 */

import { test, expect, describe } from 'bun:test';
import { templateRuntime } from './template.ts';
import { mapRuntime } from './map.ts';
import { filterRuntime } from './filter.ts';
import { reduceRuntime } from './reduce.ts';
import type { ExecutionState } from '../../execution/types.ts';
import type { NodeAST } from '../../types/ast.ts';

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
    type: 'transform',
    source: { line: 1, column: 0, file: 'test.flow' },
    ...overrides,
  } as NodeAST;
}

// ============================================================================
// Template Runtime Tests
// ============================================================================

describe('templateRuntime', () => {
  test('has correct type identifier', () => {
    expect(templateRuntime.type).toBe('transform:template');
  });

  describe('template rendering', () => {
    test('renders template with simple expression', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: undefined,
        config: { template: 'Hello {{name}}' },
        state: createTestState({
          nodeContext: { name: 'World' },
        }),
      });

      expect(result).toBe('Hello World');
    });

    test('renders template with input access', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: 42,
        config: { template: 'Value: {{input}}' },
        state: createTestState(),
      });

      expect(result).toBe('Value: 42');
    });

    test('renders template with object field access', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: { name: 'Test', count: 5 },
        config: { template: '{{input.name}} has {{input.count}} items' },
        state: createTestState(),
      });

      expect(result).toBe('Test has 5 items');
    });

    test('renders template with nested object access', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: { user: { profile: { name: 'Alice' } } },
        config: { template: 'Name: {{input.user.profile.name}}' },
        state: createTestState(),
      });

      expect(result).toBe('Name: Alice');
    });

    test('renders template with multiple expressions', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: { first: 'John', last: 'Doe' },
        config: { template: '{{input.first}} {{input.last}}' },
        state: createTestState(),
      });

      expect(result).toBe('John Doe');
    });

    test('renders null/undefined as empty string', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: null,
        config: { template: 'Value: {{input}}' },
        state: createTestState(),
      });

      expect(result).toBe('Value: ');
    });

    test('renders objects as JSON', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: { a: 1 },
        config: { template: 'Data: {{input}}' },
        state: createTestState(),
      });

      expect(result).toBe('Data: {"a":1}');
    });

    test('accesses context variables alongside input', async () => {
      const result = await templateRuntime.execute({
        node: createTestNode(),
        input: { name: 'Item' },
        config: { template: '{{prefix}}: {{input.name}}' },
        state: createTestState({
          globalContext: { prefix: 'Label' },
        }),
      });

      expect(result).toBe('Label: Item');
    });
  });
});

// ============================================================================
// Map Runtime Tests
// ============================================================================

describe('mapRuntime', () => {
  test('has correct type identifier', () => {
    expect(mapRuntime.type).toBe('transform:map');
  });

  describe('array transformation', () => {
    test('maps array with simple expression', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3],
        config: { expression: '$item * 2' },
        state: createTestState(),
      });

      expect(result).toEqual([2, 4, 6]);
    });

    test('maps array with $index access', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: ['a', 'b', 'c'],
        config: { expression: '$index' },
        state: createTestState(),
      });

      expect(result).toEqual([0, 1, 2]);
    });

    test('maps array with $item and $index combined', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [10, 20, 30],
        config: { expression: '$item + $index' },
        state: createTestState(),
      });

      expect(result).toEqual([10, 21, 32]);
    });

    test('maps array with $first flag', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3],
        config: { expression: '$first' },
        state: createTestState(),
      });

      expect(result).toEqual([true, false, false]);
    });

    test('maps array with $last flag', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3],
        config: { expression: '$last' },
        state: createTestState(),
      });

      expect(result).toEqual([false, false, true]);
    });

    test('maps array with $items reference', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3],
        config: { expression: 'length($items)' },
        state: createTestState(),
      });

      expect(result).toEqual([3, 3, 3]);
    });

    test('maps object properties', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        config: { expression: '$item.name' },
        state: createTestState(),
      });

      expect(result).toEqual(['Alice', 'Bob']);
    });

    test('handles empty array', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: [],
        config: { expression: '$item * 2' },
        state: createTestState(),
      });

      expect(result).toEqual([]);
    });

    test('coerces single value to array', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: 5,
        config: { expression: '$item * 2' },
        state: createTestState(),
      });

      expect(result).toEqual([10]);
    });

    test('coerces single object to array', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: { value: 42 },
        config: { expression: '$item.value' },
        state: createTestState(),
      });

      expect(result).toEqual([42]);
    });

    test('$first and $last both true for single-element array', async () => {
      const result = await mapRuntime.execute({
        node: createTestNode(),
        input: ['only'],
        config: { expression: '$first && $last' },
        state: createTestState(),
      });

      expect(result).toEqual([true]);
    });
  });
});

// ============================================================================
// Filter Runtime Tests
// ============================================================================

describe('filterRuntime', () => {
  test('has correct type identifier', () => {
    expect(filterRuntime.type).toBe('transform:filter');
  });

  describe('array filtering', () => {
    test('filters with simple condition', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3, 4, 5],
        config: { condition: '$item > 2' },
        state: createTestState(),
      });

      expect(result).toEqual([3, 4, 5]);
    });

    test('filters with equality condition', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: ['a', 'b', 'a', 'c'],
        config: { condition: '$item === "a"' },
        state: createTestState(),
      });

      expect(result).toEqual(['a', 'a']);
    });

    test('filters with $index condition', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [10, 20, 30, 40],
        config: { condition: '$index > 0' },
        state: createTestState(),
      });

      expect(result).toEqual([20, 30, 40]);
    });

    test('filters with even index condition', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: ['a', 'b', 'c', 'd', 'e'],
        config: { condition: '$index % 2 === 0' },
        state: createTestState(),
      });

      expect(result).toEqual(['a', 'c', 'e']);
    });

    test('returns original items, not booleans', async () => {
      const items = [
        { name: 'Alice', active: true },
        { name: 'Bob', active: false },
        { name: 'Charlie', active: true },
      ];

      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: items,
        config: { condition: '$item.active' },
        state: createTestState(),
      });

      expect(result).toEqual([
        { name: 'Alice', active: true },
        { name: 'Charlie', active: true },
      ]);
    });

    test('returns empty array when all conditions false', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3],
        config: { condition: '$item > 10' },
        state: createTestState(),
      });

      expect(result).toEqual([]);
    });

    test('returns all items when all conditions true', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [5, 6, 7],
        config: { condition: '$item > 0' },
        state: createTestState(),
      });

      expect(result).toEqual([5, 6, 7]);
    });

    test('handles empty array', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [],
        config: { condition: '$item > 0' },
        state: createTestState(),
      });

      expect(result).toEqual([]);
    });

    test('coerces single value to array', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: 5,
        config: { condition: '$item > 3' },
        state: createTestState(),
      });

      expect(result).toEqual([5]);
    });

    test('coerces single value to array (failing condition)', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: 1,
        config: { condition: '$item > 3' },
        state: createTestState(),
      });

      expect(result).toEqual([]);
    });

    test('filters objects with nested property access', async () => {
      const items = [
        { user: { age: 25 } },
        { user: { age: 30 } },
        { user: { age: 20 } },
      ];

      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: items,
        config: { condition: '$item.user.age >= 25' },
        state: createTestState(),
      });

      expect(result).toEqual([
        { user: { age: 25 } },
        { user: { age: 30 } },
      ]);
    });

    test('combines $item and $index conditions', async () => {
      const result = await filterRuntime.execute({
        node: createTestNode(),
        input: [10, 20, 30, 40, 50],
        config: { condition: '$item > 15 && $index < 4' },
        state: createTestState(),
      });

      expect(result).toEqual([20, 30, 40]);
    });
  });
});

// ============================================================================
// Reduce Runtime Tests (Item 7.3)
// ============================================================================

describe('reduceRuntime', () => {
  test('has correct type identifier', () => {
    expect(reduceRuntime.type).toBe('transform:reduce');
  });

  describe('array reduction', () => {
    test('sums numbers with initial value', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [1, 2, 3, 4, 5],
        config: { expression: '$acc + $item', initial: '0' },
        state: createTestState(),
      });

      expect(result).toBe(15);
    });

    test('concatenates strings with initial value', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: ['a', 'b', 'c'],
        config: { expression: 'concat($acc, $item)', initial: '""' },
        state: createTestState(),
      });

      expect(result).toBe('abc');
    });

    test('handles $index in expression', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [10, 20, 30],
        config: { expression: '$acc + $index', initial: '0' },
        state: createTestState(),
      });

      // 0 + 0 + 1 + 2 = 3
      expect(result).toBe(3);
    });

    test('applies finalize expression', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [2, 4, 6],
        config: { expression: '$acc + $item', initial: '0', finalize: '$acc * 10' },
        state: createTestState(),
      });

      // (2+4+6) * 10 = 120
      expect(result).toBe(120);
    });

    test('handles single-element array', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [42],
        config: { expression: '$acc + $item', initial: '0' },
        state: createTestState(),
      });

      expect(result).toBe(42);
    });

    test('handles empty array with initial value', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [],
        config: { expression: '$acc + $item', initial: '0' },
        state: createTestState(),
      });

      expect(result).toBe(0);
    });

    test('coerces single value to array', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: 5,
        config: { expression: '$acc + $item', initial: '10' },
        state: createTestState(),
      });

      expect(result).toBe(15);
    });

    test('computes max value', async () => {
      const result = await reduceRuntime.execute({
        node: createTestNode(),
        input: [3, 7, 2, 9, 4],
        config: { expression: '$item > $acc ? $item : $acc', initial: '0' },
        state: createTestState(),
      });

      expect(result).toBe(9);
    });
  });
});
