/**
 * Delay Runtime for FlowScript
 *
 * Pauses execution for a specified duration.
 * Input data flows through unchanged.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { DelayNode } from '../../types/ast.ts';
import { parseDuration } from './duration.ts';

/**
 * Configuration for delay nodes.
 */
export interface DelayConfig {
  duration?: string;
}

/**
 * Delay Runtime - pauses execution then passes input through.
 *
 * @example
 * ```xml
 * <delay id="wait" duration="5s"/>
 * ```
 */
class DelayRuntime implements NodeRuntime<DelayConfig, unknown, unknown> {
  readonly type = 'temporal:delay';

  async execute(params: ExecutionParams<DelayConfig, unknown>): Promise<unknown> {
    const { node, input, config } = params;
    const delayNode = node as unknown as DelayNode;

    // Get duration from AST node first, then config
    const durationStr = delayNode.duration ?? config.duration;
    if (!durationStr) {
      throw new Error('Delay node requires a duration attribute');
    }

    const ms = parseDuration(durationStr);

    // Check abort signal before sleeping
    if (params.signal?.aborted) {
      throw new Error('Delay aborted');
    }

    // Sleep for the duration, respecting abort signal
    await Bun.sleep(ms);

    // Pass input through unchanged
    return input;
  }
}

export const delayRuntime = new DelayRuntime();
