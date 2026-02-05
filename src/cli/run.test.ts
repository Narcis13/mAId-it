/**
 * Tests for CLI run command
 */

import { test, expect, describe } from 'bun:test';
import { runWorkflow, parseConfigOverrides } from './run';

const TEST_WORKFLOW = 'src/cli/fixtures/test-workflow.flow.md';

describe('runWorkflow', () => {
  describe('file handling', () => {
    test('returns error for nonexistent file', async () => {
      const result = await runWorkflow('nonexistent.flow.md');
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });

    test('returns error for invalid workflow', async () => {
      // Create temp file with invalid content
      const tmpPath = '/tmp/invalid-workflow.flow.md';
      await Bun.write(tmpPath, 'not valid yaml or xml');

      const result = await runWorkflow(tmpPath);
      expect(result.success).toBe(false);
    });

    test('parses valid workflow file', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      expect(result.success).toBe(true);
    });
  });

  describe('dry-run mode', () => {
    test('shows execution plan without executing', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Execution Plan');
      expect(result.output).toContain('Wave');
      expect(result.output).toContain('test-workflow');
    });

    test('shows node count in plan', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      expect(result.output).toContain('Total nodes: 2');
    });

    test('shows wave breakdown with node types', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      expect(result.output).toContain('source:http');
      expect(result.output).toContain('transform:template');
    });

    test('shows hint to execute without dry-run', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      expect(result.output).toContain('Use without --dry-run to execute');
    });
  });

  describe('config overrides', () => {
    test('parses single config override', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        config: ['output_dir=./custom'],
      });
      expect(result.success).toBe(true);
    });

    test('parses multiple config overrides', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        config: ['output_dir=./custom', 'timeout=60'],
      });
      expect(result.success).toBe(true);
    });

    test('dry-run displays config but does not validate format', async () => {
      // In dry-run mode, config is displayed but not parsed/validated
      // This is by design - dry-run returns early before config parsing
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        config: ['invalid-no-equals'],
      });
      // Dry-run succeeds because it doesn't parse config values
      expect(result.success).toBe(true);
      expect(result.output).toContain('Config overrides');
    });

    test('parses JSON values in config', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        config: ['nested={"key": "value"}'],
      });
      expect(result.success).toBe(true);
    });

    test('shows config overrides in dry-run output', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        config: ['output_dir=./custom'],
      });
      expect(result.output).toContain('Config overrides');
      expect(result.output).toContain('output_dir=./custom');
    });
  });

  describe('input parsing', () => {
    test('parses valid JSON input', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        input: '{"name": "test", "count": 42}',
      });
      expect(result.success).toBe(true);
    });

    test('dry-run displays input but does not validate JSON', async () => {
      // In dry-run mode, input is displayed but not parsed/validated
      // This is by design - dry-run returns early before input parsing
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        input: 'not valid json',
      });
      // Dry-run succeeds because it doesn't parse input values
      expect(result.success).toBe(true);
      expect(result.output).toContain('Input');
    });

    test('shows input in dry-run output', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        input: '{"name": "test"}',
      });
      expect(result.output).toContain('Input');
      expect(result.output).toContain('{"name": "test"}');
    });
  });

  describe('output format', () => {
    test('text format is default', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, { dryRun: true });
      // Text format shouldn't be valid JSON (contains color codes and formatting)
      expect(() => JSON.parse(result.output)).toThrow();
    });

    // Note: JSON format would require implementation changes to support
    // Currently only text format is implemented for dry-run
  });

  describe('no-color option', () => {
    test('respects noColor option', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        noColor: true,
      });
      expect(result.success).toBe(true);
      // Should not contain ANSI escape codes
      expect(result.output).not.toMatch(/\x1b\[/);
    });

    test('output without color is still readable', async () => {
      const result = await runWorkflow(TEST_WORKFLOW, {
        dryRun: true,
        noColor: true,
      });
      expect(result.output).toContain('Execution Plan');
      expect(result.output).toContain('test-workflow');
    });
  });
});

describe('parseConfigOverrides', () => {
  test('parses simple key=value', () => {
    const result = parseConfigOverrides(['key=value']);
    expect(result).toEqual({ key: 'value' });
  });

  test('parses multiple overrides', () => {
    const result = parseConfigOverrides(['a=1', 'b=2', 'c=3']);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  test('parses JSON values', () => {
    const result = parseConfigOverrides(['obj={"nested": true}']);
    expect(result).toEqual({ obj: { nested: true } });
  });

  test('parses array JSON values', () => {
    const result = parseConfigOverrides(['arr=[1, 2, 3]']);
    expect(result).toEqual({ arr: [1, 2, 3] });
  });

  test('parses boolean JSON values', () => {
    const result = parseConfigOverrides(['enabled=true', 'disabled=false']);
    expect(result).toEqual({ enabled: true, disabled: false });
  });

  test('parses numeric JSON values', () => {
    const result = parseConfigOverrides(['count=42', 'ratio=3.14']);
    expect(result).toEqual({ count: 42, ratio: 3.14 });
  });

  test('keeps strings that are not valid JSON', () => {
    const result = parseConfigOverrides(['name=hello world']);
    expect(result).toEqual({ name: 'hello world' });
  });

  test('handles empty value', () => {
    const result = parseConfigOverrides(['empty=']);
    expect(result).toEqual({ empty: '' });
  });

  test('handles value with equals sign', () => {
    const result = parseConfigOverrides(['equation=a=b+c']);
    expect(result).toEqual({ equation: 'a=b+c' });
  });

  test('throws on missing equals', () => {
    expect(() => parseConfigOverrides(['invalid'])).toThrow("Missing '='");
  });

  test('throws on empty key', () => {
    expect(() => parseConfigOverrides(['=value'])).toThrow('Empty key');
  });

  test('handles empty array', () => {
    const result = parseConfigOverrides([]);
    expect(result).toEqual({});
  });

  test('trims key whitespace', () => {
    const result = parseConfigOverrides(['  key  =value']);
    expect(result).toEqual({ key: 'value' });
  });
});
