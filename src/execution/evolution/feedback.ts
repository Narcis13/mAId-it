/**
 * Feedback Loop Mechanism
 *
 * Wires: Run complete → Collect metrics → Compare to baseline → Suggest improvements.
 * Stores feedback history for trend analysis.
 * Optional: AI-powered prompt improvement suggestions.
 */

import type { ExecutionState } from '../types';
import type { EvolutionConfig } from '../../types/ast';
import {
  collectMetrics,
  detectPatterns,
  generateLearning,
  loadMetricsHistory,
  saveMetricsHistory,
  formatLearnings,
  type ExecutionMetrics,
  type Learning,
  type DetectedPattern,
} from './tracker';
import {
  profileOutputs,
  compareBehavior,
  loadBaseline,
  saveBaseline,
  suggestVersionBump,
  type BehaviorProfile,
  type DriftResult,
} from './behavior';

// ============================================================================
// Types
// ============================================================================

/** Complete feedback entry from a single execution. */
export interface FeedbackEntry {
  timestamp: number;
  runId: string;
  metrics: ExecutionMetrics;
  learning: Learning;
  drift: DriftResult | null;
  suggestions: string[];
  suggestedVersion: string | undefined;
}

/** Summary of evolution state for a workflow. */
export interface EvolutionSummary {
  currentGeneration: number;
  totalRuns: number;
  avgSuccessRate: number;
  avgDuration: number;
  recentLearnings: string[];
  behaviorVersion: string | undefined;
}

// ============================================================================
// Main Feedback Loop
// ============================================================================

/**
 * Process execution feedback after a workflow run completes.
 * This is the main entry point for the evolution system.
 *
 * @param state - Final execution state
 * @param workflowPath - Path to the workflow file
 * @param currentVersion - Current workflow version string
 * @param evolution - Current evolution config from frontmatter (if any)
 * @returns FeedbackEntry with all collected insights
 */
export async function processExecutionFeedback(
  state: ExecutionState,
  workflowPath: string,
  currentVersion: string,
  evolution?: EvolutionConfig
): Promise<FeedbackEntry> {
  // 1. Collect metrics from this run
  const metrics = collectMetrics(state);

  // 2. Load history and detect patterns
  const history = await loadMetricsHistory(workflowPath);
  const patterns = detectPatterns(metrics, history);
  const learning = generateLearning(metrics, patterns);

  // 3. Save metrics to history
  await saveMetricsHistory(workflowPath, metrics);

  // 4. Behavior comparison
  let drift: DriftResult | null = null;
  const profile = profileOutputs(state);
  const baseline = await loadBaseline(workflowPath);

  if (baseline) {
    drift = compareBehavior(profile, baseline);
  } else {
    // First run — establish baseline
    await saveBaseline(workflowPath, profile);
  }

  // 5. Generate improvement suggestions
  const suggestions = generateSuggestions(metrics, patterns, drift);

  // 6. Suggest version bump if behavior drifted
  const suggestedVersion = drift?.drifted
    ? suggestVersionBump(currentVersion, drift)
    : undefined;

  return {
    timestamp: Date.now(),
    runId: state.runId,
    metrics,
    learning,
    drift,
    suggestions,
    suggestedVersion,
  };
}

// ============================================================================
// Suggestion Generation
// ============================================================================

/**
 * Generate actionable improvement suggestions based on run data.
 */
function generateSuggestions(
  metrics: ExecutionMetrics,
  patterns: DetectedPattern[],
  drift: DriftResult | null
): string[] {
  const suggestions: string[] = [];

  // Suggestion based on recurring failures
  const recurringFailures = patterns.filter(p => p.type === 'recurring_failure');
  for (const pattern of recurringFailures) {
    const nodeId = pattern.evidence.nodeId as string;
    suggestions.push(`Consider adding retry/fallback to node "${nodeId}" — it fails frequently`);
  }

  // Suggestion based on performance
  const perfPatterns = patterns.filter(p => p.type === 'performance_degradation');
  if (perfPatterns.length > 0) {
    suggestions.push('Execution is slowing down — consider caching intermediate results or optimizing slow nodes');
  }

  // Suggestion based on low success rate
  if (metrics.successRate < 0.8 && metrics.nodeCount > 1) {
    suggestions.push(`Only ${Math.round(metrics.successRate * 100)}% of nodes succeeded — review error handling`);
  }

  // Suggestion based on drift
  if (drift?.drifted) {
    const typeChanges = drift.signals.filter(s => s.type === 'type_change');
    if (typeChanges.length > 0) {
      suggestions.push('Output types have changed — update downstream consumers or establish a new baseline');
    }

    const lengthShifts = drift.signals.filter(s => s.type === 'length_shift');
    if (lengthShifts.length > 0) {
      suggestions.push('Output sizes have shifted significantly — check for data source changes');
    }
  }

  // Suggestion for bottleneck nodes
  if (metrics.maxNodeDuration > metrics.avgNodeDuration * 3 && metrics.avgNodeDuration > 0) {
    suggestions.push('One node is significantly slower than others — consider parallelizing or optimizing it');
  }

  return suggestions;
}

