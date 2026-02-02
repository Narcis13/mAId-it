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

// Re-export registry (from separate file to avoid circular deps)
export {
  RuntimeRegistry,
  runtimeRegistry,
  getRuntime,
  hasRuntime,
} from './registry.ts';

// Side-effect import: auto-registers HTTP runtimes
import './http/index.ts';

// Re-export HTTP runtimes for convenience
export { httpSourceRuntime, httpSinkRuntime } from './http/index.ts';
