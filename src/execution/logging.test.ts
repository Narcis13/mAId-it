/**
 * Tests for Execution Logging
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { formatExecutionLog, appendExecutionLog } from './logging';
import { createExecutionState } from './state';
import type { ExecutionState, NodeResult } from './types';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';

// Test directory for log files
const TEST_LOG_DIR = join(import.meta.dir, '__test-log-state__');

// Helper to create a state with node results
function createStateWithResults(): ExecutionState {
  const state = createExecutionState({
    workflowId: 'test-workflow',
    runId: 'run-abc123',
  });

  state.status = 'completed';
  state.currentWave = 2;
  state.completedAt = state.startedAt + 5000; // 5 seconds total

  // Add node results in execution order
  const baseTime = state.startedAt;

  state.nodeResults.set('fetch-data', {
    status: 'success',
    output: { items: [1, 2, 3] },
    duration: 1500,
    startedAt: baseTime,
    completedAt: baseTime + 1500,
  });

  state.nodeResults.set('transform', {
    status: 'success',
    output: { transformed: true, count: 3 },
    duration: 500,
    startedAt: baseTime + 1500,
    completedAt: baseTime + 2000,
  });

  state.nodeResults.set('save-result', {
    status: 'success',
    output: { saved: true },
    duration: 300,
    startedAt: baseTime + 2000,
    completedAt: baseTime + 2300,
  });

  return state;
}

describe('formatExecutionLog', () => {
  test('produces valid markdown with header', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    expect(log).toContain('---');
    expect(log).toContain('## Execution Log');
    expect(log).toContain('**Run ID:** `run-abc123`');
    expect(log).toContain('**Workflow:** test-workflow');
  });

  test('includes timestamp in ISO format', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    // Should contain ISO timestamp
    expect(log).toContain('**Timestamp:**');
    expect(log).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('includes duration in seconds', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    expect(log).toContain('**Duration:** 5.00s');
  });

  test('includes status', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    expect(log).toContain('**Status:** completed');
  });

  test('includes wave count', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    // currentWave is 2 (0-indexed), so wave count is 3
    expect(log).toContain('**Waves:** 3');
  });

  test('includes per-node table with results', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    // Check table header
    expect(log).toContain('### Node Results');
    expect(log).toContain('| Node | Status | Duration | Output |');
    expect(log).toContain('|------|--------|----------|--------|');

    // Check node rows
    expect(log).toContain('| fetch-data | success |');
    expect(log).toContain('| transform | success |');
    expect(log).toContain('| save-result | success |');
  });

  test('sorts nodes by execution order (startedAt)', () => {
    const state = createStateWithResults();
    const log = formatExecutionLog(state);

    // Find positions of node names in output
    const fetchPos = log.indexOf('fetch-data');
    const transformPos = log.indexOf('transform');
    const savePos = log.indexOf('save-result');

    expect(fetchPos).toBeLessThan(transformPos);
    expect(transformPos).toBeLessThan(savePos);
  });

  test('truncates long output', () => {
    const state = createExecutionState({
      workflowId: 'test',
      runId: 'run-1',
    });
    state.status = 'completed';
    state.completedAt = state.startedAt + 1000;

    state.nodeResults.set('long-output', {
      status: 'success',
      output: { data: 'A'.repeat(100) },
      duration: 100,
      startedAt: state.startedAt,
      completedAt: state.startedAt + 100,
    });

    const log = formatExecutionLog(state);

    // Should be truncated with ...
    expect(log).toContain('...');
    // Should not contain the full 100 A's
    expect(log).not.toContain('A'.repeat(60));
  });

  test('escapes pipe characters in output', () => {
    const state = createExecutionState({
      workflowId: 'test',
      runId: 'run-1',
    });
    state.status = 'completed';
    state.completedAt = state.startedAt + 1000;

    state.nodeResults.set('pipe-output', {
      status: 'success',
      output: 'value|with|pipes',
      duration: 100,
      startedAt: state.startedAt,
      completedAt: state.startedAt + 100,
    });

    const log = formatExecutionLog(state);

    // Pipes should be escaped
    expect(log).toContain('\\|');
  });

  test('shows error message for failed nodes', () => {
    const state = createExecutionState({
      workflowId: 'test',
      runId: 'run-1',
    });
    state.status = 'failed';
    state.completedAt = state.startedAt + 1000;

    state.nodeResults.set('failed-node', {
      status: 'failed',
      error: new Error('Connection timeout'),
      duration: 100,
      startedAt: state.startedAt,
      completedAt: state.startedAt + 100,
    });

    const log = formatExecutionLog(state);

    expect(log).toContain('| failed-node | failed |');
    expect(log).toContain('Error: Connection timeout');
  });
});

describe('appendExecutionLog', () => {
  beforeEach(async () => {
    await mkdir(TEST_LOG_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_LOG_DIR, { recursive: true, force: true });
  });

  test('appends log to new file', async () => {
    const state = createStateWithResults();
    const path = join(TEST_LOG_DIR, 'new-workflow.flow.md');

    await appendExecutionLog(path, state);

    const content = await Bun.file(path).text();
    expect(content).toContain('## Execution Log');
    expect(content).toContain('run-abc123');
  });

  test('appends log to existing file without log section', async () => {
    const path = join(TEST_LOG_DIR, 'existing-workflow.flow.md');
    const originalContent = `# My Workflow

<workflow>
  <source type="http" id="fetch" />
</workflow>`;

    await Bun.write(path, originalContent);

    const state = createStateWithResults();
    await appendExecutionLog(path, state);

    const content = await Bun.file(path).text();

    // Original content preserved
    expect(content).toContain('# My Workflow');
    expect(content).toContain('<workflow>');

    // Log appended
    expect(content).toContain('## Execution Log');
    expect(content).toContain('run-abc123');
  });

  test('replaces existing log section', async () => {
    const path = join(TEST_LOG_DIR, 'with-log.flow.md');
    const originalContent = `# My Workflow

<workflow>
  <source type="http" id="fetch" />
</workflow>

---

## Execution Log

**Run ID:** \`old-run-123\`
**Workflow:** old-workflow
`;

    await Bun.write(path, originalContent);

    const state = createStateWithResults();
    await appendExecutionLog(path, state);

    const content = await Bun.file(path).text();

    // Original workflow content preserved
    expect(content).toContain('# My Workflow');
    expect(content).toContain('<workflow>');

    // Old log replaced
    expect(content).not.toContain('old-run-123');
    expect(content).not.toContain('old-workflow');

    // New log present
    expect(content).toContain('run-abc123');
    expect(content).toContain('test-workflow');

    // Only one log section
    const logMatches = content.match(/## Execution Log/g);
    expect(logMatches?.length).toBe(1);
  });

  test('handles file ending without newline', async () => {
    const path = join(TEST_LOG_DIR, 'no-newline.flow.md');
    await Bun.write(path, '# Workflow'); // No trailing newline

    const state = createStateWithResults();
    await appendExecutionLog(path, state);

    const content = await Bun.file(path).text();
    expect(content).toContain('# Workflow');
    expect(content).toContain('## Execution Log');
  });
});
