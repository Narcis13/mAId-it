/**
 * Checkpoint Runtime Exports
 *
 * Re-exports types and runtime, registers with global registry.
 */

export * from './types.ts';
export { CheckpointRuntime, checkpointRuntime } from './runtime.ts';

// Auto-register with runtime registry
import { runtimeRegistry } from '../registry.ts';
import { checkpointRuntime } from './runtime.ts';

runtimeRegistry.register(checkpointRuntime);
