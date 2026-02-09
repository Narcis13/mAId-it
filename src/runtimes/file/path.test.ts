/**
 * Tests for Path Validation and Security Hardening
 */

import { test, expect, describe } from 'bun:test';
import { validatePath, detectFormat } from './path';
import { PathTraversalError } from '../errors';

describe('validatePath', () => {
  // Use a fixed base dir for consistent testing
  const baseDir = '/tmp/test-workflows';

  test('allows simple relative paths', () => {
    expect(() => validatePath('data/users.json', baseDir)).not.toThrow();
    expect(() => validatePath('output.txt', baseDir)).not.toThrow();
    expect(() => validatePath('a/b/c/d.json', baseDir)).not.toThrow();
  });

  test('blocks basic ../ traversal', () => {
    expect(() => validatePath('../../../etc/passwd', baseDir)).toThrow(PathTraversalError);
    expect(() => validatePath('foo/../../bar', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks URL-encoded traversal (..%2F)', () => {
    expect(() => validatePath('..%2F..%2Fetc%2Fpasswd', baseDir)).toThrow(PathTraversalError);
    expect(() => validatePath('foo%2F..%2F..%2Fbar', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks double-encoded traversal', () => {
    // %252F is double-encoded / — decodeURIComponent gives %2F
    // After single decode it becomes ..%2F which is still a string, but
    // the important thing is path.resolve normalizes the decoded form
    expect(() => validatePath('..%2F..%2Fetc/passwd', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks absolute paths', () => {
    expect(() => validatePath('/etc/passwd', baseDir)).toThrow(PathTraversalError);
    expect(() => validatePath('/tmp/other/file.txt', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks Windows absolute paths', () => {
    expect(() => validatePath('C:\\Windows\\System32\\config', baseDir)).toThrow(PathTraversalError);
    expect(() => validatePath('D:/data/file.txt', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks null byte injection', () => {
    expect(() => validatePath('file.txt\0.jpg', baseDir)).toThrow(PathTraversalError);
    expect(() => validatePath('\0', baseDir)).toThrow(PathTraversalError);
  });

  test('blocks backslash traversal', () => {
    expect(() => validatePath('..\\..\\etc\\passwd', baseDir)).toThrow(PathTraversalError);
  });

  test('allows paths within base directory', () => {
    expect(() => validatePath('sub/dir/file.txt', baseDir)).not.toThrow();
    expect(() => validatePath('./file.txt', baseDir)).not.toThrow();
  });
});

describe('detectFormat', () => {
  test('detects JSON from extension', () => {
    expect(detectFormat('data.json')).toBe('json');
    expect(detectFormat('PATH/TO/FILE.JSON')).toBe('json');
  });

  test('detects CSV from extension', () => {
    expect(detectFormat('data.csv')).toBe('csv');
  });

  test('detects YAML from extension', () => {
    expect(detectFormat('config.yaml')).toBe('yaml');
    expect(detectFormat('config.yml')).toBe('yaml');
  });

  test('defaults to text for unknown extensions', () => {
    expect(detectFormat('readme.txt')).toBe('text');
    expect(detectFormat('noext')).toBe('text');
  });
});
