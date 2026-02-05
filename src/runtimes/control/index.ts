/**
 * Control Flow Runtimes Module for FlowScript
 *
 * Provides runtime implementations for all control flow nodes:
 * - Branch: Pattern matching with multiple cases
 * - If: Simple conditional with then/else branches
 * - Loop: Fixed iteration with optional break condition
 * - While: Condition-based iteration with safety bounds
 * - Foreach: Collection iteration with item/index injection
 * - Break: Exit enclosing loop (with optional target)
 * - Goto: Jump to specific node (executor handles navigation)
 *
 * All loop runtimes use DEFAULT_MAX_ITERATIONS (1000) as a safety bound
 * to prevent infinite loops. Break and Goto throw signals that are
 * caught by the executor for control flow handling.
 */

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
