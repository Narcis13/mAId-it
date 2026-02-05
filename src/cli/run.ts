/**
 * CLI Run Command
 *
 * Implements the `flowscript run <file>` command.
 * Executes .flow.md workflows with progress display and full option support.
 */

import ora from 'ora';
import chalk from 'chalk';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { buildExecutionPlan } from '../scheduler';
import type { ExecutionPlan, ExecutionWave } from '../scheduler/types';
import { createExecutionState, execute } from '../execution';
import type { ExecutionState } from '../execution/types';
import {
  formatValidationResult,
  formatParseErrors,
  formatFileNotFound,
  type FormatOptions,
} from './format';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the run command.
 */
export interface RunOptions {
  /** Show execution plan without running */
  dryRun?: boolean;
  /** Array of 'key=value' config overrides */
  config?: string[];
  /** JSON string of workflow input */
  input?: string;
  /** Output format ('text' | 'json') */
  format?: 'text' | 'json';
  /** Disable colored output */
  noColor?: boolean;
}

/**
 * Result of workflow execution.
 */
export interface RunResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Formatted output string */
  output: string;
  /** Execution duration in milliseconds */
  executionTime?: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Run a .flow.md workflow.
 *
 * @param filePath - Path to the workflow file
 * @param options - Run options
 * @returns RunResult with status and formatted output
 */
export async function runWorkflow(
  filePath: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const startTime = Date.now();
  const formatOpts: FormatOptions = {
    color: !options.noColor,
    format: options.format || 'text',
  };
  const c = formatOpts.color ? chalk : new chalk.Instance({ level: 0 });

  // Check if file exists
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    return {
      success: false,
      output: formatFileNotFound(filePath, formatOpts),
    };
  }

  // Read source for error formatting
  const source = await file.text();

  // Parse the file
  const parseResult = await parseFile(filePath);

  if (!parseResult.success) {
    return {
      success: false,
      output: formatParseErrors(parseResult.errors, source, filePath, formatOpts),
    };
  }

  // Validate the AST
  const validationResult = validate(parseResult.data);

  if (!validationResult.valid) {
    return {
      success: false,
      output: formatValidationResult(validationResult, source, filePath, formatOpts),
    };
  }

  // Build execution plan
  const executionPlan = buildExecutionPlan(parseResult.data);

  // Handle dry-run mode
  if (options.dryRun) {
    const output = formatExecutionPlan(executionPlan, formatOpts.color ?? true, options);
    return {
      success: true,
      output,
    };
  }

  // Parse config overrides
  let configOverrides: Record<string, unknown> = {};
  try {
    configOverrides = parseConfigOverrides(options.config || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `${c.red.bold('error')}: Invalid config format: ${message}\n`,
    };
  }

  // Parse input JSON
  let inputData: unknown = undefined;
  if (options.input) {
    try {
      inputData = JSON.parse(options.input);
    } catch (error) {
      return {
        success: false,
        output: `${c.red.bold('error')}: Invalid JSON input: ${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }

  // Merge workflow config with overrides
  const mergedConfig = {
    ...(parseResult.data.metadata.config || {}),
    ...configOverrides,
  };

  // Create execution state
  const state = createExecutionState({
    workflowId: parseResult.data.metadata.name,
    config: mergedConfig,
    secrets: parseResult.data.metadata.secrets || {},
    globalContext: inputData !== undefined ? { input: inputData } : {},
  });

  // Execute with progress display
  const totalWaves = executionPlan.waves.length;
  const spinner = options.noColor
    ? null
    : ora({
        text: 'Preparing execution...',
        color: 'cyan',
      }).start();

  try {
    // Update spinner text with wave count
    if (spinner) {
      spinner.text = `Executing ${totalWaves} wave${totalWaves === 1 ? '' : 's'}...`;
    }

    // Execute the workflow
    // Note: execute() processes waves sequentially internally
    await execute(executionPlan, state);

    const duration = Date.now() - startTime;

    // Success
    if (spinner) {
      spinner.succeed(`Completed ${totalWaves} wave${totalWaves === 1 ? '' : 's'} in ${duration}ms`);
    }

    const output = formatExecutionResult(state, formatOpts.color ?? true, duration);
    return {
      success: true,
      output,
      executionTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (spinner) {
      spinner.fail(`Execution failed after ${duration}ms`);
    }

    const output = formatExecutionError(error as Error, state, formatOpts.color ?? true);
    return {
      success: false,
      output,
      executionTime: duration,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse config overrides from key=value strings.
 *
 * @param overrides - Array of 'key=value' strings
 * @returns Record of config values
 * @throws Error if format is invalid
 */
export function parseConfigOverrides(overrides: string[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const override of overrides) {
    const eqIndex = override.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Missing '=' in config override: ${override}`);
    }

    const key = override.slice(0, eqIndex).trim();
    const value = override.slice(eqIndex + 1);

    if (!key) {
      throw new Error(`Empty key in config override: ${override}`);
    }

    // Try to parse as JSON, fallback to string
    try {
      config[key] = JSON.parse(value);
    } catch {
      // Not valid JSON, use as string
      config[key] = value;
    }
  }

  return config;
}

