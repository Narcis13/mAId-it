/**
 * Tests for Built-in Functions Library
 */

import { test, expect, describe } from 'bun:test';
import {
  getBuiltinFunctions,
  stringFunctions,
  arrayFunctions,
  mathFunctions,
  timeFunctions,
  objectFunctions,
  typeFunctions,
  utilityFunctions,
} from './index';

describe('getBuiltinFunctions', () => {
  test('returns object with all function categories', () => {
    const fns = getBuiltinFunctions();
    expect(typeof fns).toBe('object');
    expect(Object.keys(fns).length).toBeGreaterThan(60);
  });

  test('includes functions from all categories', () => {
    const fns = getBuiltinFunctions();
    // String functions
    expect(typeof fns.upper).toBe('function');
    expect(typeof fns.lower).toBe('function');
    // Array functions
    expect(typeof fns.length).toBe('function');
    expect(typeof fns.first).toBe('function');
    // Math functions
    expect(typeof fns.sum).toBe('function');
    expect(typeof fns.avg).toBe('function');
    // Time functions
    expect(typeof fns.now).toBe('function');
    expect(typeof fns.parse_date).toBe('function');
    // Object functions
    expect(typeof fns.keys).toBe('function');
    expect(typeof fns.get).toBe('function');
    // Type functions
    expect(typeof fns.is_null).toBe('function');
    expect(typeof fns.to_string).toBe('function');
    // Utility functions
    expect(typeof fns.uuid).toBe('function');
    expect(typeof fns.json_encode).toBe('function');
  });
});

