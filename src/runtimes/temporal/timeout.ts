/**
 * Timeout Runtime for FlowScript
 *
 * Wraps child node execution with a time limit.
 * Returns metadata for the executor to handle (like LoopResult pattern).
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { TimeoutNode, NodeAST } from '../../types/ast.ts';
import { parseDuration } from './duration.ts';

/**
 * Configuration for timeout nodes.
 */
export interface TimeoutConfig {
  duration?: string;
  onTimeout?: string;
}

/**
 * Result returned by timeout runtime with execution metadata.
 * The executor intercepts this and wraps child execution with AbortSignal.timeout().
 */
export interface TimeoutResult {
  /** Timeout duration in milliseconds */
  durationMs: number;
  /** Child nodes to execute under the timeout */
  children: NodeAST[];
  /** Optional fallback node ID on timeout */
  onTimeout?: string;
}

/**
 * Timeout Runtime - returns metadata for executor to handle.
 *
 * Does NOT execute children directly. Returns duration and children
 * for the executor to wrap with AbortSignal.timeout().
 *
 * @example
 * ```xml
 * <timeout id="safe-fetch" duration="30s" on-timeout="fallback">
 *   <source:http id="fetch" url="https://slow-api.example.com/data" />
 * </timeout>
 * ```
 */
class TimeoutRuntime implements NodeRuntime<TimeoutConfig, unknown, TimeoutResult> {
  readonly type = 'temporal:timeout';

  async execute(params: ExecutionParams<TimeoutConfig, unknown>): Promise<TimeoutResult> {
    const { node, config } = params;
    const timeoutNode = node as unknown as TimeoutNode;

    // Get duration from AST node first, then config
    const durationStr = timeoutNode.duration ?? config.duration;
    if (!durationStr) {
      throw new Error('Timeout node requires a duration attribute');
    }

    const durationMs = parseDuration(durationStr);

    // Get onTimeout from AST node first, then config
    const onTimeout = timeoutNode.onTimeout ?? config.onTimeout;

    return {
      durationMs,
      children: timeoutNode.children,
      onTimeout,
    };
  }
}

export const timeoutRuntime = new TimeoutRuntime();
