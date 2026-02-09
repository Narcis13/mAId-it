/**
 * Behavior Versioning
 *
 * Tracks output characteristics across executions: length, type distribution,
 * key patterns. Compares to a golden baseline and flags drift beyond thresholds.
 * Auto-bumps a behavior version suffix when drift is detected.
 */

import type { ExecutionState } from '../types';

// ============================================================================
// Types
// ============================================================================

/** Profile of a single output value. */
export interface OutputProfile {
  type: string;
  length?: number; // string length or array length
  keys?: string[]; // object keys
}

/** Aggregated behavior profile for a full execution run. */
export interface BehaviorProfile {
  timestamp: number;
  runId: string;
  /** Distribution of output types across nodes */
  typeDistribution: Record<string, number>;
  /** Average output length (for strings and arrays) */
  avgOutputLength: number;
  /** Total number of outputs captured */
  outputCount: number;
  /** Per-node output profiles */
  nodeProfiles: Record<string, OutputProfile>;
}

/** Result of comparing two behavior profiles. */
export interface DriftResult {
  /** Overall drift score from 0 (identical) to 1 (completely different) */
  score: number;
  /** Whether drift exceeds the threshold */
  drifted: boolean;
  /** Specific drift signals */
  signals: DriftSignal[];
}

/** Individual drift signal. */
export interface DriftSignal {
  type: 'type_change' | 'length_shift' | 'key_change' | 'missing_node' | 'new_node';
  nodeId?: string;
  message: string;
  magnitude: number; // 0-1
}

// ============================================================================
// Profiling
// ============================================================================

/**
 * Build a behavior profile from execution state outputs.
 */
export function profileOutputs(state: ExecutionState): BehaviorProfile {
  const typeDistribution: Record<string, number> = {};
  const nodeProfiles: Record<string, OutputProfile> = {};
  let totalLength = 0;
  let lengthCount = 0;

  for (const [nodeId, result] of state.nodeResults.entries()) {
    if (result.status !== 'success' || result.output === undefined) continue;

    const profile = profileValue(result.output);
    nodeProfiles[nodeId] = profile;

    // Track type distribution
    typeDistribution[profile.type] = (typeDistribution[profile.type] ?? 0) + 1;

    // Track lengths
    if (profile.length !== undefined) {
      totalLength += profile.length;
      lengthCount++;
    }
  }

  return {
    timestamp: state.startedAt,
    runId: state.runId,
    typeDistribution,
    avgOutputLength: lengthCount > 0 ? totalLength / lengthCount : 0,
    outputCount: Object.keys(nodeProfiles).length,
    nodeProfiles,
  };
}

/**
 * Profile a single value.
 */
function profileValue(value: unknown): OutputProfile {
  if (value === null || value === undefined) {
    return { type: 'null' };
  }

  if (typeof value === 'string') {
    return { type: 'string', length: value.length };
  }

  if (typeof value === 'number') {
    return { type: 'number' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }

  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }

  if (typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value as Record<string, unknown>).sort() };
  }

  return { type: typeof value };
}

// ============================================================================
// Drift Detection
// ============================================================================

/** Default drift threshold. */
const DEFAULT_DRIFT_THRESHOLD = 0.3;

/**
 * Compare current behavior profile to a baseline and detect drift.
 */
export function compareBehavior(
  current: BehaviorProfile,
  baseline: BehaviorProfile,
  threshold: number = DEFAULT_DRIFT_THRESHOLD
): DriftResult {
  const signals: DriftSignal[] = [];

  // 1. Check for type distribution changes
  detectTypeDistributionDrift(current, baseline, signals);

  // 2. Check per-node output changes
  detectNodeDrift(current, baseline, signals);

  // 3. Check average length shift
  detectLengthShift(current, baseline, signals);

  // Calculate overall score as weighted average of signal magnitudes
  const score = signals.length > 0
    ? Math.min(1, signals.reduce((sum, s) => sum + s.magnitude, 0) / Math.max(signals.length, 3))
    : 0;

  return {
    score,
    drifted: score > threshold,
    signals,
  };
}

function detectTypeDistributionDrift(
  current: BehaviorProfile,
  baseline: BehaviorProfile,
  signals: DriftSignal[]
): void {
  const allTypes = new Set([
    ...Object.keys(current.typeDistribution),
    ...Object.keys(baseline.typeDistribution),
  ]);

  for (const type of allTypes) {
    const currentPct = (current.typeDistribution[type] ?? 0) / Math.max(current.outputCount, 1);
    const baselinePct = (baseline.typeDistribution[type] ?? 0) / Math.max(baseline.outputCount, 1);
    const diff = Math.abs(currentPct - baselinePct);

    if (diff > 0.2) {
      signals.push({
        type: 'type_change',
        message: `Type "${type}" distribution shifted: ${Math.round(baselinePct * 100)}% → ${Math.round(currentPct * 100)}%`,
        magnitude: diff,
      });
    }
  }
}