/**
 * Format execution plan for dry-run output.
 *
 * @param plan - The execution plan
 * @param color - Whether to use colors
 * @param options - Run options for displaying config/input
 * @returns Formatted plan string
 */
export function formatExecutionPlan(
  plan: ExecutionPlan,
  color: boolean,
  options: RunOptions = {}
): string {
  const c = color ? chalk : new chalk.Instance({ level: 0 });
  let output = '';

  output += c.cyan.bold('Execution Plan') + '\n';
  output += c.gray('─'.repeat(40)) + '\n\n';

  output += `${c.bold('Workflow:')} ${plan.workflowId}\n`;
  output += `${c.bold('Total nodes:')} ${plan.totalNodes}\n`;
  output += `${c.bold('Waves:')} ${plan.waves.length}\n\n`;

  // Show config overrides if any
  if (options.config && options.config.length > 0) {
    output += c.bold('Config overrides:') + '\n';
    for (const override of options.config) {
      output += `  ${c.yellow(override)}\n`;
    }
    output += '\n';
  }

  // Show input if provided
  if (options.input) {
    output += c.bold('Input:') + '\n';
    output += `  ${c.green(options.input)}\n\n`;
  }

  // Show wave breakdown
  output += c.bold('Wave breakdown:') + '\n';
  for (const wave of plan.waves) {
    output += formatWave(wave, plan, c);
  }

  output += '\n' + c.gray('Use without --dry-run to execute.') + '\n';

  return output;
}

/**
 * Format a single wave for display.
 */
function formatWave(
  wave: ExecutionWave,
  plan: ExecutionPlan,
  c: chalk.Chalk
): string {
  let output = '';
  output += `\n  ${c.cyan(`Wave ${wave.waveNumber}`)} (${wave.nodeIds.length} node${wave.nodeIds.length === 1 ? '' : 's'}):\n`;

  for (const nodeId of wave.nodeIds) {
    const node = plan.nodes.get(nodeId);
    if (node) {
      const nodeType = getNodeTypeDisplay(node);
      output += `    ${c.gray('•')} ${c.bold(nodeId)} ${c.dim(`(${nodeType})`)}\n`;
    }
  }

  return output;
}

/**
 * Get display string for node type.
 */
function getNodeTypeDisplay(node: { type: string; [key: string]: unknown }): string {
  switch (node.type) {
    case 'source':
      return `source:${(node as { sourceType: string }).sourceType}`;
    case 'sink':
      return `sink:${(node as { sinkType: string }).sinkType}`;
    case 'transform':
      return `transform:${(node as { transformType: string }).transformType}`;
    default:
      return node.type;
  }
}

