/**
 * AI Runtime Module for FlowScript
 *
 * Provides the AI runtime for executing LLM-powered nodes in workflows.
 * Auto-registers the runtime on import.
 */

// Re-export types
export type { AINodeConfig, AIResult, AIUsage, AIErrorCode } from './types.ts';

// Re-export errors
export { AIError, SchemaValidationError, isRateLimitError } from './errors.ts';

// Re-export retry utilities
export { calculateBackoffMs, sleep, buildRetryPrompt } from './retry.ts';

// Re-export schema DSL
export { parseSchemaDSL, SchemaDSLError } from './schema-dsl.ts';

// Re-export runtime
export { aiRuntime } from './runtime.ts';

// Auto-register on import
import { runtimeRegistry } from '../registry.ts';
import { aiRuntime } from './runtime.ts';

runtimeRegistry.register(aiRuntime);
