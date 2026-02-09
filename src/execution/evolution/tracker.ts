/**
 * Execution Learnings Tracker
 *
 * After each workflow run, collects metrics and compares to historical baselines.
 * Detects patterns: recurring failures, performance degradation, output drift.
 * Appends learnings to workflow markdown in structured format.
 */

import type { ExecutionState, NodeResult } from '../types';

// ============================================================================
// Types
// ============================================================================

/** Metrics collected from a single execution run. */
export interface ExecutionMetrics {
  runId: string;
  timestamp: number;
  duration: number;
  status: 'completed' | 'failed';
  nodeCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  successRate: number;
  avgNodeDuration: number;
  maxNodeDuration: number;
  /** Node IDs that failed */
  failedNodes: string[];
  /** Error messages from failed nodes */
  errorMessages: string[];
}

/** A detected pattern from comparing metrics history. */
export interface DetectedPattern {
  type: 'recurring_failure' | 'performance_degradation' | 'success_rate_drop' | 'recovery';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  /** Supporting data for the pattern */
  evidence: Record<string, unknown>;
}

/** Structured learning from a run. */
export interface Learning {
  timestamp: number;
  runId: string;
  patterns: DetectedPattern[];
  summary: string;
}

// ============================================================================
// Metrics Collection
// ============================================================================

/**
 * Collect execution metrics from final state.
 */