/**
 * Format successful execution result.
 *
 * @param state - Final execution state
 * @param color - Whether to use colors
 * @param duration - Execution duration in ms
 * @returns Formatted result string
 */
export function formatExecutionResult(
  state: ExecutionState,
  color: boolean,
  duration: number
): string {
  const c = color ? chalk : new chalk.Instance({ level: 0 });
  let output = '';

  output += '\n' + c.green.bold('Execution completed successfully') + '\n';
  output += c.gray('─'.repeat(40)) + '\n\n';

  output += `${c.bold('Workflow:')} ${state.workflowId}\n`;
  output += `${c.bold('Run ID:')} ${state.runId}\n`;
  output += `${c.bold('Duration:')} ${duration}ms\n`;
  output += `${c.bold('Nodes executed:')} ${state.nodeResults.size}\n`;

  // Show node results summary
  const successful = Array.from(state.nodeResults.values()).filter(r => r.status === 'success').length;
  const failed = Array.from(state.nodeResults.values()).filter(r => r.status === 'failed').length;
  const skipped = Array.from(state.nodeResults.values()).filter(r => r.status === 'skipped').length;

  if (failed > 0 || skipped > 0) {
    output += `${c.bold('Results:')} ${c.green(`${successful} passed`)}`;
    if (failed > 0) output += `, ${c.red(`${failed} failed`)}`;
    if (skipped > 0) output += `, ${c.yellow(`${skipped} skipped`)}`;
    output += '\n';
  }

  // Show final outputs (last node outputs)
  const lastResults = Array.from(state.nodeResults.entries())
    .filter(([, result]) => result.status === 'success' && result.output !== undefined)
    .slice(-3); // Show last 3

  if (lastResults.length > 0) {
    output += '\n' + c.bold('Final outputs:') + '\n';
    for (const [nodeId, result] of lastResults) {
      const outputStr = formatOutputPreview(result.output);
      output += `  ${c.cyan(nodeId)}: ${outputStr}\n`;
    }
  }

  return output;
}

/**
 * Format output preview (truncated).
 */
function formatOutputPreview(output: unknown): string {
  const str = typeof output === 'string'
    ? output
    : JSON.stringify(output);

  const maxLen = 60;
  if (str.length > maxLen) {
    return str.slice(0, maxLen) + '...';
  }
  return str;
}

/**
 * Format execution error.
 *
 * @param error - The error that occurred
 * @param state - Execution state at time of failure
 * @param color - Whether to use colors
 * @returns Formatted error string
 */
export function formatExecutionError(
  error: Error,
  state: ExecutionState,
  color: boolean
): string {
  const c = color ? chalk : new chalk.Instance({ level: 0 });
  let output = '';

  output += '\n' + c.red.bold('Execution failed') + '\n';
  output += c.gray('─'.repeat(40)) + '\n\n';

  output += `${c.bold('Workflow:')} ${state.workflowId}\n`;
  output += `${c.bold('Run ID:')} ${state.runId}\n`;
  output += `${c.bold('Failed at wave:')} ${state.currentWave}\n`;
  output += `${c.bold('Nodes completed:')} ${state.nodeResults.size}\n\n`;

  output += c.red.bold('Error:') + '\n';
  output += `  ${error.message}\n`;

  // Show stack trace if available (truncated)
  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(1, 4);
    if (stackLines.length > 0) {
      output += '\n' + c.dim('Stack trace:') + '\n';
      for (const line of stackLines) {
        output += c.dim(`  ${line.trim()}`) + '\n';
      }
    }
  }

  // Show failed nodes
  const failedNodes = Array.from(state.nodeResults.entries())
    .filter(([, result]) => result.status === 'failed');

  if (failedNodes.length > 0) {
    output += '\n' + c.bold('Failed nodes:') + '\n';
    for (const [nodeId, result] of failedNodes) {
      output += `  ${c.red('•')} ${nodeId}: ${result.error?.message || 'Unknown error'}\n`;
    }
  }

  return output;
}
