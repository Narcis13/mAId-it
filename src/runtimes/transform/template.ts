/**
 * Template Runtime for FlowScript
 *
 * Renders template strings with {{expression}} placeholders.
 * Templates can access the input via {{input}} or {{input.field}}.
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { TemplateConfig } from './types.ts';
import { evaluateTemplate, buildEvaluationContext } from '../../expression/index.ts';

// ============================================================================
// Template Runtime Implementation
// ============================================================================

/**
 * Template Runtime implementation.
 *
 * Renders a template string by evaluating all {{expression}} placeholders.
 * The input from the previous node is available as `input` in the context.
 *
 * @example
 * ```xml
 * <transform type="template" id="format-greeting">
 *   <template>Hello, {{input.name}}! You have {{input.messages.length}} messages.</template>
 * </transform>
 * ```
 */
class TemplateRuntime implements NodeRuntime<TemplateConfig, unknown, string> {
  readonly type = 'transform:template';

  async execute(params: ExecutionParams<TemplateConfig, unknown>): Promise<string> {
    const { config, state, input } = params;

    // Add input to nodeContext for template resolution
    const stateWithInput = {
      ...state,
      nodeContext: {
        ...state.nodeContext,
        input,
      },
    };

    // Build evaluation context with input available
    const context = buildEvaluationContext(stateWithInput);

    // Evaluate the template string
    return evaluateTemplate(config.template, context);
  }
}

/**
 * Template runtime instance.
 */
export const templateRuntime = new TemplateRuntime();
