/**
 * Control Flow Runtimes Module for FlowScript
 *
 * Provides runtime implementations for all control flow nodes:
 * - Branch: Pattern matching with multiple cases
 * - If: Simple conditional with then/else branches
 * - Loop: Fixed iteration with optional break condition
 * - While: Condition-based iteration with safety bounds
 * - Foreach: Collection iteration with item/index injection
 * - Parallel: Concurrent branch execution with state isolation
 * - Break: Exit enclosing loop (with optional target)
 * - Goto: Jump to specific node (executor handles navigation)
 *
 * All loop runtimes use DEFAULT_MAX_ITERATIONS (1000) as a safety bound
 * to prevent infinite loops. Break and Goto throw signals that are
 * caught by the executor for control flow handling.
 */

import { branchRuntime } from './branch.ts';
import { ifRuntime } from './if.ts';
import { loopRuntime } from './loop.ts';
import { whileRuntime } from './while.ts';
import { foreachRuntime } from './foreach.ts';
import { breakRuntime } from './break.ts';
import { gotoRuntime } from './goto.ts';
import { parallelRuntime } from './parallel.ts';
import { runtimeRegistry } from '../registry.ts';

// ============================================================================
// Auto-Registration
// ============================================================================

// Register Control runtimes when module is imported
runtimeRegistry.register(branchRuntime);
runtimeRegistry.register(ifRuntime);
runtimeRegistry.register(loopRuntime);
runtimeRegistry.register(whileRuntime);
runtimeRegistry.register(foreachRuntime);
runtimeRegistry.register(breakRuntime);
runtimeRegistry.register(gotoRuntime);
runtimeRegistry.register(parallelRuntime);

// ============================================================================
// Type Exports
// ============================================================================

export type {
  LoopConfig,
  WhileConfig,
  ForeachConfig,
  BranchConfig,
  IfConfig,
  BreakConfig,
  GotoConfig,
  ParallelConfig,
} from './types.ts';

export { DEFAULT_MAX_ITERATIONS } from './types.ts';

// ============================================================================
// Signal Exports
// ============================================================================

export { BreakSignal, GotoSignal } from './signals.ts';

// ============================================================================
// Runtime Exports
// ============================================================================

export { branchRuntime, type BranchResult } from './branch.ts';
export { ifRuntime, type IfResult } from './if.ts';
export { loopRuntime, type LoopResult } from './loop.ts';
export { whileRuntime, type WhileResult } from './while.ts';
export { foreachRuntime, type ForeachResult } from './foreach.ts';
export { breakRuntime } from './break.ts';
export { gotoRuntime } from './goto.ts';
export { parallelRuntime, type ParallelResult } from './parallel.ts';
