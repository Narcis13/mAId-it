/**
 * Composition Runtimes for FlowScript
 *
 * Provides workflow composition via <include> and <call> elements.
 */

import { runtimeRegistry } from '../registry.ts';
import { includeRuntime } from './include.ts';
import { callRuntime } from './call.ts';

// Register composition runtimes
runtimeRegistry.register(includeRuntime);
runtimeRegistry.register(callRuntime);

// Re-export runtimes
export { includeRuntime } from './include.ts';
export { callRuntime } from './call.ts';

// Re-export types
export type { IncludeConfig } from './include.ts';
export type { CallConfig } from './call.ts';

// Re-export cycle detection utility
export { activeWorkflowPaths } from './cycle.ts';
