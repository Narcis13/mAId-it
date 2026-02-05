/**
 * Transform Configuration Types for FlowScript
 *
 * Configuration interfaces for transform nodes that manipulate data
 * through templating, mapping, and filtering operations.
 */

// ============================================================================
// Template Configuration
// ============================================================================

/**
 * Configuration for template transform nodes.
 *
 * Templates use `{{expression}}` syntax for interpolation.
 *
 * @example
 * ```xml
 * <transform type="template" id="format-greeting">
 *   <template>Hello, {{user.name}}! You have {{messages.length}} messages.</template>
 * </transform>
 * ```
 */
export interface TemplateConfig {
  /** Template string with {{expression}} placeholders */
  template: string;
}

// ============================================================================
// Map Configuration
// ============================================================================

/**
 * Configuration for map transform nodes.
 *
 * Maps an expression over each item in the input array.
 *
 * **Available iteration context variables:**
 * - `$item` - The current item being processed
 * - `$index` - Zero-based index of the current item
 * - `$first` - Boolean, true if this is the first item
 * - `$last` - Boolean, true if this is the last item
 * - `$items` - Reference to the full input array
 *
 * @example
 * ```xml
 * <transform type="map" id="extract-names" input="users">
 *   <expression>$item.name</expression>
 * </transform>
 *
 * <transform type="map" id="add-index" input="items">
 *   <expression>{ ...item, position: $index + 1 }</expression>
 * </transform>
 * ```
 */
export interface MapConfig {
  /** Expression to evaluate for each item */
  expression: string;
}

// ============================================================================
// Filter Configuration
// ============================================================================

/**
 * Configuration for filter transform nodes.
 *
 * Filters the input array, keeping only items where the condition is truthy.
 *
 * **Available iteration context variables:**
 * - `$item` - The current item being tested
 * - `$index` - Zero-based index of the current item
 *
 * @example
 * ```xml
 * <transform type="filter" id="active-users" input="users">
 *   <condition>$item.isActive</condition>
 * </transform>
 *
 * <transform type="filter" id="even-indexed" input="items">
 *   <condition>$index % 2 === 0</condition>
 * </transform>
 * ```
 */
export interface FilterConfig {
  /** Expression that must return truthy for item to be included */
  condition: string;
}