export function collectMetrics(state: ExecutionState): ExecutionMetrics {
  const endTime = state.completedAt ?? Date.now();
  const duration = endTime - state.startedAt;

  const results = Array.from(state.nodeResults.values());
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  const nodeCount = results.length;

  const durations = results.map(r => r.duration);
  const avgNodeDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const maxNodeDuration = durations.length > 0 ? Math.max(...durations) : 0;

  const failedNodes: string[] = [];
  const errorMessages: string[] = [];
  for (const [nodeId, result] of state.nodeResults.entries()) {
    if (result.status === 'failed') {
      failedNodes.push(nodeId);
      if (result.error) {
        errorMessages.push(result.error.message);
      }
    }
  }

  return {
    runId: state.runId,
    timestamp: state.startedAt,
    duration,
    status: state.status === 'completed' ? 'completed' : 'failed',
    nodeCount,
    successCount,
    failedCount,
    skippedCount,
    successRate: nodeCount > 0 ? successCount / nodeCount : 0,
    avgNodeDuration,
    maxNodeDuration,
    failedNodes,
    errorMessages,
  };
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Detect patterns by comparing current metrics to history.
 */
export function detectPatterns(
  current: ExecutionMetrics,
  history: ExecutionMetrics[]
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  if (history.length === 0) return patterns;

  // 1. Recurring failures — same node fails across multiple runs
  detectRecurringFailures(current, history, patterns);

  // 2. Performance degradation — duration trending upward
  detectPerformanceDegradation(current, history, patterns);

  // 3. Success rate drop — current run significantly worse
  detectSuccessRateDrop(current, history, patterns);

  // 4. Recovery — was failing, now succeeding
  detectRecovery(current, history, patterns);

  return patterns;
}

function detectRecurringFailures(
  current: ExecutionMetrics,
  history: ExecutionMetrics[],
  patterns: DetectedPattern[]
): void {
  if (current.failedNodes.length === 0) return;

  // Count how often each node has failed in history
  const failureCounts = new Map<string, number>();
  for (const past of history) {
    for (const nodeId of past.failedNodes) {
      failureCounts.set(nodeId, (failureCounts.get(nodeId) ?? 0) + 1);
    }
  }

  for (const nodeId of current.failedNodes) {
    const pastFailures = failureCounts.get(nodeId) ?? 0;
    if (pastFailures >= 2) {
      patterns.push({
        type: 'recurring_failure',
        severity: pastFailures >= 4 ? 'critical' : 'warning',
        message: `Node "${nodeId}" has failed in ${pastFailures + 1} of the last ${history.length + 1} runs`,
        evidence: { nodeId, totalFailures: pastFailures + 1, totalRuns: history.length + 1 },
      });
    }
  }
}

function detectPerformanceDegradation(
  current: ExecutionMetrics,
  history: ExecutionMetrics[],
  patterns: DetectedPattern[]
): void {
  // Compare to average of last N successful runs
  const successfulHistory = history.filter(m => m.status === 'completed');
  if (successfulHistory.length < 2) return;

  const avgDuration = successfulHistory.reduce((sum, m) => sum + m.duration, 0) / successfulHistory.length;

  // If current is >50% slower than average, flag it
  if (current.duration > avgDuration * 1.5) {
    const degradationPct = Math.round(((current.duration - avgDuration) / avgDuration) * 100);
    patterns.push({
      type: 'performance_degradation',
      severity: degradationPct > 100 ? 'critical' : 'warning',
      message: `Execution ${degradationPct}% slower than average (${current.duration}ms vs ${Math.round(avgDuration)}ms avg)`,
      evidence: { currentDuration: current.duration, avgDuration: Math.round(avgDuration), degradationPct },
    });
  }
}

function detectSuccessRateDrop(
  current: ExecutionMetrics,
  history: ExecutionMetrics[],
  patterns: DetectedPattern[]
): void {
  const recentHistory = history.slice(-5); // Last 5 runs
  if (recentHistory.length < 2) return;

  const avgSuccessRate = recentHistory.reduce((sum, m) => sum + m.successRate, 0) / recentHistory.length;

  // If current success rate is significantly lower
  if (current.successRate < avgSuccessRate - 0.2) {
    patterns.push({
      type: 'success_rate_drop',
      severity: current.successRate < 0.5 ? 'critical' : 'warning',
      message: `Success rate dropped to ${Math.round(current.successRate * 100)}% (avg ${Math.round(avgSuccessRate * 100)}%)`,
      evidence: { currentRate: current.successRate, avgRate: avgSuccessRate },
    });
  }
}

function detectRecovery(
  current: ExecutionMetrics,
  history: ExecutionMetrics[],
  patterns: DetectedPattern[]
): void {
  if (current.status !== 'completed') return;

  // Check if last N runs were failures
  const recentHistory = history.slice(-3);
  const recentFailures = recentHistory.filter(m => m.status === 'failed').length;

  if (recentFailures >= 2) {
    patterns.push({
      type: 'recovery',
      severity: 'info',
      message: `Workflow recovered after ${recentFailures} consecutive failures`,
      evidence: { consecutiveFailures: recentFailures },
    });
  }
}

// ============================================================================
// Learnings Formatting
// ============================================================================

/**
 * Generate a structured learning from detected patterns.
 */
export function generateLearning(
  metrics: ExecutionMetrics,
  patterns: DetectedPattern[]
): Learning {
  const summaryParts: string[] = [];

  if (patterns.length === 0) {
    summaryParts.push(`Run ${metrics.runId}: ${metrics.status}, ${metrics.successRate * 100}% success rate`);
  } else {
    for (const pattern of patterns) {
      summaryParts.push(pattern.message);
    }
  }

  return {
    timestamp: metrics.timestamp,
    runId: metrics.runId,
    patterns,
    summary: summaryParts.join('; '),
  };
}

/**
 * Format learnings as a markdown section for appending to workflow file.
 */
export function formatLearnings(learnings: Learning[]): string {
  if (learnings.length === 0) return '';

  const lines: string[] = [];
  lines.push('### Learnings');
  lines.push('');

  for (const learning of learnings) {
    const date = new Date(learning.timestamp).toISOString().split('T')[0];
    const icons: Record<DetectedPattern['severity'], string> = {
      info: 'i',
      warning: '!',
      critical: '!!',
    };

    if (learning.patterns.length === 0) {
      lines.push(`- [${date}] ${learning.summary}`);
    } else {
      for (const pattern of learning.patterns) {
        lines.push(`- [${date}] (${icons[pattern.severity]}) ${pattern.message}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// History Persistence
// ============================================================================

/** Metrics history file stored alongside workflow. */
const METRICS_SUFFIX = '.metrics.json';

/**
 * Load execution metrics history for a workflow.
 */
export async function loadMetricsHistory(workflowPath: string): Promise<ExecutionMetrics[]> {
  const historyPath = workflowPath + METRICS_SUFFIX;
  const file = Bun.file(historyPath);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const data = await file.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Save execution metrics to history, keeping the last N entries.
 */
export async function saveMetricsHistory(
  workflowPath: string,
  metrics: ExecutionMetrics,
  maxEntries: number = 50
): Promise<void> {
  const history = await loadMetricsHistory(workflowPath);
  history.push(metrics);

  // Keep only last N entries
  const trimmed = history.slice(-maxEntries);
  const historyPath = workflowPath + METRICS_SUFFIX;
  await Bun.write(historyPath, JSON.stringify(trimmed, null, 2));
}
