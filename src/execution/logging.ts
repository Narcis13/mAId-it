/**
 * Execution Logging for FlowScript
 *
 * Provides formatted markdown logs for workflow execution.
 * Logs include run metadata, timing information, and per-node results.
 */

import type { ExecutionState, NodeResult } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Entry for execution log.
 */
export interface ExecutionLogEntry {
  runId: string;
  workflowId: string;
  timestamp: number; // startedAt
  duration: number; // ms
  status: 'completed' | 'failed';
  waveCount: number;
  nodeResults: Map<string, NodeResult>;
}

// ============================================================================
// Log Formatting
// ============================================================================

/** Maximum length for output preview in table */
const MAX_OUTPUT_LENGTH = 50;

/**
 * Format execution state as markdown log entry.
 *
 * @param state - Final execution state
 * @returns Markdown-formatted log string
 *
 * @example
 * ```typescript
 * const log = formatExecutionLog(state);
 * // Returns:
 * // ---
 * //
 * // ## Execution Log
 * //
 * // **Run ID:** `run-123`
 * // ...
 * ```
 */
export function formatExecutionLog(state: ExecutionState): string {
  const lines: string[] = [];

  // Section separator
  lines.push('---');
  lines.push('');

  // Header
  lines.push('## Execution Log');
  lines.push('');

  // Metadata
  lines.push(`**Run ID:** \`${state.runId}\``);
  lines.push(`**Workflow:** ${state.workflowId}`);
  lines.push(`**Timestamp:** ${new Date(state.startedAt).toISOString()}`);

  // Duration in seconds
  const endTime = state.completedAt ?? Date.now();
  const durationSec = ((endTime - state.startedAt) / 1000).toFixed(2);
  lines.push(`**Duration:** ${durationSec}s`);

  // Status
  const statusLabel = state.status === 'completed' ? 'completed' : 'failed';
  lines.push(`**Status:** ${statusLabel}`);

  // Wave count
  lines.push(`**Waves:** ${state.currentWave + 1}`);
  lines.push('');

  // Node results table
  lines.push('### Node Results');
  lines.push('');
  lines.push('| Node | Status | Duration | Output |');
  lines.push('|------|--------|----------|--------|');

  // Sort nodes by startedAt for execution order
  const sortedNodes = Array.from(state.nodeResults.entries()).sort(
    ([, a], [, b]) => a.startedAt - b.startedAt
  );

  for (const [nodeId, result] of sortedNodes) {
    const status = result.status;
    const duration = (result.duration / 1000).toFixed(2) + 's';
    const output = formatOutput(result);

    lines.push(`| ${nodeId} | ${status} | ${duration} | ${output} |`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format node output for table display.
 * Truncates to MAX_OUTPUT_LENGTH and escapes pipe characters.
 */
function formatOutput(result: NodeResult): string {
  if (result.status === 'failed' && result.error) {
    const errorMsg = `Error: ${result.error.message}`;
    return truncateAndEscape(errorMsg);
  }

  if (result.output === undefined) {
    return '-';
  }

  let outputStr: string;
  try {
    outputStr = JSON.stringify(result.output);
  } catch {
    outputStr = String(result.output);
  }

  return truncateAndEscape(outputStr);
}

/**
 * Truncate string and escape pipe characters for markdown tables.
 */
function truncateAndEscape(str: string): string {
  // Escape pipe characters
  let escaped = str.replace(/\|/g, '\\|');

  // Truncate if needed
  if (escaped.length > MAX_OUTPUT_LENGTH) {
    escaped = escaped.substring(0, MAX_OUTPUT_LENGTH - 3) + '...';
  }

  return escaped;
}

// ============================================================================
// Log File Operations
// ============================================================================

/** Marker for execution log section */
const LOG_SECTION_MARKER = '## Execution Log';

/**
 * Append execution log to workflow markdown file.
 *
 * If a log section exists (starts with "## Execution Log"), replaces it.
 * Otherwise appends new log section.
 *
 * @param workflowPath - Path to workflow .flow.md file
 * @param state - Final execution state
 *
 * @example
 * ```typescript
 * await appendExecutionLog('workflow.flow.md', finalState);
 * // Adds or updates execution log at end of file
 * ```
 */
export async function appendExecutionLog(
  workflowPath: string,
  state: ExecutionState
): Promise<void> {
  const file = Bun.file(workflowPath);

  // Read existing content
  let content = '';
  if (await file.exists()) {
    content = await file.text();
  }

  // Format the log entry
  const logEntry = formatExecutionLog(state);

  // Check if log section already exists
  const markerIndex = content.indexOf(LOG_SECTION_MARKER);

  let updated: string;
  if (markerIndex !== -1) {
    // Find the separator before the log section (---\n\n## Execution Log)
    // Look backwards from marker for "---"
    const separatorPattern = /---\s*\n+$/;
    const beforeMarker = content.substring(0, markerIndex);
    const separatorMatch = beforeMarker.match(separatorPattern);

    if (separatorMatch) {
      // Replace from separator to end
      const cutPoint = markerIndex - separatorMatch[0].length;
      updated = content.substring(0, cutPoint) + logEntry;
    } else {
      // Replace from marker to end (no separator found)
      updated = content.substring(0, markerIndex) + logEntry;
    }
  } else {
    // Append new log section
    // Ensure there's a newline before adding
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    updated = content + '\n' + logEntry;
  }

  await Bun.write(workflowPath, updated);
}
