/**
 * Tests for expression syntax validation pass
 */

import { test, expect, describe } from 'bun:test';
import { validateExpressions } from './expressions';
import type { WorkflowAST, SourceNode, TransformNode, IfNode, SetNode } from '../types';

const loc = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
const sourceMap = { source: '', filePath: 'test.flow.md', lineOffsets: [0] };

function makeAST(nodes: WorkflowAST['nodes']): WorkflowAST {
  return {
    metadata: { name: 'test', version: '1.0' },
    nodes,
    sourceMap,
  };
}

describe('validateExpressions', () => {
  test('returns no errors for valid expressions', () => {
    const ast = makeAST([
      {
        type: 'transform',
        id: 't1',
        loc,
        transformType: 'template',
        config: { template: '{{user.name}} is {{user.age}} years old' },
      } as TransformNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors).toHaveLength(0);
  });

  test('returns error for invalid expression syntax', () => {
    const ast = makeAST([
      {
        type: 'transform',
        id: 't1',
        loc,
        transformType: 'template',
        config: { template: '{{invalid(}}' },
      } as TransformNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.code).toBe('EXPR_PARSE_ERROR');
  });

  test('validates expressions in if conditions', () => {
    const ast = makeAST([
      {
        type: 'if',
        id: 'if1',
        loc,
        condition: '{{a +}}',
        then: [],
      } as IfNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('validates expressions in set nodes', () => {
    const ast = makeAST([
      {
        type: 'set',
        id: 'set1',
        loc,
        var: 'x',
        value: '{{bad syntax(}}',
      } as SetNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('skips strings without template expressions', () => {
    const ast = makeAST([
      {
        type: 'source',
        id: 's1',
        loc,
        sourceType: 'http',
        config: { url: 'https://example.com' },
      } as SourceNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors).toHaveLength(0);
  });

  test('validates nested config values', () => {
    const ast = makeAST([
      {
        type: 'source',
        id: 's1',
        loc,
        sourceType: 'http',
        config: {
          url: 'https://example.com',
          headers: { authorization: '{{bad(}}' },
        },
      } as SourceNode,
    ]);
    const errors = validateExpressions(ast);
    expect(errors.length).toBeGreaterThan(0);
  });
});
