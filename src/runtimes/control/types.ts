/**
 * Control Flow Configuration Types for FlowScript
 *
 * Configuration interfaces for control flow nodes that match
 * the AST node structures from src/types/ast.ts.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Default maximum iterations for loops to prevent infinite loops.
 */
export const DEFAULT_MAX_ITERATIONS = 1000;

// ============================================================================
// Loop Configuration Types
// ============================================================================

/**
 * Configuration for fixed-iteration loop nodes.
 *
 * @example
 * ```xml
 * <loop id="retry" maxIterations="3" breakCondition="success === true">
 *   ...
 * </loop>
 * ```
 */
export interface LoopConfig {
  /** Maximum number of iterations (default: 1000) */
  maxIterations?: number;
  /** Expression that, when true, breaks out of the loop */
  breakCondition?: string;
}

/**
 * Configuration for condition-based while loops.
 *
 * @example
 * ```xml
 * <while id="poll" condition="status !== 'complete'">
 *   ...
 * </while>
 * ```
 */
export interface WhileConfig {
  /** Expression that must be true to continue looping (required) */
  condition: string;
  /** Safety bound on iterations (default: 1000) */
  maxIterations?: number;
}

/**
 * Configuration for collection iteration loops.
 *
 * @example
 * ```xml
 * <foreach id="process-items" collection="items" itemVar="item" indexVar="idx">
 *   ...
 * </foreach>
 * ```
 */
export interface ForeachConfig {
  /** Expression that evaluates to an array to iterate over */
  collection: string;
  /** Variable name for the current item (default: 'item') */
  itemVar?: string;
  /** Variable name for the current index (default: 'index') */
  indexVar?: string;
  /** Maximum concurrent iterations (default: 1 = sequential) */
  maxConcurrency?: number;
}

// ============================================================================
// Branching Configuration Types
// ============================================================================

/**
 * Configuration for branch (pattern matching) nodes.
 *
 * Note: Cases are defined in the AST node structure, not in config.
 * This interface exists for type consistency with other control nodes.
 *
 * @example
 * ```xml
 * <branch id="route" input="status">
 *   <case condition="status === 'success'">...</case>
 *   <case condition="status === 'error'">...</case>
 *   <default>...</default>
 * </branch>
 * ```
 */
export interface BranchConfig {
  // Cases are in AST node structure (BranchCase[]), not config
}

/**
 * Configuration for conditional if nodes.
 *
 * @example
 * ```xml
 * <if id="check-auth" condition="user.isAuthenticated">
 *   <then>...</then>
 *   <else>...</else>
 * </if>
 * ```
 */
export interface IfConfig {
  /** Expression that determines which branch to execute (required) */
  condition: string;
}

// ============================================================================
// Jump Configuration Types
// ============================================================================

/**
 * Configuration for break nodes.
 *
 * @example
 * ```xml
 * <!-- Break current loop -->
 * <break/>
 *
 * <!-- Break specific outer loop -->
 * <break loop="outer-loop"/>
 * ```
 */
export interface BreakConfig {
  /** Optional target loop ID to break out of (for breaking outer loops) */
  loop?: string;
}

/**
 * Configuration for goto nodes.
 *
 * @example
 * ```xml
 * <goto target="retry-point"/>
 * ```
 */
export interface GotoConfig {
  /** Target node ID to jump to (required) */
  target: string;
}
