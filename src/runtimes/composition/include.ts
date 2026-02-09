/**
 * Include Runtime for FlowScript
 *
 * Executes another workflow file inline as a sub-workflow.
 * Input bindings are passed via <bind> elements.
 * Output available as `includeId.output` in parent scope.
 */

import path from 'node:path';
import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { IncludeNode } from '../../types/ast.ts';
import { parseFile } from '../../parser/index.ts';
import { validate } from '../../validator/index.ts';
import { buildExecutionPlan } from '../../scheduler/index.ts';
import { createExecutionState, execute, evaluateTemplateInContext } from '../../execution/index.ts';
import { activeWorkflowPaths } from './cycle.ts';

/**
 * Configuration for include nodes (resolved from bindings).
 */
export interface IncludeConfig {
  workflow?: string;
}

/**
 * Include Runtime - execute another workflow inline.
 */
class IncludeRuntime implements NodeRuntime<IncludeConfig, unknown, unknown> {
  readonly type = 'composition:include';

  async execute(params: ExecutionParams<IncludeConfig, unknown>): Promise<unknown> {
    const { node, input, state } = params;
    const includeNode = node as unknown as IncludeNode;

    // Resolve workflow path relative to current workflow
    const workflowPath = includeNode.workflow;
    if (!workflowPath) {
      throw new Error('Include node requires a "workflow" attribute');
    }

    // Resolve relative path based on source map file path
    const basePath = state.globalContext.$workflowDir as string || process.cwd();
    const resolvedPath = path.resolve(basePath, workflowPath);

    // Cycle detection
    if (activeWorkflowPaths.has(resolvedPath)) {
      throw new Error(
        `Circular include detected: ${resolvedPath} is already being executed`
      );
    }

    activeWorkflowPaths.add(resolvedPath);

    try {
      // Parse the included workflow
      const parseResult = await parseFile(resolvedPath);
      if (!parseResult.success) {
        const errors = parseResult.errors.map(e => e.message).join('; ');
        throw new Error(`Failed to parse included workflow ${workflowPath}: ${errors}`);
      }

      // Validate the included workflow
      const validationResult = validate(parseResult.data);
      if (!validationResult.valid) {
        const errors = validationResult.errors.map(e => e.message).join('; ');
        throw new Error(`Included workflow ${workflowPath} has validation errors: ${errors}`);
      }

      // Build execution plan
      const plan = buildExecutionPlan(parseResult.data);

      // Resolve bindings into global context for the sub-workflow
      const subContext: Record<string, unknown> = {};
      if (input !== undefined) {
        subContext.input = input;
      }
      for (const binding of includeNode.bindings) {
        // Evaluate binding value as a template expression in parent state
        const resolvedValue = evaluateTemplateInContext(binding.value, state);
        subContext[binding.key] = resolvedValue;
      }

      // Create sub-workflow execution state
      // Inherit parent config and secrets, merge bindings into globalContext
      const subState = createExecutionState({
        workflowId: parseResult.data.metadata.name,
        config: { ...state.config },
        secrets: { ...state.secrets },
        globalContext: {
          ...subContext,
          $workflowDir: path.dirname(resolvedPath),
        },
      });

      // Execute the sub-workflow
      await execute(plan, subState);

      // Return the last successful node output
      let lastOutput: unknown = undefined;
      for (const [, result] of subState.nodeResults) {
        if (result.status === 'success' && result.output !== undefined) {
          lastOutput = result.output;
        }
      }

      return lastOutput;
    } finally {
      activeWorkflowPaths.delete(resolvedPath);
    }
  }
}

export const includeRuntime = new IncludeRuntime();
