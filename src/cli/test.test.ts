/**
 * Tests for the flowscript test command.
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { testWorkflow } from './test';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = path.join(import.meta.dir, '__test-testcmd__');

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

test('test command: runs tests from .test.flow.md', async () => {
  // Create workflow
  writeFile('echo.flow.md', `---
name: echo
version: "1.0"
---
<workflow>
  <transform id="echo" type="template">
    <template>hello world</template>
  </transform>
</workflow>`);

  // Create test file
  const testPath = writeFile('echo.test.flow.md', `---
tests:
  - name: "echoes hello world"
    expectOutput: "hello world"
---
`);

  const result = await testWorkflow(testPath, { noColor: true });

  expect(result.total).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(0);
  expect(result.success).toBe(true);
});

test('test command: detects test failures', async () => {
  writeFile('simple.flow.md', `---
name: simple
version: "1.0"
---
<workflow>
  <transform id="out" type="template">
    <template>actual value</template>
  </transform>
</workflow>`);

  const testPath = writeFile('simple.test.flow.md', `---
tests:
  - name: "wrong expectation"
    expectOutput: "wrong value"
---
`);

  const result = await testWorkflow(testPath, { noColor: true });

  expect(result.total).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.success).toBe(false);
  expect(result.output).toContain('mismatch');
});

test('test command: runs multiple test cases', async () => {
  writeFile('multi.flow.md', `---
name: multi
version: "1.0"
---
<workflow>
  <transform id="out" type="template">
    <template>result</template>
  </transform>
</workflow>`);

  const testPath = writeFile('multi.test.flow.md', `---
tests:
  - name: "test 1 passes"
    expectOutput: "result"
  - name: "test 2 passes"
    expectOutput: "result"
  - name: "test 3 fails"
    expectOutput: "wrong"
---
`);

  const result = await testWorkflow(testPath, { noColor: true });

  expect(result.total).toBe(3);
  expect(result.passed).toBe(2);
  expect(result.failed).toBe(1);
});

test('test command: asserts on specific node outputs', async () => {
  writeFile('nodes.flow.md', `---
name: nodes
version: "1.0"
---
<workflow>
  <transform id="step1" type="template">
    <template>first</template>
  </transform>
  <transform id="step2" type="template" input="step1">
    <template>second</template>
  </transform>
</workflow>`);

  const testPath = writeFile('nodes.test.flow.md', `---
tests:
  - name: "checks step1"
    expect:
      step1: "first"
  - name: "checks step2"
    expect:
      step2: "second"
---
`);

  const result = await testWorkflow(testPath, { noColor: true });

  expect(result.total).toBe(2);
  expect(result.passed).toBe(2);
  expect(result.failed).toBe(0);
});

test('test command: discovers test file from workflow file', async () => {
  const workflowPath = writeFile('discover.flow.md', `---
name: discover
version: "1.0"
---
<workflow>
  <transform id="out" type="template">
    <template>found</template>
  </transform>
</workflow>`);

  writeFile('discover.test.flow.md', `---
tests:
  - name: "auto-discovered"
    expectOutput: "found"
---
`);

  // Pass the workflow file, not the test file
  const result = await testWorkflow(workflowPath, { noColor: true });

  expect(result.total).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.success).toBe(true);
});

test('test command: handles missing test cases', async () => {
  const workflowPath = writeFile('no-tests.flow.md', `---
name: no-tests
version: "1.0"
---
<workflow>
  <transform id="out" type="template">
    <template>no tests</template>
  </transform>
</workflow>`);

  const result = await testWorkflow(workflowPath, { noColor: true });

  expect(result.success).toBe(false);
  expect(result.output).toContain('No test cases');
});

test('test command: handles file not found', async () => {
  const result = await testWorkflow('/nonexistent/file.flow.md', { noColor: true });
  expect(result.success).toBe(false);
  expect(result.output).toContain('not found');
});

test('test command: JSON output format', async () => {
  writeFile('json.flow.md', `---
name: json
version: "1.0"
---
<workflow>
  <transform id="out" type="template">
    <template>value</template>
  </transform>
</workflow>`);

  const testPath = writeFile('json.test.flow.md', `---
tests:
  - name: "json test"
    expectOutput: "value"
---
`);

  const result = await testWorkflow(testPath, { format: 'json' });

  const json = JSON.parse(result.output);
  expect(json.total).toBe(1);
  expect(json.passed).toBe(1);
  expect(json.results[0].name).toBe('json test');
  expect(json.results[0].passed).toBe(true);
});
