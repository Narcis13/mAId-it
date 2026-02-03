/**
 * Tests for expression parser
 */

import { test, expect, describe } from 'bun:test';
import { extractTemplateSegments, parseExpression } from './parser.ts';
import { ExpressionError } from './types.ts';

describe('extractTemplateSegments', () => {
  test('handles empty template', () => {
    const segments = extractTemplateSegments('');
    expect(segments).toEqual([]);
  });

  test('handles template with no expressions', () => {
    const segments = extractTemplateSegments('Hello World');
    expect(segments).toEqual([
      { type: 'text', value: 'Hello World', start: 0, end: 11 },
    ]);
  });

  test('handles single expression', () => {
    const segments = extractTemplateSegments('{{name}}');
    expect(segments).toEqual([
      { type: 'expression', value: 'name', start: 0, end: 8 },
    ]);
  });

  test('handles expression with surrounding text', () => {
    const segments = extractTemplateSegments('Hello {{name}}!');
    expect(segments).toEqual([
      { type: 'text', value: 'Hello ', start: 0, end: 6 },
      { type: 'expression', value: 'name', start: 6, end: 14 },
      { type: 'text', value: '!', start: 14, end: 15 },
    ]);
  });

  test('handles consecutive expressions', () => {
    const segments = extractTemplateSegments('{{a}}{{b}}');
    expect(segments).toEqual([
      { type: 'expression', value: 'a', start: 0, end: 5 },
      { type: 'expression', value: 'b', start: 5, end: 10 },
    ]);
  });

  test('handles multiple expressions with text between', () => {
    const segments = extractTemplateSegments('{{a}} and {{b}}');
    expect(segments).toEqual([
      { type: 'expression', value: 'a', start: 0, end: 5 },
      { type: 'text', value: ' and ', start: 5, end: 10 },
      { type: 'expression', value: 'b', start: 10, end: 15 },
    ]);
  });

  test('trims whitespace from expression values', () => {
    const segments = extractTemplateSegments('{{ name }}');
    expect(segments).toEqual([
      { type: 'expression', value: 'name', start: 0, end: 10 },
    ]);
  });

  test('handles complex expressions', () => {
    const segments = extractTemplateSegments('{{user.profile.name}}');
    expect(segments).toEqual([
      { type: 'expression', value: 'user.profile.name', start: 0, end: 21 },
    ]);
  });

  test('handles expression at end', () => {
    const segments = extractTemplateSegments('Name: {{name}}');
    expect(segments).toEqual([
      { type: 'text', value: 'Name: ', start: 0, end: 6 },
      { type: 'expression', value: 'name', start: 6, end: 14 },
    ]);
  });
});

describe('parseExpression', () => {
  test('parses simple identifier', () => {
    const ast = parseExpression('name');
    expect(ast.type).toBe('Identifier');
    expect((ast as unknown as { name: string }).name).toBe('name');
  });

  test('parses member expression', () => {
    const ast = parseExpression('user.name');
    expect(ast.type).toBe('MemberExpression');
  });

  test('parses binary expression', () => {
    const ast = parseExpression('a + b');
    expect(ast.type).toBe('BinaryExpression');
    expect((ast as unknown as { operator: string }).operator).toBe('+');
  });

  test('parses nullish coalescing', () => {
    const ast = parseExpression('x ?? "default"');
    expect(ast.type).toBe('BinaryExpression');
    expect((ast as unknown as { operator: string }).operator).toBe('??');
  });

  test('parses conditional expression', () => {
    const ast = parseExpression('a ? b : c');
    expect(ast.type).toBe('ConditionalExpression');
  });

  test('parses function call', () => {
    const ast = parseExpression('fn(a, b)');
    expect(ast.type).toBe('CallExpression');
  });

  test('parses array literal', () => {
    const ast = parseExpression('[1, 2, 3]');
    expect(ast.type).toBe('ArrayExpression');
  });

  test('parses unary expression', () => {
    const ast = parseExpression('!flag');
    expect(ast.type).toBe('UnaryExpression');
    expect((ast as unknown as { operator: string }).operator).toBe('!');
  });

  test('parses computed member access', () => {
    const ast = parseExpression('obj["key"]');
    expect(ast.type).toBe('MemberExpression');
    expect((ast as unknown as { computed: boolean }).computed).toBe(true);
  });

  test('throws ExpressionError on invalid syntax', () => {
    expect(() => parseExpression('a +')).toThrow(ExpressionError);
  });

  test('throws ExpressionError with expression context', () => {
    try {
      parseExpression('invalid(');
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      expect((error as ExpressionError).expression).toBe('invalid(');
    }
  });

  test('bitwise operators are removed', () => {
    // These should fail to parse since bitwise ops are removed
    expect(() => parseExpression('a | b')).toThrow();
    expect(() => parseExpression('a & b')).toThrow();
    expect(() => parseExpression('a ^ b')).toThrow();
    expect(() => parseExpression('a << b')).toThrow();
    expect(() => parseExpression('a >> b')).toThrow();
    expect(() => parseExpression('a >>> b')).toThrow();
  });
});
