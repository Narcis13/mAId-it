/**
 * HTTP Runtime Module for FlowScript
 *
 * Provides HTTP source and sink runtimes for fetching data from
 * and sending data to HTTP APIs.
 *
 * @example
 * ```ts
 * // Importing this module auto-registers HTTP runtimes
 * import './http';
 *
 * // Or import specific runtimes
 * import { httpSourceRuntime, httpSinkRuntime } from './http';
 * ```
 */

import { httpSourceRuntime } from './source.ts';
import { httpSinkRuntime } from './sink.ts';
import { runtimeRegistry } from '../registry.ts';

// ============================================================================
// Auto-Registration
// ============================================================================

// Register HTTP runtimes when module is imported
runtimeRegistry.register(httpSourceRuntime);
runtimeRegistry.register(httpSinkRuntime);

// ============================================================================
// Exports
// ============================================================================

export { httpSourceRuntime } from './source.ts';
export { httpSinkRuntime } from './sink.ts';
