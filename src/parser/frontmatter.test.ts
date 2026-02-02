/**
 * Tests for YAML Frontmatter Parser
 *
 * Focuses on version format validation (semver X.Y.Z or X.Y).
 */

import { test, expect, describe } from 'bun:test';
import { parseFrontmatter } from './frontmatter';
import { buildLineOffsets } from './location';

describe('parseFrontmatter', () => {
  // Helper to create lineOffsets for a simple frontmatter string
  const createLineOffsets = (yaml: string) => buildLineOffsets(`---\n${yaml}\n---\nbody`);

  describe('version validation', () => {
    test('accepts valid semver versions (X.Y.Z format)', () => {
      const validVersions = ['1.0.0', '0.0.1', '10.20.30', '0.1.0', '99.99.99'];
      for (const version of validVersions) {
        const yaml = `name: test\nversion: "${version}"`;
        const lineOffsets = createLineOffsets(yaml);
        const result = parseFrontmatter(yaml, lineOffsets, 4); // 4 = after "---\n"
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.metadata.version).toBe(version);
        }
      }
    });

    test('accepts valid semver versions (X.Y format)', () => {
      const validVersions = ['1.0', '2.1', '0.1', '10.20'];
      for (const version of validVersions) {
        const yaml = `name: test\nversion: "${version}"`;
        const lineOffsets = createLineOffsets(yaml);
        const result = parseFrontmatter(yaml, lineOffsets, 4);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.metadata.version).toBe(version);
        }
      }
    });

    test('rejects invalid version format - bad string', () => {
      const yaml = `name: test\nversion: "bad version format"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.message).toContain('Invalid version format');
        expect(result.errors[0]?.message).toContain('bad version format');
      }
    });

    test('rejects version with v prefix', () => {
      const yaml = `name: test\nversion: "v1.0.0"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.message).toContain('Invalid version format');
      }
    });

    test('rejects single number version', () => {
      const yaml = `name: test\nversion: "1"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
    });

    test('rejects version with prerelease suffix', () => {
      const yaml = `name: test\nversion: "1.0.0-beta"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
    });

    test('rejects empty version string', () => {
      const yaml = `name: test\nversion: ""`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
    });

    test('rejects version with too many parts', () => {
      const yaml = `name: test\nversion: "1.2.3.4"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
    });

    test('rejects version with non-numeric parts', () => {
      const yaml = `name: test\nversion: "a.b.c"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
    });

    test('error message includes helpful hints', () => {
      const yaml = `name: test\nversion: "invalid"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.errors[0];
        expect(error?.hints).toBeDefined();
        expect(error?.hints).toContain('Version must be in semver format: X.Y.Z or X.Y');
        expect(error?.hints).toContain('Examples: "1.0.0", "2.1", "0.0.1"');
      }
    });
  });

  describe('required fields', () => {
    test('requires name field', () => {
      const yaml = `version: "1.0.0"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.message).toContain('name');
      }
    });

    test('requires version field', () => {
      const yaml = `name: test`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.message).toContain('version');
      }
    });

    test('accepts valid minimal frontmatter', () => {
      const yaml = `name: test\nversion: "1.0.0"`;
      const lineOffsets = createLineOffsets(yaml);
      const result = parseFrontmatter(yaml, lineOffsets, 4);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.name).toBe('test');
        expect(result.metadata.version).toBe('1.0.0');
      }
    });
  });
});
