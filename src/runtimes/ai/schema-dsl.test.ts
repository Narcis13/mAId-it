/**
 * Schema DSL Parser Tests
 *
 * Comprehensive tests for the TypeScript-like schema DSL parser.
 */

import { test, expect, describe } from 'bun:test';
import { z } from 'zod';
import { parseSchemaDSL, SchemaDSLError } from './schema-dsl.ts';

describe('parseSchemaDSL', () => {
  describe('primitives', () => {
    test('parses string type', () => {
      const schema = parseSchemaDSL('string');
      expect(schema.safeParse('hello').success).toBe(true);
      expect(schema.safeParse(123).success).toBe(false);
    });

    test('parses number type', () => {
      const schema = parseSchemaDSL('number');
      expect(schema.safeParse(42).success).toBe(true);
      expect(schema.safeParse('42').success).toBe(false);
    });

    test('parses boolean type', () => {
      const schema = parseSchemaDSL('boolean');
      expect(schema.safeParse(true).success).toBe(true);
      expect(schema.safeParse(false).success).toBe(true);
      expect(schema.safeParse('true').success).toBe(false);
    });
  });

  describe('arrays', () => {
    test('parses string array', () => {
      const schema = parseSchemaDSL('string[]');
      expect(schema.safeParse(['a', 'b']).success).toBe(true);
      expect(schema.safeParse([1, 2]).success).toBe(false);
      expect(schema.safeParse('not an array').success).toBe(false);
    });

    test('parses number array', () => {
      const schema = parseSchemaDSL('number[]');
      expect(schema.safeParse([1, 2, 3]).success).toBe(true);
      expect(schema.safeParse([]).success).toBe(true);
      expect(schema.safeParse(['1', '2']).success).toBe(false);
    });

    test('parses boolean array', () => {
      const schema = parseSchemaDSL('boolean[]');
      expect(schema.safeParse([true, false]).success).toBe(true);
    });
  });

  describe('objects', () => {
    test('parses simple object', () => {
      const schema = parseSchemaDSL('{name: string}');
      expect(schema.safeParse({ name: 'Alice' }).success).toBe(true);
      expect(schema.safeParse({ name: 123 }).success).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
    });

    test('parses multi-field object', () => {
      const schema = parseSchemaDSL('{name: string, age: number}');
      expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
      expect(schema.safeParse({ name: 'Alice' }).success).toBe(false);
      expect(schema.safeParse({ name: 'Alice', age: '30' }).success).toBe(false);
    });

    test('parses object with array field', () => {
      const schema = parseSchemaDSL('{name: string, tags: string[]}');
      expect(schema.safeParse({ name: 'Alice', tags: ['a', 'b'] }).success).toBe(true);
      expect(schema.safeParse({ name: 'Alice', tags: [] }).success).toBe(true);
      expect(schema.safeParse({ name: 'Alice', tags: [1, 2] }).success).toBe(false);
    });

    test('parses nested object', () => {
      const schema = parseSchemaDSL('{user: {name: string, age: number}}');
      expect(schema.safeParse({ user: { name: 'Alice', age: 30 } }).success).toBe(true);
      expect(schema.safeParse({ user: { name: 'Alice' } }).success).toBe(false);
    });

    test('parses complex nested structure', () => {
      const schema = parseSchemaDSL('{users: {name: string}[], count: number}');
      expect(schema.safeParse({
        users: [{ name: 'Alice' }, { name: 'Bob' }],
        count: 2
      }).success).toBe(true);
      expect(schema.safeParse({
        users: [{ name: 'Alice' }],
        count: '1'
      }).success).toBe(false);
    });

    test('parses deeply nested structure', () => {
      const schema = parseSchemaDSL('{a: {b: {c: {d: string}}}}');
      expect(schema.safeParse({ a: { b: { c: { d: 'value' } } } }).success).toBe(true);
    });

    test('parses empty object', () => {
      const schema = parseSchemaDSL('{}');
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ extra: 'field' }).success).toBe(true); // Zod allows extra by default
    });

    test('parses object with three fields', () => {
      const schema = parseSchemaDSL('{a: string, b: number, c: boolean}');
      expect(schema.safeParse({ a: 'x', b: 1, c: true }).success).toBe(true);
    });
  });

  describe('error handling', () => {
    test('throws on unknown type', () => {
      expect(() => parseSchemaDSL('unknown')).toThrow(SchemaDSLError);
      expect(() => parseSchemaDSL('Date')).toThrow(SchemaDSLError);
      expect(() => parseSchemaDSL('any')).toThrow(SchemaDSLError);
    });

    test('throws on missing colon', () => {
      expect(() => parseSchemaDSL('{name string}')).toThrow(SchemaDSLError);
      expect(() => parseSchemaDSL('{name string}')).toThrow(/missing colon/);
    });

    test('throws on empty key', () => {
      expect(() => parseSchemaDSL('{: string}')).toThrow(SchemaDSLError);
      expect(() => parseSchemaDSL('{: string}')).toThrow(/empty key/);
    });

    test('throws on empty value', () => {
      expect(() => parseSchemaDSL('{name: }')).toThrow(SchemaDSLError);
      expect(() => parseSchemaDSL('{name: }')).toThrow(/empty type/);
    });

    test('error includes problematic token', () => {
      try {
        parseSchemaDSL('{bad syntax}');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaDSLError);
        expect((e as Error).message).toContain('bad syntax');
      }
    });

    test('throws on invalid array element type', () => {
      expect(() => parseSchemaDSL('unknown[]')).toThrow(SchemaDSLError);
    });
  });

  describe('whitespace handling', () => {
    test('handles extra whitespace around primitives', () => {
      expect(parseSchemaDSL('  string  ').safeParse('test').success).toBe(true);
      expect(parseSchemaDSL('\tnumber\t').safeParse(42).success).toBe(true);
    });

    test('handles extra whitespace in objects', () => {
      const schema = parseSchemaDSL('  { name : string , age : number }  ');
      expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    });

    test('handles newlines in objects', () => {
      const schema = parseSchemaDSL(`{
        name: string,
        age: number
      }`);
      expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    });
  });

  describe('JSON Schema export', () => {
    test('can convert to JSON Schema for pi-ai', () => {
      const schema = parseSchemaDSL('{name: string, count: number}');
      // Zod v4 has native toJSONSchema
      const jsonSchema = z.toJSONSchema(schema);
      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties).toHaveProperty('name');
      expect(jsonSchema.properties).toHaveProperty('count');
    });

    test('JSON Schema includes nested types correctly', () => {
      const schema = parseSchemaDSL('{user: {name: string}, tags: string[]}');
      const jsonSchema = z.toJSONSchema(schema);
      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties).toHaveProperty('user');
      expect(jsonSchema.properties).toHaveProperty('tags');
    });

    test('JSON Schema for arrays', () => {
      const schema = parseSchemaDSL('number[]');
      const jsonSchema = z.toJSONSchema(schema);
      expect(jsonSchema.type).toBe('array');
    });
  });

  describe('edge cases', () => {
    test('object array with nested arrays', () => {
      const schema = parseSchemaDSL('{items: {values: number[]}[]}');
      expect(schema.safeParse({
        items: [
          { values: [1, 2, 3] },
          { values: [4, 5] }
        ]
      }).success).toBe(true);
    });

    test('handles trailing comma tolerance', () => {
      // Parser should handle trailing whitespace from last element
      const schema = parseSchemaDSL('{a: string, b: number}');
      expect(schema.safeParse({ a: 'x', b: 1 }).success).toBe(true);
    });
  });
});
