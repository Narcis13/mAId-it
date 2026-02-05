/**
 * Control Flow Signals for FlowScript
 *
 * Exception-based signals for control flow operations like break and goto.
 * These are thrown during execution and caught by the appropriate control structures.
 */

// ============================================================================
// Break Signal
// ============================================================================

/**
 * Signal thrown to break out of a loop.
 *
 * @example
 * ```ts
 * // Break current loop
 * throw new BreakSignal();
 *
 * // Break specific outer loop by ID
 * throw new BreakSignal('outer-loop');
 * ```
 */
export class BreakSignal extends Error {
  constructor(
    /** Optional target loop ID for breaking specific outer loops */
    public readonly targetLoopId?: string
  ) {
    super(targetLoopId ? `Break to loop: ${targetLoopId}` : 'Break');
    this.name = 'BreakSignal';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BreakSignal.prototype);
  }
}

// ============================================================================
// Goto Signal
// ============================================================================

/**
 * Signal thrown to jump to a specific node in the workflow.
 *
 * @example
 * ```ts
 * // Jump to node with ID 'retry-point'
 * throw new GotoSignal('retry-point');
 * ```
 */
export class GotoSignal extends Error {
  constructor(
    /** Target node ID to jump to */
    public readonly targetNodeId: string
  ) {
    super(`Goto: ${targetNodeId}`);
    this.name = 'GotoSignal';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, GotoSignal.prototype);
  }
}
