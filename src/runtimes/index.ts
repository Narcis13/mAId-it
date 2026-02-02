/**
 * Runtime Module for FlowScript
 *
 * Provides the runtime registry and re-exports all runtime types and errors.
 */

// Re-export types
export type {
  ExecutionParams,
  NodeRuntime,
  RuntimeExecuteResult,
  AuthConfig,
  HttpSourceConfig,
  HttpSinkConfig,
  HttpSinkResult,
  FileFormat,
  FileSourceConfig,
  FileSinkConfig,
  FileSinkResult,
} from './types.ts';

// Re-export errors
export {
  HttpError,
  FileError,
  TimeoutError,
  PathTraversalError,
} from './errors.ts';

export type { RuntimeErrorCode } from './errors.ts';

// Import for runtime registry
import type { NodeRuntime } from './types.ts';

// ============================================================================
// Runtime Registry
// ============================================================================

/**
 * Registry for managing runtime implementations.
 *
 * The registry allows runtimes to be registered by their type string
 * and retrieved for execution.
 *
 * @example
 * ```ts
 * import { runtimeRegistry, getRuntime } from './runtimes';
 *
 * // Register a runtime
 * runtimeRegistry.register(httpSourceRuntime);
 *
 * // Get a runtime
 * const runtime = getRuntime('http:source');
 * if (runtime) {
 *   await runtime.execute(params);
 * }
 * ```
 */
export class RuntimeRegistry {
  private runtimes = new Map<string, NodeRuntime>();

  /**
   * Register a runtime implementation.
   *
   * @param runtime - The runtime to register
   */
  register(runtime: NodeRuntime): void {
    this.runtimes.set(runtime.type, runtime);
  }

  /**
   * Get a runtime by type.
   *
   * @param type - The runtime type string (e.g., 'http:source')
   * @returns The runtime or undefined if not found
   */
  get(type: string): NodeRuntime | undefined {
    return this.runtimes.get(type);
  }

  /**
   * Check if a runtime is registered.
   *
   * @param type - The runtime type string
   * @returns True if the runtime is registered
   */
  has(type: string): boolean {
    return this.runtimes.has(type);
  }

  /**
   * List all registered runtime types.
   *
   * @returns Array of registered runtime type strings
   */
  list(): string[] {
    return Array.from(this.runtimes.keys());
  }

  /**
   * Clear all registered runtimes.
   * Useful for testing.
   */
  clear(): void {
    this.runtimes.clear();
  }
}

/**
 * Global runtime registry singleton.
 *
 * Use this instance to register and retrieve runtimes throughout the application.
 */
export const runtimeRegistry = new RuntimeRegistry();

/**
 * Convenience function to get a runtime from the registry.
 *
 * @param type - The runtime type string
 * @returns The runtime or undefined if not found
 *
 * @example
 * ```ts
 * const runtime = getRuntime('http:source');
 * if (runtime) {
 *   await runtime.execute({ node, input, config, state });
 * }
 * ```
 */
export function getRuntime(type: string): NodeRuntime | undefined {
  return runtimeRegistry.get(type);
}

/**
 * Check if a runtime is registered.
 *
 * @param type - The runtime type string
 * @returns True if the runtime is registered
 */
export function hasRuntime(type: string): boolean {
  return runtimeRegistry.has(type);
}