// ============================================================================
// Feedback History
// ============================================================================

const FEEDBACK_SUFFIX = '.feedback.json';

/**
 * Load feedback history for a workflow.
 */
export async function loadFeedbackHistory(workflowPath: string): Promise<FeedbackEntry[]> {
  const feedbackPath = workflowPath + FEEDBACK_SUFFIX;
  const file = Bun.file(feedbackPath);

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
 * Append feedback entry to history, keeping the last N entries.
 */
export async function saveFeedbackHistory(
  workflowPath: string,
  entry: FeedbackEntry,
  maxEntries: number = 50
): Promise<void> {
  const history = await loadFeedbackHistory(workflowPath);
  history.push(entry);

  const trimmed = history.slice(-maxEntries);
  const feedbackPath = workflowPath + FEEDBACK_SUFFIX;
  await Bun.write(feedbackPath, JSON.stringify(trimmed, null, 2));
}

// ============================================================================
// Evolution Summary
// ============================================================================

/**
 * Build an evolution summary from feedback history.
 * Useful for CLI display and frontmatter updates.
 */
export async function buildEvolutionSummary(
  workflowPath: string,
  currentVersion: string,
  evolution?: EvolutionConfig
): Promise<EvolutionSummary> {
  const history = await loadMetricsHistory(workflowPath);

  const totalRuns = history.length;
  const avgSuccessRate = totalRuns > 0
    ? history.reduce((sum, m) => sum + m.successRate, 0) / totalRuns
    : 0;
  const avgDuration = totalRuns > 0
    ? history.reduce((sum, m) => sum + m.duration, 0) / totalRuns
    : 0;

  // Collect recent learnings from feedback history
  const feedbackHistory = await loadFeedbackHistory(workflowPath);
  const recentLearnings = feedbackHistory
    .slice(-5)
    .filter(f => f.suggestions.length > 0)
    .flatMap(f => f.suggestions);

  return {
    currentGeneration: evolution?.generation ?? 0,
    totalRuns,
    avgSuccessRate,
    avgDuration,
    recentLearnings: recentLearnings.slice(-10), // cap at 10
    behaviorVersion: suggestVersionBump(currentVersion, { score: 0, drifted: false, signals: [] }) ?? undefined,
  };
}

// ============================================================================
// Markdown Formatting
// ============================================================================

/**
 * Format feedback entry as markdown for appending to execution log.
 */
export function formatFeedback(entry: FeedbackEntry): string {
  const lines: string[] = [];

  if (entry.learning.patterns.length > 0 || entry.suggestions.length > 0) {
    lines.push('### Evolution Feedback');
    lines.push('');

    if (entry.learning.patterns.length > 0) {
      lines.push('**Patterns detected:**');
      for (const pattern of entry.learning.patterns) {
        const icon = pattern.severity === 'critical' ? '!!' : pattern.severity === 'warning' ? '!' : 'i';
        lines.push(`- (${icon}) ${pattern.message}`);
      }
      lines.push('');
    }

    if (entry.drift?.drifted) {
      lines.push(`**Behavior drift:** score=${entry.drift.score.toFixed(2)}`);
      for (const signal of entry.drift.signals) {
        lines.push(`- ${signal.message}`);
      }
      lines.push('');
    }

    if (entry.suggestions.length > 0) {
      lines.push('**Suggestions:**');
      for (const suggestion of entry.suggestions) {
        lines.push(`- ${suggestion}`);
      }
      lines.push('');
    }

    if (entry.suggestedVersion) {
      lines.push(`**Suggested version bump:** ${entry.suggestedVersion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
