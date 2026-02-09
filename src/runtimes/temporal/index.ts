/**
 * Temporal Runtimes Module for FlowScript
 *
 * Provides runtime implementations for time-based workflow controls:
 * - Delay: Pause execution for a specified duration
 * - Timeout: Wrap child nodes with a time limit
 */

import { delayRuntime } from './delay.ts';
import { timeoutRuntime } from './timeout.ts';
import { runtimeRegistry } from '../registry.ts';

// ============================================================================
// Auto-Registration
// ============================================================================

runtimeRegistry.register(delayRuntime);
runtimeRegistry.register(timeoutRuntime);

// ============================================================================
// Exports
// ============================================================================

export { delayRuntime, type DelayConfig } from './delay.ts';
export { timeoutRuntime, type TimeoutConfig, type TimeoutResult } from './timeout.ts';
export { parseDuration } from './duration.ts';