describe('String Functions', () => {
  test('upper converts to uppercase', () => {
    expect(stringFunctions.upper('hello')).toBe('HELLO');
    expect(stringFunctions.upper(null as any)).toBe('');
  });

  test('lower converts to lowercase', () => {
    expect(stringFunctions.lower('HELLO')).toBe('hello');
    expect(stringFunctions.lower(undefined as any)).toBe('');
  });

  test('trim removes whitespace', () => {
    expect(stringFunctions.trim('  hello  ')).toBe('hello');
    expect(stringFunctions.trim(null as any)).toBe('');
  });

  test('replace replaces all occurrences', () => {
    expect(stringFunctions.replace('hello world', 'o', '0')).toBe('hell0 w0rld');
    expect(stringFunctions.replace(null as any, 'a', 'b')).toBe('');
  });

  test('split splits string by delimiter', () => {
    expect(stringFunctions.split('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  test('join joins array with delimiter', () => {
    expect(stringFunctions.join(['a', 'b', 'c'], ',')).toBe('a,b,c');
    expect(stringFunctions.join(null as any, ',')).toBe('');
  });

  test('truncate shortens string with suffix', () => {
    expect(stringFunctions.truncate('hello world', 8)).toBe('hello...');
    expect(stringFunctions.truncate('short', 10)).toBe('short');
    expect(stringFunctions.truncate(null as any, 10)).toBe('');
  });

  test('concat joins strings', () => {
    expect(stringFunctions.concat('a', 'b', 'c')).toBe('abc');
    expect(stringFunctions.concat(null as any, 'b')).toBe('b');
  });

  test('includes checks substring', () => {
    expect(stringFunctions.includes('hello', 'ell')).toBe(true);
    expect(stringFunctions.includes('hello', 'xyz')).toBe(false);
  });

  test('starts_with and ends_with', () => {
    expect(stringFunctions.starts_with('hello', 'he')).toBe(true);
    expect(stringFunctions.ends_with('hello', 'lo')).toBe(true);
  });
});

describe('Array Functions', () => {
  test('length returns array length', () => {
    expect(arrayFunctions.length([1, 2, 3])).toBe(3);
    expect(arrayFunctions.length(undefined as any)).toBe(0);
  });

  test('first and last return elements', () => {
    expect(arrayFunctions.first([1, 2, 3])).toBe(1);
    expect(arrayFunctions.last([1, 2, 3])).toBe(3);
    expect(arrayFunctions.first(null as any)).toBeUndefined();
    expect(arrayFunctions.last(null as any)).toBeUndefined();
  });

  test('slice extracts portion', () => {
    expect(arrayFunctions.slice([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
    expect(arrayFunctions.slice(null as any, 0, 1)).toEqual([]);
  });

  test('flatten flattens one level', () => {
    expect(arrayFunctions.flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    expect(arrayFunctions.flatten(null as any)).toEqual([]);
  });

  test('unique removes duplicates', () => {
    expect(arrayFunctions.unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  test('sort sorts array', () => {
    expect(arrayFunctions.sort([3, 1, 2])).toEqual([1, 2, 3]);
    expect(arrayFunctions.sort([3, 1, 2], undefined, 'desc')).toEqual([3, 2, 1]);
  });

  test('sort by key', () => {
    const arr = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
    const sorted = arrayFunctions.sort(arr, 'name');
    expect(sorted.map((x: any) => x.name)).toEqual(['a', 'b', 'c']);
  });

  test('compact removes null/undefined', () => {
    expect(arrayFunctions.compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  test('contains checks membership', () => {
    expect(arrayFunctions.contains([1, 2, 3], 2)).toBe(true);
    expect(arrayFunctions.contains([1, 2, 3], 4)).toBe(false);
  });

  test('range creates sequence', () => {
    expect(arrayFunctions.range(1, 5)).toEqual([1, 2, 3, 4]);
    expect(arrayFunctions.range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });
});

describe('Math Functions', () => {
  test('min and max', () => {
    expect(mathFunctions.min(1, 2, 3)).toBe(1);
    expect(mathFunctions.max(1, 2, 3)).toBe(3);
  });

  test('sum and avg', () => {
    expect(mathFunctions.sum([1, 2, 3])).toBe(6);
    expect(mathFunctions.avg([1, 2, 3])).toBe(2);
    expect(mathFunctions.sum(null as any)).toBe(0);
    expect(mathFunctions.avg(null as any)).toBe(0);
  });

  test('round, floor, ceil', () => {
    expect(mathFunctions.round(3.7)).toBe(4);
    expect(mathFunctions.round(3.14159, 2)).toBe(3.14);
    expect(mathFunctions.floor(3.7)).toBe(3);
    expect(mathFunctions.ceil(3.2)).toBe(4);
  });

  test('abs and pow', () => {
    expect(mathFunctions.abs(-5)).toBe(5);
    expect(mathFunctions.pow(2, 3)).toBe(8);
  });

  test('random_int returns number in range', () => {
    const n = mathFunctions.random_int(1, 10);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(10);
  });

  test('clamp constrains value', () => {
    expect(mathFunctions.clamp(5, 0, 10)).toBe(5);
    expect(mathFunctions.clamp(-5, 0, 10)).toBe(0);
    expect(mathFunctions.clamp(15, 0, 10)).toBe(10);
  });

  test('handles non-numeric inputs', () => {
    expect(mathFunctions.floor('not a number' as any)).toBe(0);
    expect(mathFunctions.abs(null as any)).toBe(0);
  });
});

describe('Time Functions', () => {
  test('now returns ISO string', () => {
    const now = timeFunctions.now();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('date returns ISO date', () => {
    const date = timeFunctions.date();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('parse_date parses ISO dates', () => {
    const result = timeFunctions.parse_date('2024-01-15');
    expect(result).toContain('2024-01-15');
  });

  test('parse_date returns null for invalid', () => {
    expect(timeFunctions.parse_date('not a date')).toBeNull();
    expect(timeFunctions.parse_date(null as any)).toBeNull();
  });

  test('format_date formats date', () => {
    const result = timeFunctions.format_date('2024-01-15', 'yyyy/MM/dd');
    expect(result).toBe('2024/01/15');
  });

  test('add_time adds duration', () => {
    const result = timeFunctions.add_time('2024-01-15T12:00:00.000Z', { days: 1 });
    expect(result).toContain('2024-01-16');
  });

  test('diff calculates difference', () => {
    const diff = timeFunctions.diff('2024-01-15', '2024-01-10', 'days');
    expect(diff).toBe(5);
  });

  test('timestamp returns number', () => {
    const ts = timeFunctions.timestamp();
    expect(typeof ts).toBe('number');
    expect(ts).toBeGreaterThan(0);
  });

  test('handles null inputs', () => {
    expect(timeFunctions.format_date(null as any, 'yyyy')).toBeNull();
    expect(timeFunctions.add_time(null as any, { days: 1 })).toBeNull();
    expect(timeFunctions.diff(null as any, '2024-01-01', 'days')).toBeNull();
  });
});

describe('Object Functions', () => {
  test('keys and values', () => {
    expect(objectFunctions.keys({ a: 1, b: 2 })).toEqual(['a', 'b']);
    expect(objectFunctions.values({ a: 1, b: 2 })).toEqual([1, 2]);
    expect(objectFunctions.keys(null as any)).toEqual([]);
  });

  test('entries and from_entries', () => {
    const entries = objectFunctions.entries({ a: 1, b: 2 });
    expect(entries).toEqual([['a', 1], ['b', 2]]);
    expect(objectFunctions.from_entries(entries)).toEqual({ a: 1, b: 2 });
  });

  test('get retrieves nested values', () => {
    const obj = { user: { name: 'Alice', settings: { theme: 'dark' } } };
    expect(objectFunctions.get(obj, 'user.name')).toBe('Alice');
    expect(objectFunctions.get(obj, 'user.settings.theme')).toBe('dark');
    expect(objectFunctions.get(obj, 'user.missing', 'default')).toBe('default');
  });

  test('has checks key existence', () => {
    expect(objectFunctions.has({ a: 1 }, 'a')).toBe(true);
    expect(objectFunctions.has({ a: 1 }, 'b')).toBe(false);
    expect(objectFunctions.has(null as any, 'a')).toBe(false);
  });

  test('merge combines objects', () => {
    expect(objectFunctions.merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    expect(objectFunctions.merge({ a: 1 }, null as any, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  test('pick selects keys', () => {
    expect(objectFunctions.pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    expect(objectFunctions.pick(null as any, ['a'])).toEqual({});
  });

  test('omit removes keys', () => {
    expect(objectFunctions.omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
    expect(objectFunctions.omit(null as any, ['a'])).toEqual({});
  });

  test('set creates nested value', () => {
    const result = objectFunctions.set({}, 'a.b.c', 42);
    expect(result).toEqual({ a: { b: { c: 42 } } });
  });

  test('clone deep copies', () => {
    const obj = { a: { b: [1, 2] } };
    const clone = objectFunctions.clone(obj) as any;
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.a).not.toBe(obj.a);
  });
});

describe('Type Functions', () => {
  test('typeof returns correct types', () => {
    expect(typeFunctions.typeof(null)).toBe('null');
    expect(typeFunctions.typeof(undefined)).toBe('undefined');
    expect(typeFunctions.typeof([])).toBe('array');
    expect(typeFunctions.typeof({})).toBe('object');
    expect(typeFunctions.typeof('str')).toBe('string');
    expect(typeFunctions.typeof(42)).toBe('number');
    expect(typeFunctions.typeof(true)).toBe('boolean');
  });

  test('is_null checks null/undefined', () => {
    expect(typeFunctions.is_null(null)).toBe(true);
    expect(typeFunctions.is_null(undefined)).toBe(true);
    expect(typeFunctions.is_null(0)).toBe(false);
    expect(typeFunctions.is_null('')).toBe(false);
  });

  test('is_array and is_object', () => {
    expect(typeFunctions.is_array([])).toBe(true);
    expect(typeFunctions.is_array({})).toBe(false);
    expect(typeFunctions.is_object({})).toBe(true);
    expect(typeFunctions.is_object([])).toBe(false);
    expect(typeFunctions.is_object(null)).toBe(false);
  });

  test('is_empty checks emptiness', () => {
    expect(typeFunctions.is_empty(null)).toBe(true);
    expect(typeFunctions.is_empty('')).toBe(true);
    expect(typeFunctions.is_empty([])).toBe(true);
    expect(typeFunctions.is_empty({})).toBe(true);
    expect(typeFunctions.is_empty([1])).toBe(false);
    expect(typeFunctions.is_empty({ a: 1 })).toBe(false);
  });

  test('to_string converts values', () => {
    expect(typeFunctions.to_string(null)).toBe('');
    expect(typeFunctions.to_string(42)).toBe('42');
    expect(typeFunctions.to_string({ a: 1 })).toBe('{"a":1}');
  });

  test('to_number converts values', () => {
    expect(typeFunctions.to_number('42')).toBe(42);
    expect(typeFunctions.to_number('not a number')).toBe(0);
    expect(typeFunctions.to_number(null)).toBe(0);
  });

  test('to_boolean converts values', () => {
    expect(typeFunctions.to_boolean(1)).toBe(true);
    expect(typeFunctions.to_boolean(0)).toBe(false);
    expect(typeFunctions.to_boolean('')).toBe(false);
    expect(typeFunctions.to_boolean('hello')).toBe(true);
  });

  test('coalesce returns first non-null', () => {
    expect(typeFunctions.coalesce(null, undefined, 'value')).toBe('value');
    expect(typeFunctions.coalesce(0, 'fallback')).toBe(0);
  });

  test('default provides fallback', () => {
    expect(typeFunctions.default(null, 'default')).toBe('default');
    expect(typeFunctions.default('value', 'default')).toBe('value');
  });

  test('if_else conditional', () => {
    expect(typeFunctions.if_else(true, 'yes', 'no')).toBe('yes');
    expect(typeFunctions.if_else(false, 'yes', 'no')).toBe('no');
    expect(typeFunctions.if_else(1, 'truthy', 'falsy')).toBe('truthy');
  });
});

describe('Utility Functions', () => {
  test('json_encode and json_decode', () => {
    expect(utilityFunctions.json_encode({ a: 1 })).toBe('{"a":1}');
    expect(utilityFunctions.json_decode('{"a":1}')).toEqual({ a: 1 });
    expect(utilityFunctions.json_decode('invalid')).toBeNull();
  });

  test('base64_encode and base64_decode', () => {
    expect(utilityFunctions.base64_encode('hello')).toBe('aGVsbG8=');
    expect(utilityFunctions.base64_decode('aGVsbG8=')).toBe('hello');
    expect(utilityFunctions.base64_decode('!invalid!')).toBeNull();
  });

  test('url_encode and url_decode', () => {
    expect(utilityFunctions.url_encode('hello world')).toBe('hello%20world');
    expect(utilityFunctions.url_decode('hello%20world')).toBe('hello world');
  });

  test('uuid generates valid UUID', () => {
    const uuid = utilityFunctions.uuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('match and test regex', () => {
    expect(utilityFunctions.match('hello world', 'wo\\w+')).toBe('world');
    expect(utilityFunctions.test('hello', '^he')).toBe(true);
    expect(utilityFunctions.test('hello', '^wo')).toBe(false);
  });

  test('match_all finds all matches', () => {
    expect(utilityFunctions.match_all('cat bat rat', '\\w+at')).toEqual(['cat', 'bat', 'rat']);
  });

  test('hash produces consistent results', () => {
    const hash1 = utilityFunctions.hash('test');
    const hash2 = utilityFunctions.hash('test');
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('number');
  });

  test('pretty formats JSON', () => {
    expect(utilityFunctions.pretty({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('Null Safety', () => {
  test('string functions handle null/undefined', () => {
    expect(() => stringFunctions.upper(null as any)).not.toThrow();
    expect(() => stringFunctions.split(undefined as any, ',')).not.toThrow();
    expect(() => stringFunctions.join(null as any, ',')).not.toThrow();
  });

  test('array functions handle null/undefined', () => {
    expect(() => arrayFunctions.length(null as any)).not.toThrow();
    expect(() => arrayFunctions.first(undefined as any)).not.toThrow();
    expect(() => arrayFunctions.sort(null as any)).not.toThrow();
  });

  test('math functions handle non-numeric inputs', () => {
    expect(() => mathFunctions.sum(null as any)).not.toThrow();
    expect(() => mathFunctions.avg(undefined as any)).not.toThrow();
    expect(() => mathFunctions.round('string' as any)).not.toThrow();
  });

  test('time functions handle null/invalid dates', () => {
    expect(() => timeFunctions.parse_date(null as any)).not.toThrow();
    expect(() => timeFunctions.format_date(undefined as any, 'yyyy')).not.toThrow();
    expect(() => timeFunctions.add_time('invalid', { days: 1 })).not.toThrow();
  });

  test('object functions handle null/undefined', () => {
    expect(() => objectFunctions.keys(null as any)).not.toThrow();
    expect(() => objectFunctions.get(undefined as any, 'path')).not.toThrow();
    expect(() => objectFunctions.merge(null as any, { a: 1 })).not.toThrow();
  });
});
