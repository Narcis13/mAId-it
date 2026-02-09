/**
 * Tests for Composition Runtimes (include, call)
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { parse } from '../../parser';
import { validate } from '../../validator';
import { buildExecutionPlan } from '../../scheduler';
import { createExecutionState, execute } from '../../execution';
import { activeWorkflowPaths } from './cycle';
import path from 'node:path';
import fs from 'node:fs';

// Auto-register runtimes
import '../../runtimes';

// Temp directory for test workflow files
const tmpDir = path.join(import.meta.dir, '__test-composition__');

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  activeWorkflowPaths.clear();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  activeWorkflowPaths.clear();
});

function writeWorkflow(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// ============================================================================
// Parser Tests
// ============================================================================

test('parser: parses <include> with bindings', () => {
  const source = `---
name: test-include
version: "1.0"
---
<workflow>
  <include id="sub" workflow="./sub.flow.md">
    <bind key="data" value="{{input}}"/>
    <bind key="limit" value="10"/>
  </include>
</workflow>`;

  const result = parse(source, 'test.flow.md');
  expect(result.success).toBe(true);
  if (!result.success) return;

  expect(result.data.nodes.length).toBe(1);
  const node = result.data.nodes[0]!;
  expect(node.type).toBe('include');
  if (node.type !== 'include') return;
  expect(node.workflow).toBe('./sub.flow.md');
  expect(node.bindings).toEqual([
    { key: 'data', value: '{{input}}' },
    { key: 'limit', value: '10' },
  ]);
});

test('parser: parses <call> with args', () => {
  const source = `---
name: test-call
version: "1.0"
---
<workflow>
  <call id="process" workflow="./processor.flow.md" arg1="hello" arg2="{{data}}"/>
</workflow>`;

  const result = parse(source, 'test.flow.md');
  expect(result.success).toBe(true);
  if (!result.success) return;

  expect(result.data.nodes.length).toBe(1);
  const node = result.data.nodes[0]!;
  expect(node.type).toBe('call');
  if (node.type !== 'call') return;
  expect(node.workflow).toBe('./processor.flow.md');
  expect(node.args).toEqual({ arg1: 'hello', arg2: '{{data}}' });
});

test('parser: rejects <include> without workflow attribute', () => {
  const source = `---
name: test
version: "1.0"
---
<workflow>
  <include id="sub"/>
</workflow>`;

  const result = parse(source, 'test.flow.md');
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.errors[0]!.message).toContain('workflow');
});

test('parser: rejects <call> without workflow attribute', () => {
  const source = `---
name: test
version: "1.0"
---
<workflow>
  <call id="proc"/>
</workflow>`;

  const result = parse(source, 'test.flow.md');
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.errors[0]!.message).toContain('workflow');
});

// ============================================================================
// Validation Tests
// ============================================================================

test('validator: accepts include and call nodes', () => {
  const source = `---
name: test-compose
version: "1.0"
---
<workflow>
  <include id="sub" workflow="./sub.flow.md"/>
  <call id="proc" workflow="./proc.flow.md" x="1"/>
</workflow>`;

  const result = parse(source, 'test.flow.md');
  expect(result.success).toBe(true);
  if (!result.success) return;

  const validation = validate(result.data);
  expect(validation.valid).toBe(true);
});

// ============================================================================
// Include Runtime Tests
// ============================================================================

test('include: executes sub-workflow and returns output', async () => {
  // Create a simple sub-workflow
  const subPath = writeWorkflow('sub.flow.md', `---
name: sub-workflow
version: "1.0"
---
<workflow>
  <transform id="echo" type="template">
    <template>hello from sub</template>
  </transform>
</workflow>`);

  // Create parent workflow that includes it
  const parentSource = `---
name: parent
version: "1.0"
---
<workflow>
  <include id="inc" workflow="./sub.flow.md"/>
</workflow>`;

  const result = parse(parentSource, path.join(tmpDir, 'parent.flow.md'));
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'parent',
    globalContext: { $workflowDir: tmpDir },
  });

  await execute(plan, state);

  const incResult = state.nodeResults.get('inc');
  expect(incResult?.status).toBe('success');
  expect(incResult?.output).toBe('hello from sub');
});

test('include: passes bindings to sub-workflow', async () => {
  // Sub-workflow that uses a bound variable
  writeWorkflow('bound-sub.flow.md', `---
name: bound-sub
version: "1.0"
---
<workflow>
  <transform id="use-data" type="template">
    <template>got: {{input}}</template>
  </transform>
</workflow>`);

  const parentSource = `---
name: parent
version: "1.0"
---
<workflow>
  <transform id="make-data" type="template">
    <template>test-value</template>
  </transform>
  <include id="inc" workflow="./bound-sub.flow.md" input="make-data">
    <bind key="data" value="{{make-data.output}}"/>
  </include>
</workflow>`;

  const result = parse(parentSource, path.join(tmpDir, 'parent.flow.md'));
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'parent',
    globalContext: { $workflowDir: tmpDir },
  });

  await execute(plan, state);

  const incResult = state.nodeResults.get('inc');
  expect(incResult?.status).toBe('success');
});

test('include: detects circular includes', async () => {
  // Workflow A includes workflow B which includes workflow A
  writeWorkflow('a.flow.md', `---
name: workflow-a
version: "1.0"
---
<workflow>
  <include id="inc-b" workflow="./b.flow.md"/>
</workflow>`);

  writeWorkflow('b.flow.md', `---
name: workflow-b
version: "1.0"
---
<workflow>
  <include id="inc-a" workflow="./a.flow.md"/>
</workflow>`);

  const result = parse(
    await Bun.file(path.join(tmpDir, 'a.flow.md')).text(),
    path.join(tmpDir, 'a.flow.md')
  );
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'workflow-a',
    globalContext: { $workflowDir: tmpDir },
  });

  // Should throw due to circular include
  expect(execute(plan, state)).rejects.toThrow('Circular');
});

// ============================================================================
// Call Runtime Tests
// ============================================================================

test('call: executes sub-workflow with isolated context', async () => {
  writeWorkflow('callee.flow.md', `---
name: callee
version: "1.0"
---
<workflow>
  <transform id="echo" type="template">
    <template>called with arg1={{arg1}}</template>
  </transform>
</workflow>`);

  const parentSource = `---
name: caller
version: "1.0"
---
<workflow>
  <call id="my-call" workflow="./callee.flow.md" arg1="hello"/>
</workflow>`;

  const result = parse(parentSource, path.join(tmpDir, 'caller.flow.md'));
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'caller',
    globalContext: { $workflowDir: tmpDir },
  });

  await execute(plan, state);

  const callResult = state.nodeResults.get('my-call');
  expect(callResult?.status).toBe('success');
  expect(callResult?.output).toBe('called with arg1=hello');
});

test('call: detects circular calls', async () => {
  writeWorkflow('self.flow.md', `---
name: self
version: "1.0"
---
<workflow>
  <call id="recurse" workflow="./self.flow.md"/>
</workflow>`);

  const result = parse(
    await Bun.file(path.join(tmpDir, 'self.flow.md')).text(),
    path.join(tmpDir, 'self.flow.md')
  );
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'self',
    globalContext: { $workflowDir: tmpDir },
  });

  expect(execute(plan, state)).rejects.toThrow('Circular');
});

// ============================================================================
// Cycle Detection Cleanup
// ============================================================================

test('cycle detection: cleans up after successful execution', async () => {
  writeWorkflow('clean.flow.md', `---
name: clean
version: "1.0"
---
<workflow>
  <transform id="ok" type="template">
    <template>done</template>
  </transform>
</workflow>`);

  const parentSource = `---
name: parent
version: "1.0"
---
<workflow>
  <include id="inc" workflow="./clean.flow.md"/>
</workflow>`;

  const result = parse(parentSource, path.join(tmpDir, 'parent.flow.md'));
  expect(result.success).toBe(true);
  if (!result.success) return;

  const plan = buildExecutionPlan(result.data);
  const state = createExecutionState({
    workflowId: 'parent',
    globalContext: { $workflowDir: tmpDir },
  });

  await execute(plan, state);

  // Active workflows should be empty after execution
  expect(activeWorkflowPaths.size).toBe(0);
});
