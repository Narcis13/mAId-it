/**
 * Tests for the flowscript inspect command.
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { inspectWorkflow } from './inspect';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = path.join(import.meta.dir, '__test-inspect__');

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

const sampleWorkflow = `---
name: sample-workflow
version: "1.0"
description: A sample workflow
trigger:
  type: manual
config:
  limit:
    type: number
    default: 10
    required: true
    description: "Max items to fetch"
secrets:
  - API_KEY
---
<workflow>
  <source id="fetch-data" type="http">
    <url>https://api.example.com/data</url>
  </source>
  <transform id="process" type="template" input="fetch-data">
    <template>processed: {{fetch-data.output}}</template>
  </transform>
  <sink id="save" type="file" input="process">
    <path>./output.json</path>
  </sink>
</workflow>`;

test('inspect: shows workflow structure', async () => {
  const filePath = writeFile('sample.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, { noColor: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('sample-workflow');
  expect(result.output).toContain('1.0');
  expect(result.output).toContain('fetch-data');
  expect(result.output).toContain('process');
  expect(result.output).toContain('save');
});

test('inspect: shows dependency graph with --deps', async () => {
  const filePath = writeFile('deps.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, { deps: true, noColor: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('Dependencies');
  expect(result.output).toContain('fetch-data');
  expect(result.output).toContain('process');
});

test('inspect: shows schemas with --schema', async () => {
  const filePath = writeFile('schema.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, { schema: true, noColor: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('Config Schema');
  expect(result.output).toContain('limit');
  expect(result.output).toContain('number');
  expect(result.output).toContain('Secrets');
  expect(result.output).toContain('API_KEY');
});

test('inspect: outputs JSON format', async () => {
  const filePath = writeFile('json.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, { format: 'json' });

  expect(result.success).toBe(true);
  const json = JSON.parse(result.output);
  expect(json.metadata.name).toBe('sample-workflow');
  expect(json.nodes.length).toBe(3);
});

test('inspect: JSON with deps and schema', async () => {
  const filePath = writeFile('json-full.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, {
    format: 'json',
    deps: true,
    schema: true,
  });

  expect(result.success).toBe(true);
  const json = JSON.parse(result.output);
  expect(json.dependencies).toBeDefined();
  expect(json.configSchema).toBeDefined();
  expect(json.secrets).toContain('API_KEY');
});

test('inspect: handles file not found', async () => {
  const result = await inspectWorkflow('/nonexistent/file.flow.md', { noColor: true });
  expect(result.success).toBe(false);
  expect(result.output).toContain('not found');
});

test('inspect: shows validation status', async () => {
  const filePath = writeFile('valid.flow.md', sampleWorkflow);
  const result = await inspectWorkflow(filePath, { noColor: true });

  expect(result.success).toBe(true);
  expect(result.output).toContain('Validation passed');
});
