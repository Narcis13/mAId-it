/**
 * Tests for Evolution Module
 *
 * Covers: metrics collection, pattern detection, behavior profiling,
 * drift detection, feedback generation, version bumping.
 */

import { test, expect, describe } from 'bun:test';
import type { ExecutionState } from '../types';
import {
  collectMetrics,
  detectPatterns,
  generateLearning,
  formatLearnings,
  type ExecutionMetrics,
} from './tracker';
import {
  profileOutputs,
  compareBehavior,
  suggestVersionBump,
  type BehaviorProfile,
} from './behavior';
import { formatFeedback, type FeedbackEntry } from './feedback';

// ============================================================================
// Helpers
// ============================================================================

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    workflowId: 'test-workflow',
    runId: 'run-1',
    status: 'completed',
    currentWave: 0,
    startedAt: 1000,
    completedAt: 2000,
    nodeResults: new Map(),
    globalContext: {},
    phaseContext: {},
    nodeContext: {},
    config: {},
    secrets: {},
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  return {
    runId: 'run-1',
    timestamp: 1000,
    duration: 1000,
    status: 'completed',
    nodeCount: 3,
    successCount: 3,
    failedCount: 0,
    skippedCount: 0,
    successRate: 1,
    avgNodeDuration: 100,
    maxNodeDuration: 150,
    failedNodes: [],
    errorMessages: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<BehaviorProfile> = {}): BehaviorProfile {
  return {
    timestamp: 1000,
    runId: 'run-1',
    typeDistribution: { string: 2, object: 1 },
    avgOutputLength: 50,
    outputCount: 3,
    nodeProfiles: {
      node1: { type: 'string', length: 100 },
      node2: { type: 'string', length: 50 },
      node3: { type: 'object', keys: ['name', 'value'] },
    },
    ...overrides,
  };
}

// ============================================================================
// Tracker Tests
// ============================================================================

describe('collectMetrics', () => {
  test('collects metrics from successful state', () => {
    const state = makeState({
      startedAt: 1000,
      completedAt: 3000,
      nodeResults: new Map([
        ['a', { status: 'success', output: 'hello', duration: 500, startedAt: 1000, completedAt: 1500 }],
        ['b', { status: 'success', output: 42, duration: 700, startedAt: 1500, completedAt: 2200 }],
        ['c', { status: 'failed', error: new Error('boom'), duration: 300, startedAt: 2200, completedAt: 2500 }],
      ]),
    });

    const metrics = collectMetrics(state);
    expect(metrics.duration).toBe(2000);
    expect(metrics.nodeCount).toBe(3);
    expect(metrics.successCount).toBe(2);
    expect(metrics.failedCount).toBe(1);
    expect(metrics.successRate).toBeCloseTo(0.667, 2);
    expect(metrics.avgNodeDuration).toBe(500);
    expect(metrics.maxNodeDuration).toBe(700);
    expect(metrics.failedNodes).toEqual(['c']);
    expect(metrics.errorMessages).toEqual(['boom']);
  });

  test('handles empty results', () => {
    const state = makeState();
    const metrics = collectMetrics(state);
    expect(metrics.nodeCount).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.avgNodeDuration).toBe(0);
  });
});

describe('detectPatterns', () => {
  test('detects recurring failures', () => {
    const current = makeMetrics({ failedNodes: ['node-x'] });
    const history = [
      makeMetrics({ failedNodes: ['node-x'] }),
      makeMetrics({ failedNodes: ['node-x', 'node-y'] }),
      makeMetrics({ failedNodes: [] }),
    ];

    const patterns = detectPatterns(current, history);
    const recurring = patterns.find(p => p.type === 'recurring_failure');
    expect(recurring).toBeDefined();
    expect(recurring!.message).toContain('node-x');
    expect(recurring!.message).toContain('3');
  });

  test('does not flag single failure as recurring', () => {
    const current = makeMetrics({ failedNodes: ['node-a'] });
    const history = [makeMetrics({ failedNodes: [] })];

    const patterns = detectPatterns(current, history);
    const recurring = patterns.filter(p => p.type === 'recurring_failure');
    expect(recurring).toHaveLength(0);
  });

  test('detects performance degradation', () => {
    const current = makeMetrics({ duration: 5000 });
    const history = [
      makeMetrics({ duration: 1000 }),
      makeMetrics({ duration: 1200 }),
      makeMetrics({ duration: 1100 }),
    ];

    const patterns = detectPatterns(current, history);
    const perf = patterns.find(p => p.type === 'performance_degradation');
    expect(perf).toBeDefined();
    expect(perf!.message).toContain('slower');
  });

  test('detects success rate drop', () => {
    const current = makeMetrics({ successRate: 0.5 });
    const history = [
      makeMetrics({ successRate: 1.0 }),
      makeMetrics({ successRate: 0.95 }),
      makeMetrics({ successRate: 1.0 }),
    ];

    const patterns = detectPatterns(current, history);
    const drop = patterns.find(p => p.type === 'success_rate_drop');
    expect(drop).toBeDefined();
    expect(drop!.message).toContain('50%');
  });

  test('detects recovery after failures', () => {
    const current = makeMetrics({ status: 'completed' });
    const history = [
      makeMetrics({ status: 'failed' }),
      makeMetrics({ status: 'failed' }),
      makeMetrics({ status: 'failed' }),
    ];

    const patterns = detectPatterns(current, history);
    const recovery = patterns.find(p => p.type === 'recovery');
    expect(recovery).toBeDefined();
    expect(recovery!.message).toContain('recovered');
  });

  test('returns empty patterns for no history', () => {
    const patterns = detectPatterns(makeMetrics(), []);
    expect(patterns).toHaveLength(0);
  });
});

