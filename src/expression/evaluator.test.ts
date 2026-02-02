/**
 * Tests for expression evaluator
 */

import { test, expect, describe } from 'bun:test';
import { evaluate, evaluateNode } from './evaluator.ts';
import { evaluateTemplate } from './index.ts';
import { ExpressionError } from './types.ts';
import { parseExpression } from './parser.ts';

// Helper to create minimal context
const ctx = (vars: Record<string, unknown> = {}, fns: Record<string, (...args: unknown[]) => unknown> = {}) => ({
  variables: vars,
  functions: fns,
});

describe('evaluateNode', () => {
  describe('Literal', () => {
    test('evaluates number literals', () => {
      const ast = parseExpression('42');
      expect(evaluateNode(ast, ctx())).toBe(42);
    });

    test('evaluates string literals', () => {
      const ast = parseExpression('"hello"');
      expect(evaluateNode(ast, ctx())).toBe('hello');
    });

    test('evaluates boolean literals', () => {
      const ast = parseExpression('true');
      expect(evaluateNode(ast, ctx())).toBe(true);
    });

    test('evaluates null literal', () => {
      const ast = parseExpression('null');
      expect(evaluateNode(ast, ctx())).toBe(null);
    });
  });

  describe('Identifier', () => {
    test('evaluates identifiers from context', () => {
      const ast = parseExpression('name');
      expect(evaluateNode(ast, ctx({ name: 'Alice' }))).toBe('Alice');
    });

    test('returns undefined for missing identifiers', () => {
      const ast = parseExpression('missing');
      expect(evaluateNode(ast, ctx())).toBe(undefined);
    });
  });

  describe('MemberExpression', () => {
    test('evaluates dot notation access', () => {
      const ast = parseExpression('user.name');
      expect(evaluateNode(ast, ctx({ user: { name: 'Alice' } }))).toBe('Alice');
    });

    test('evaluates bracket notation access', () => {
      const ast = parseExpression('user["name"]');
      expect(evaluateNode(ast, ctx({ user: { name: 'Alice' } }))).toBe('Alice');
    });

    test('evaluates computed property with variable', () => {
      const ast = parseExpression('obj[key]');
      expect(evaluateNode(ast, ctx({ obj: { a: 1, b: 2 }, key: 'b' }))).toBe(2);
    });

    test('evaluates nested member access', () => {
      const ast = parseExpression('user.profile.name');
      expect(
        evaluateNode(ast, ctx({ user: { profile: { name: 'Alice' } } }))
      ).toBe('Alice');
    });

    test('returns undefined for null object', () => {
      const ast = parseExpression('user.name');
      expect(evaluateNode(ast, ctx({ user: null }))).toBe(undefined);
    });

    test('returns undefined for undefined object', () => {
      const ast = parseExpression('user.name');
      expect(evaluateNode(ast, ctx({ user: undefined }))).toBe(undefined);
    });
  });

  describe('BinaryExpression', () => {
    test('evaluates addition', () => {
      const ast = parseExpression('1 + 2');
      expect(evaluateNode(ast, ctx())).toBe(3);
    });

    test('evaluates subtraction', () => {
      const ast = parseExpression('5 - 3');
      expect(evaluateNode(ast, ctx())).toBe(2);
    });

    test('evaluates multiplication', () => {
      const ast = parseExpression('4 * 3');
      expect(evaluateNode(ast, ctx())).toBe(12);
    });

    test('evaluates division', () => {
      const ast = parseExpression('10 / 2');
      expect(evaluateNode(ast, ctx())).toBe(5);
    });

    test('evaluates modulo', () => {
      const ast = parseExpression('10 % 3');
      expect(evaluateNode(ast, ctx())).toBe(1);
    });

    test('evaluates string concatenation', () => {
      const ast = parseExpression('"hello" + " " + "world"');
      expect(evaluateNode(ast, ctx())).toBe('hello world');
    });

    test('evaluates equality', () => {
      expect(evaluateNode(parseExpression('1 == 1'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 == 2'), ctx())).toBe(false);
      expect(evaluateNode(parseExpression('1 == "1"'), ctx())).toBe(true);
    });

    test('evaluates strict equality', () => {
      expect(evaluateNode(parseExpression('1 === 1'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 === "1"'), ctx())).toBe(false);
    });

    test('evaluates inequality', () => {
      expect(evaluateNode(parseExpression('1 != 2'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 != 1'), ctx())).toBe(false);
    });

    test('evaluates strict inequality', () => {
      expect(evaluateNode(parseExpression('1 !== "1"'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 !== 1'), ctx())).toBe(false);
    });

    test('evaluates comparison operators', () => {
      expect(evaluateNode(parseExpression('1 < 2'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('2 > 1'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 <= 1'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('1 >= 1'), ctx())).toBe(true);
    });

    test('evaluates logical AND with short-circuit', () => {
      expect(evaluateNode(parseExpression('true && true'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('false && true'), ctx())).toBe(false);
      // Short-circuit: second expression not evaluated
      expect(evaluateNode(parseExpression('false && missing'), ctx({ missing: undefined }))).toBe(false);
    });

    test('evaluates logical OR with short-circuit', () => {
      expect(evaluateNode(parseExpression('false || true'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('true || false'), ctx())).toBe(true);
      // Short-circuit: second expression not evaluated
      expect(evaluateNode(parseExpression('true || missing'), ctx())).toBe(true);
    });

    test('evaluates nullish coalescing', () => {
      expect(evaluateNode(parseExpression('x ?? "default"'), ctx({ x: null }))).toBe('default');
      expect(evaluateNode(parseExpression('x ?? "default"'), ctx({ x: undefined }))).toBe('default');
      expect(evaluateNode(parseExpression('x ?? "default"'), ctx({ x: 0 }))).toBe(0);
      expect(evaluateNode(parseExpression('x ?? "default"'), ctx({ x: false }))).toBe(false);
      expect(evaluateNode(parseExpression('x ?? "default"'), ctx({ x: '' }))).toBe('');
    });
  });

  describe('UnaryExpression', () => {
    test('evaluates logical NOT', () => {
      expect(evaluateNode(parseExpression('!true'), ctx())).toBe(false);
      expect(evaluateNode(parseExpression('!false'), ctx())).toBe(true);
      expect(evaluateNode(parseExpression('!0'), ctx())).toBe(true);
    });

    test('evaluates unary minus', () => {
      expect(evaluateNode(parseExpression('-5'), ctx())).toBe(-5);
      expect(evaluateNode(parseExpression('-x'), ctx({ x: 10 }))).toBe(-10);
    });

    test('evaluates unary plus', () => {
      expect(evaluateNode(parseExpression('+5'), ctx())).toBe(5);
      expect(evaluateNode(parseExpression('+"42"'), ctx())).toBe(42);
    });
  });

  describe('ConditionalExpression', () => {
    test('evaluates ternary (true condition)', () => {
      const ast = parseExpression('true ? "yes" : "no"');
      expect(evaluateNode(ast, ctx())).toBe('yes');
    });

    test('evaluates ternary (false condition)', () => {
      const ast = parseExpression('false ? "yes" : "no"');
      expect(evaluateNode(ast, ctx())).toBe('no');
    });

    test('evaluates nested ternary', () => {
      const ast = parseExpression('a > b ? "greater" : a < b ? "less" : "equal"');
      expect(evaluateNode(ast, ctx({ a: 5, b: 3 }))).toBe('greater');
      expect(evaluateNode(ast, ctx({ a: 3, b: 5 }))).toBe('less');
      expect(evaluateNode(ast, ctx({ a: 3, b: 3 }))).toBe('equal');
    });
  });

  describe('ArrayExpression', () => {
    test('evaluates array literals', () => {
      const ast = parseExpression('[1, 2, 3]');
      expect(evaluateNode(ast, ctx())).toEqual([1, 2, 3]);
    });

    test('evaluates arrays with expressions', () => {
      const ast = parseExpression('[a, b, a + b]');
      expect(evaluateNode(ast, ctx({ a: 1, b: 2 }))).toEqual([1, 2, 3]);
    });

    test('evaluates empty array', () => {
      const ast = parseExpression('[]');
      expect(evaluateNode(ast, ctx())).toEqual([]);
    });
  });

  describe('CallExpression', () => {
    test('calls whitelisted functions', () => {
      const ast = parseExpression('double(x)');
      expect(evaluateNode(ast, ctx({ x: 5 }, { double: (n: unknown) => (n as number) * 2 }))).toBe(10);
    });

    test('passes multiple arguments', () => {
      const ast = parseExpression('add(a, b)');
      const add = (a: unknown, b: unknown) => (a as number) + (b as number);
      expect(evaluateNode(ast, ctx({ a: 1, b: 2 }, { add }))).toBe(3);
    });

    test('evaluates argument expressions', () => {
      const ast = parseExpression('fn(a + b)');
      const fn = (x: unknown) => x;
      expect(evaluateNode(ast, ctx({ a: 1, b: 2 }, { fn }))).toBe(3);
    });
  });
});

describe('evaluate', () => {
  test('parses and evaluates expression', () => {
    expect(evaluate('a + b', ctx({ a: 1, b: 2 }))).toBe(3);
  });

  test('handles complex expressions', () => {
    const result = evaluate(
      'user.isAdmin ? "Admin: " + user.name : "User: " + user.name',
      ctx({ user: { isAdmin: true, name: 'Alice' } })
    );
    expect(result).toBe('Admin: Alice');
  });

  test('includes expression in error', () => {
    try {
      evaluate('obj.__proto__', ctx({ obj: {} }));
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
    }
  });
});

describe('Security', () => {
  describe('prototype chain access blocked', () => {
    test('blocks __proto__ access', () => {
      expect(() => evaluate('obj.__proto__', ctx({ obj: {} }))).toThrow(ExpressionError);
      expect(() => evaluate('obj["__proto__"]', ctx({ obj: {} }))).toThrow(ExpressionError);
    });

    test('blocks constructor access', () => {
      expect(() => evaluate('obj.constructor', ctx({ obj: {} }))).toThrow(ExpressionError);
      expect(() => evaluate('obj["constructor"]', ctx({ obj: {} }))).toThrow(ExpressionError);
    });

    test('blocks prototype access', () => {
      expect(() => evaluate('obj.prototype', ctx({ obj: {} }))).toThrow(ExpressionError);
      expect(() => evaluate('obj["prototype"]', ctx({ obj: {} }))).toThrow(ExpressionError);
    });

    test('error message mentions security', () => {
      try {
        evaluate('obj.__proto__', ctx({ obj: {} }));
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect((error as Error).message).toContain('security');
      }
    });
  });

  describe('function call restrictions', () => {
    test('blocks unknown function calls', () => {
      expect(() => evaluate('unknownFn()', ctx())).toThrow(ExpressionError);
    });

    test('blocks method calls on objects', () => {
      const obj = { method: () => 'called' };
      expect(() => evaluate('obj.method()', ctx({ obj }))).toThrow(ExpressionError);
    });

    test('error mentions function not allowed', () => {
      try {
        evaluate('unknownFn()', ctx());
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not defined');
      }
    });

    test('error mentions method calls not allowed', () => {
      try {
        evaluate('obj.method()', ctx({ obj: { method: () => {} } }));
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('direct function calls');
      }
    });
  });

  describe('this expression blocked', () => {
    test('blocks this expression', () => {
      expect(() => evaluate('this', ctx())).toThrow(ExpressionError);
    });
  });
});

describe('evaluateTemplate', () => {
  test('evaluates template with no expressions', () => {
    expect(evaluateTemplate('Hello World', ctx())).toBe('Hello World');
  });

  test('evaluates template with single expression', () => {
    expect(evaluateTemplate('Hello {{name}}!', ctx({ name: 'World' }))).toBe(
      'Hello World!'
    );
  });

  test('evaluates template with multiple expressions', () => {
    expect(
      evaluateTemplate('{{greeting}} {{name}}!', ctx({ greeting: 'Hello', name: 'World' }))
    ).toBe('Hello World!');
  });

  test('evaluates template with complex expressions', () => {
    expect(
      evaluateTemplate('Result: {{a + b}}', ctx({ a: 1, b: 2 }))
    ).toBe('Result: 3');
  });

  test('evaluates template with conditionals', () => {
    expect(
      evaluateTemplate('{{x > 0 ? "positive" : "non-positive"}}', ctx({ x: 5 }))
    ).toBe('positive');
  });

  test('handles null values (renders as empty)', () => {
    expect(evaluateTemplate('Value: {{x}}', ctx({ x: null }))).toBe('Value: ');
  });

  test('handles undefined values (renders as empty)', () => {
    expect(evaluateTemplate('Value: {{x}}', ctx())).toBe('Value: ');
  });

  test('handles object values (JSON stringified)', () => {
    expect(evaluateTemplate('Data: {{obj}}', ctx({ obj: { a: 1 } }))).toBe(
      'Data: {"a":1}'
    );
  });

  test('handles array values (JSON stringified)', () => {
    expect(evaluateTemplate('Data: {{arr}}', ctx({ arr: [1, 2, 3] }))).toBe(
      'Data: [1,2,3]'
    );
  });

  test('handles empty template', () => {
    expect(evaluateTemplate('', ctx())).toBe('');
  });

  test('handles consecutive expressions', () => {
    expect(evaluateTemplate('{{a}}{{b}}', ctx({ a: 'X', b: 'Y' }))).toBe('XY');
  });

  test('handles nested object access', () => {
    expect(
      evaluateTemplate(
        'Name: {{user.profile.firstName}} {{user.profile.lastName}}',
        ctx({ user: { profile: { firstName: 'John', lastName: 'Doe' } } })
      )
    ).toBe('Name: John Doe');
  });
});
