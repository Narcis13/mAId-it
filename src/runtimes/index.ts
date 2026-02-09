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

// Side-effect import: auto-registers File runtimes
import './file/index.ts';

// Side-effect import: auto-registers AI runtime
import './ai/index.ts';

// Side-effect import: auto-registers Transform runtimes
import './transform/index.ts';

// Side-effect import: auto-registers Control runtimes
import './control/index.ts';

// Side-effect import: auto-registers Checkpoint runtime
import './checkpoint/index.ts';

// Side-effect import: auto-registers Temporal runtimes
import './temporal/index.ts';

// Re-export HTTP runtimes for convenience
export { httpSourceRuntime, httpSinkRuntime } from './http/index.ts';

// Re-export File runtimes for convenience
export { fileSourceRuntime, fileSinkRuntime, resolveTemplatePath, validatePath, detectFormat } from './file/index.ts';

// Re-export AI runtime for convenience
export { aiRuntime } from './ai/index.ts';

// Re-export AI types and utilities
export type { AINodeConfig, AIResult, AIUsage, AIErrorCode } from './ai/index.ts';
export { AIError, SchemaValidationError, isRateLimitError, parseSchemaDSL, SchemaDSLError } from './ai/index.ts';

// Re-export Transform runtimes for convenience
export { templateRuntime, mapRuntime, filterRuntime } from './transform/index.ts';

// Re-export Transform types
export type { TemplateConfig, MapConfig, FilterConfig } from './transform/index.ts';

// Re-export Control runtimes for convenience
export {
  branchRuntime,
  ifRuntime,
  loopRuntime,
  whileRuntime,
  foreachRuntime,
  breakRuntime,
  gotoRuntime,
} from './control/index.ts';

// Re-export Control types and signals
export type {
  LoopConfig,
  WhileConfig,
  ForeachConfig,
  BranchConfig,
  IfConfig,
  BreakConfig,
  GotoConfig,
  BranchResult,
  IfResult,
  LoopResult,
  WhileResult,
  ForeachResult,
} from './control/index.ts';
export { BreakSignal, GotoSignal, DEFAULT_MAX_ITERATIONS } from './control/index.ts';

// Re-export Checkpoint runtime for convenience
export { checkpointRuntime, CheckpointRuntime } from './checkpoint/index.ts';

// Re-export Checkpoint types
export type { CheckpointConfig, CheckpointResult, CheckpointAction } from './checkpoint/index.ts';

// Re-export Temporal runtimes for convenience
export { delayRuntime, timeoutRuntime, parseDuration } from './temporal/index.ts';

// Re-export Temporal types
export type { DelayConfig, TimeoutConfig, TimeoutResult } from './temporal/index.ts';