describe('generateLearning', () => {
  test('generates learning from patterns', () => {
    const metrics = makeMetrics();
    const patterns = [
      { type: 'recurring_failure' as const, severity: 'warning' as const, message: 'Node X fails often', evidence: {} },
    ];

    const learning = generateLearning(metrics, patterns);
    expect(learning.runId).toBe('run-1');
    expect(learning.summary).toContain('Node X fails often');
    expect(learning.patterns).toHaveLength(1);
  });

  test('generates summary when no patterns', () => {
    const metrics = makeMetrics({ runId: 'run-42', status: 'completed', successRate: 0.9 });
    const learning = generateLearning(metrics, []);
    expect(learning.summary).toContain('run-42');
    expect(learning.summary).toContain('completed');
  });
});

describe('formatLearnings', () => {
  test('formats learnings as markdown', () => {
    const learnings = [
      generateLearning(makeMetrics({ timestamp: Date.parse('2026-02-09') }), [
        { type: 'recurring_failure', severity: 'warning', message: 'Node X fails', evidence: {} },
      ]),
    ];

    const md = formatLearnings(learnings);
    expect(md).toContain('### Learnings');
    expect(md).toContain('(!) Node X fails');
    expect(md).toContain('2026-02-09');
  });

  test('returns empty for no learnings', () => {
    expect(formatLearnings([])).toBe('');
  });
});

// ============================================================================
// Behavior Tests
// ============================================================================

describe('profileOutputs', () => {
  test('profiles output types and lengths', () => {
    const state = makeState({
      nodeResults: new Map([
        ['a', { status: 'success', output: 'hello world', duration: 100, startedAt: 1000, completedAt: 1100 }],
        ['b', { status: 'success', output: [1, 2, 3], duration: 100, startedAt: 1100, completedAt: 1200 }],
        ['c', { status: 'success', output: { name: 'test', value: 42 }, duration: 100, startedAt: 1200, completedAt: 1300 }],
        ['d', { status: 'failed', error: new Error('x'), duration: 50, startedAt: 1300, completedAt: 1350 }],
      ]),
    });

    const profile = profileOutputs(state);
    expect(profile.outputCount).toBe(3); // 'd' is failed, not counted
    expect(profile.typeDistribution.string).toBe(1);
    expect(profile.typeDistribution.array).toBe(1);
    expect(profile.typeDistribution.object).toBe(1);
    expect(profile.nodeProfiles.a.type).toBe('string');
    expect(profile.nodeProfiles.a.length).toBe(11);
    expect(profile.nodeProfiles.b.type).toBe('array');
    expect(profile.nodeProfiles.b.length).toBe(3);
    expect(profile.nodeProfiles.c.type).toBe('object');
    expect(profile.nodeProfiles.c.keys).toEqual(['name', 'value']);
    expect(profile.nodeProfiles.d).toBeUndefined();
  });

  test('handles empty state', () => {
    const profile = profileOutputs(makeState());
    expect(profile.outputCount).toBe(0);
    expect(profile.avgOutputLength).toBe(0);
  });
});

