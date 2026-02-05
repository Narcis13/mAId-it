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
