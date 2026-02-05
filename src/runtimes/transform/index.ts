/**
 * Transform Runtimes for FlowScript
 *
 * Data transformation node implementations:
 * - **Template**: Render strings with {{expression}} placeholders
 * - **Map**: Transform each item in an array using an expression
 * - **Filter**: Select items from an array based on a condition
 *
 * These are the data manipulation primitives that complement source/sink nodes,
 * enabling workflows to reshape, extract, and filter data between operations.
 */

import { templateRuntime } from './template.ts';
import { mapRuntime } from './map.ts';
import { filterRuntime } from './filter.ts';
import { runtimeRegistry } from '../registry.ts';

// ============================================================================
// Auto-Registration
// ============================================================================

// Register Transform runtimes when module is imported
runtimeRegistry.register(templateRuntime);
runtimeRegistry.register(mapRuntime);
runtimeRegistry.register(filterRuntime);

// ============================================================================
// Exports
// ============================================================================

// Re-export types
export type {
  TemplateConfig,
  MapConfig,
  FilterConfig,
} from './types.ts';

// Export runtimes
export { templateRuntime } from './template.ts';
export { mapRuntime } from './map.ts';
export { filterRuntime } from './filter.ts';