describe('compareBehavior', () => {
  test('no drift for identical profiles', () => {
    const profile = makeProfile();
    const drift = compareBehavior(profile, profile);
    expect(drift.score).toBe(0);
    expect(drift.drifted).toBe(false);
    expect(drift.signals).toHaveLength(0);
  });

  test('detects type change in node output', () => {
    const current = makeProfile({
      nodeProfiles: {
        ...makeProfile().nodeProfiles,
        node1: { type: 'number' }, // was 'string'
      },
    });
    const baseline = makeProfile();

    const drift = compareBehavior(current, baseline);
    const typeSignal = drift.signals.find(s => s.type === 'type_change' && s.nodeId === 'node1');
    expect(typeSignal).toBeDefined();
    expect(typeSignal!.message).toContain('string');
    expect(typeSignal!.message).toContain('number');
  });

  test('detects missing node', () => {
    const current = makeProfile({
      nodeProfiles: {
        node1: { type: 'string', length: 100 },
        // node2 and node3 missing
      },
      outputCount: 1,
    });
    const baseline = makeProfile();

    const drift = compareBehavior(current, baseline);
    const missingSignals = drift.signals.filter(s => s.type === 'missing_node');
    expect(missingSignals.length).toBeGreaterThanOrEqual(1);
  });

  test('detects new node', () => {
    const current = makeProfile({
      nodeProfiles: {
        ...makeProfile().nodeProfiles,
        newNode: { type: 'string', length: 20 },
      },
      outputCount: 4,
    });
    const baseline = makeProfile();

    const drift = compareBehavior(current, baseline);
    const newSignals = drift.signals.filter(s => s.type === 'new_node');
    expect(newSignals.length).toBe(1);
    expect(newSignals[0]!.nodeId).toBe('newNode');
  });

  test('detects key change in object output', () => {
    const current = makeProfile({
      nodeProfiles: {
        ...makeProfile().nodeProfiles,
        node3: { type: 'object', keys: ['name', 'value', 'extra'] },
      },
    });
    const baseline = makeProfile();

    const drift = compareBehavior(current, baseline);
    const keySignal = drift.signals.find(s => s.type === 'key_change' && s.nodeId === 'node3');
    expect(keySignal).toBeDefined();
    expect(keySignal!.message).toContain('extra');
  });

  test('detects length shift', () => {
    const current = makeProfile({ avgOutputLength: 200 }); // was 50
    const baseline = makeProfile();

    const drift = compareBehavior(current, baseline);
    const lengthSignal = drift.signals.find(s => s.type === 'length_shift');
    expect(lengthSignal).toBeDefined();
  });
});

describe('suggestVersionBump', () => {
  test('suggests bump when drifted', () => {
    const result = suggestVersionBump('1.0.0', { score: 0.5, drifted: true, signals: [] });
    expect(result).toBe('1.0.0+b1');
  });

  test('increments existing behavior version', () => {
    const result = suggestVersionBump('1.0.0+b3', { score: 0.5, drifted: true, signals: [] });
    expect(result).toBe('1.0.0+b4');
  });

  test('returns undefined when not drifted', () => {
    const result = suggestVersionBump('1.0.0', { score: 0.1, drifted: false, signals: [] });
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Feedback Tests
// ============================================================================

describe('formatFeedback', () => {
  test('formats feedback with patterns and suggestions', () => {
    const entry: FeedbackEntry = {
      timestamp: Date.now(),
      runId: 'run-1',
      metrics: makeMetrics(),
      learning: generateLearning(makeMetrics(), [
        { type: 'recurring_failure', severity: 'critical', message: 'Node X fails', evidence: {} },
      ]),
      drift: { score: 0.4, drifted: true, signals: [
        { type: 'type_change', message: 'Type changed', magnitude: 0.8 },
      ] },
      suggestions: ['Add retry to node X'],
      suggestedVersion: '1.0.0+b1',
    };

    const md = formatFeedback(entry);
    expect(md).toContain('### Evolution Feedback');
    expect(md).toContain('(!!) Node X fails');
    expect(md).toContain('Behavior drift');
    expect(md).toContain('Type changed');
    expect(md).toContain('Add retry to node X');
    expect(md).toContain('1.0.0+b1');
  });

  test('returns empty for entry with no patterns or suggestions', () => {
    const entry: FeedbackEntry = {
      timestamp: Date.now(),
      runId: 'run-1',
      metrics: makeMetrics(),
      learning: generateLearning(makeMetrics(), []),
      drift: null,
      suggestions: [],
      suggestedVersion: undefined,
    };

    const md = formatFeedback(entry);
    expect(md).toBe('');
  });
});