function detectNodeDrift(
  current: BehaviorProfile,
  baseline: BehaviorProfile,
  signals: DriftSignal[]
): void {
  // Check for missing nodes
  for (const nodeId of Object.keys(baseline.nodeProfiles)) {
    if (!(nodeId in current.nodeProfiles)) {
      signals.push({
        type: 'missing_node',
        nodeId,
        message: `Node "${nodeId}" output missing (was present in baseline)`,
        magnitude: 0.5,
      });
    }
  }

  // Check for new nodes
  for (const nodeId of Object.keys(current.nodeProfiles)) {
    if (!(nodeId in baseline.nodeProfiles)) {
      signals.push({
        type: 'new_node',
        nodeId,
        message: `New node "${nodeId}" output (not in baseline)`,
        magnitude: 0.3,
      });
    }
  }

  // Check type/key changes for matching nodes
  for (const [nodeId, currentProfile] of Object.entries(current.nodeProfiles)) {
    const baselineProfile = baseline.nodeProfiles[nodeId];
    if (!baselineProfile) continue;

    // Type changed
    if (currentProfile.type !== baselineProfile.type) {
      signals.push({
        type: 'type_change',
        nodeId,
        message: `Node "${nodeId}" output type changed: ${baselineProfile.type} → ${currentProfile.type}`,
        magnitude: 0.8,
      });
      continue;
    }

    // Key change for objects
    if (currentProfile.keys && baselineProfile.keys) {
      const currentKeys = new Set(currentProfile.keys);
      const baselineKeys = new Set(baselineProfile.keys);
      const addedKeys = currentProfile.keys.filter(k => !baselineKeys.has(k));
      const removedKeys = baselineProfile.keys.filter(k => !currentKeys.has(k));

      if (addedKeys.length > 0 || removedKeys.length > 0) {
        signals.push({
          type: 'key_change',
          nodeId,
          message: `Node "${nodeId}" output keys changed: +[${addedKeys.join(',')}] -[${removedKeys.join(',')}]`,
          magnitude: Math.min(1, (addedKeys.length + removedKeys.length) / Math.max(baselineKeys.size, 1) * 0.5),
        });
      }
    }
  }
}

function detectLengthShift(
  current: BehaviorProfile,
  baseline: BehaviorProfile,
  signals: DriftSignal[]
): void {
  if (baseline.avgOutputLength === 0) return;

  const ratio = current.avgOutputLength / baseline.avgOutputLength;
  // Flag if length changed by more than 50%
  if (ratio < 0.5 || ratio > 1.5) {
    signals.push({
      type: 'length_shift',
      message: `Average output length shifted: ${Math.round(baseline.avgOutputLength)} → ${Math.round(current.avgOutputLength)}`,
      magnitude: Math.min(1, Math.abs(1 - ratio)),
    });
  }
}

// ============================================================================
// Version Bumping
// ============================================================================

/**
 * Suggest a behavior version bump based on drift results.
 * Returns a version suffix like "+b2" to append to the workflow version.
 */
export function suggestVersionBump(
  currentVersion: string,
  drift: DriftResult
): string | undefined {
  if (!drift.drifted) return undefined;

  // Extract existing behavior suffix if any (e.g., "1.0.0+b1" → "b1")
  const plusIndex = currentVersion.indexOf('+b');
  const currentBehavior = plusIndex !== -1
    ? parseInt(currentVersion.slice(plusIndex + 2), 10)
    : 0;

  const nextBehavior = (isNaN(currentBehavior) ? 0 : currentBehavior) + 1;
  const baseVersion = plusIndex !== -1 ? currentVersion.slice(0, plusIndex) : currentVersion;

  return `${baseVersion}+b${nextBehavior}`;
}

// ============================================================================
// Baseline Persistence
// ============================================================================

const BASELINE_SUFFIX = '.baseline.json';

/**
 * Load the golden baseline profile for a workflow.
 */
export async function loadBaseline(workflowPath: string): Promise<BehaviorProfile | null> {
  const baselinePath = workflowPath + BASELINE_SUFFIX;
  const file = Bun.file(baselinePath);

  if (!(await file.exists())) {
    return null;
  }

  try {
    return await file.json() as BehaviorProfile;
  } catch {
    return null;
  }
}

/**
 * Save the current behavior profile as the golden baseline.
 */
export async function saveBaseline(
  workflowPath: string,
  profile: BehaviorProfile
): Promise<void> {
  const baselinePath = workflowPath + BASELINE_SUFFIX;
  await Bun.write(baselinePath, JSON.stringify(profile, null, 2));
}
