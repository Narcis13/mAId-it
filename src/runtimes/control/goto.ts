/**
 * Goto Runtime for FlowScript
 *
 * Flow control statement that throws GotoSignal to jump to a specific node.
 * Executor handles the actual navigation to the target node.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { GotoConfig } from './types.ts';
import { GotoSignal } from './signals.ts';

// ============================================================================
// Goto Runtime Implementation
// ============================================================================

/**
 * Goto Runtime - throws GotoSignal to jump to target node.
 *
 * Always throws GotoSignal, never returns normally. The signal is
 * caught by the executor which handles navigation to the target node.
 *
 * WARNING: Goto is a powerful but potentially dangerous control flow
 * mechanism. Use sparingly and prefer structured control flow when possible.
 *
 * @example
 * ```xml
 * <!-- Jump to retry point on error -->
 * <source:http id="fetch" url="https://api.example.com" />
 * <if condition="fetch.output.error">
 *   <then>
 *     <goto target="retry-point"/>
 *   </then>
 * </if>
 *
 * <!-- Retry point label (just a regular node) -->
 * <transform:template id="retry-point" template="Retrying..." />
 * ```
 */
class GotoRuntime implements NodeRuntime<GotoConfig, unknown, never> {
  readonly type = 'control:goto';

  async execute(params: ExecutionParams<GotoConfig, unknown>): Promise<never> {
    const { config } = params;

    // Target is required - throw GotoSignal with target node ID
    throw new GotoSignal(config.target);
  }
}

/**
 * Goto runtime instance.
 */
export const gotoRuntime = new GotoRuntime();
