/**
 * Break Runtime for FlowScript
 *
 * Flow control statement that throws BreakSignal to exit enclosing loops.
 * Supports optional target loop ID for breaking specific outer loops.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { BreakConfig } from './types.ts';
import { BreakSignal } from './signals.ts';

// ============================================================================
// Break Runtime Implementation
// ============================================================================

/**
 * Break Runtime - throws BreakSignal to exit enclosing loop.
 *
 * Always throws BreakSignal, never returns normally. The signal is
 * caught by the enclosing loop (or specified target loop) in the executor.
 *
 * @example
 * ```xml
 * <!-- Break current loop -->
 * <loop id="retry" maxIterations="10">
 *   <source:http id="fetch" url="https://api.example.com" />
 *   <if condition="fetch.output.success">
 *     <then>
 *       <break/>
 *     </then>
 *   </if>
 * </loop>
 *
 * <!-- Break specific outer loop -->
 * <loop id="outer" maxIterations="5">
 *   <loop id="inner" maxIterations="10">
 *     <if condition="shouldStop">
 *       <then>
 *         <break loop="outer"/>
 *       </then>
 *     </if>
 *   </loop>
 * </loop>
 * ```
 */
class BreakRuntime implements NodeRuntime<BreakConfig, unknown, never> {
  readonly type = 'control:break';

  async execute(params: ExecutionParams<BreakConfig, unknown>): Promise<never> {
    const { config } = params;

    // Throw BreakSignal with optional target loop ID
    throw new BreakSignal(config.loop);
  }
}

/**
 * Break runtime instance.
 */
export const breakRuntime = new BreakRuntime();
