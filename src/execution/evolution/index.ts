/**
 * Evolution Module
 *
 * Self-improvement system for FlowScript workflows.
 * Tracks execution metrics, detects patterns, profiles behavior drift,
 * and generates feedback with improvement suggestions.
 */

export {
  collectMetrics,
  detectPatterns,
  generateLearning,
  formatLearnings,
  loadMetricsHistory,
  saveMetricsHistory,
} from './tracker';
export type { ExecutionMetrics, DetectedPattern, Learning } from './tracker';

export {
  profileOutputs,
  compareBehavior,
  suggestVersionBump,
  loadBaseline,
  saveBaseline,
} from './behavior';
export type { BehaviorProfile, DriftResult, DriftSignal, OutputProfile } from './behavior';

export {
  processExecutionFeedback,
  loadFeedbackHistory,
  saveFeedbackHistory,
  buildEvolutionSummary,
  formatFeedback,
} from './feedback';
export type { FeedbackEntry, EvolutionSummary } from './feedback';
