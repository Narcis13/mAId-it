/**
 * Call Runtime for FlowScript
 *
 * Invokes another workflow with function-call semantics.
 * Arguments are passed in, output is returned, execution context is fully isolated.
 */

import path from 'node:path';
import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { CallNode } from '../../types/ast.ts';
import { parseFile } from '../../parser/index.ts';
import { validate } from '../../validator/index.ts';
import { buildExecutionPlan } from '../../scheduler/index.ts';
import { createExecutionState, execute, evaluateTemplateInContext } from '../../execution/index.ts';
import { activeWorkflowPaths } from './cycle.ts';

/**
 * Configuration for call nodes.
 */
export interface CallConfig {
  workflow?: string;
}

/**
 * Call Runtime - invoke another workflow as a function call.
 */
class CallRuntime implements NodeRuntime<CallConfig, unknown, unknown> {
  readonly type = 'composition:call';

  async execute(params: ExecutionParams<CallConfig, unknown>): Promise<unknown> {
    const { node, input, state } = params;
    const callNode = node as unknown as CallNode;

    const workflowPath = callNode.workflow;
    if (!workflowPath) {
      throw new Error('Call node requires a "workflow" attribute');
    }

    // Resolve relative path
    const basePath = state.globalContext.$workflowDir as string || process.cwd();
    const resolvedPath = path.resolve(basePath, workflowPath);

    // Cycle detection
    if (activeWorkflowPaths.has(resolvedPath)) {
      throw new Error(
        `Circular call detected: ${resolvedPath} is already being executed`
      );
    }

    activeWorkflowPaths.add(resolvedPath);

    try {
      // Parse the called workflow
      const parseResult = await parseFile(resolvedPath);
      if (!parseResult.success) {
        const errors = parseResult.errors.map(e => e.message).join('; ');
        throw new Error(`Failed to parse called workflow ${workflowPath}: ${errors}`);
      }

      // Validate
      const validationResult = validate(parseResult.data);
      if (!validationResult.valid) {
        const errors = validationResult.errors.map(e => e.message).join('; ');
        throw new Error(`Called workflow ${workflowPath} has validation errors: ${errors}`);
      }

      // Build execution plan
      const plan = buildExecutionPlan(parseResult.data);

      // Resolve args as template expressions in parent state
      const resolvedArgs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(callNode.args)) {
        resolvedArgs[key] = evaluateTemplateInContext(value, state);
      }

      // Create fully isolated execution state
      // Only pass resolved args and input — no parent config/secrets inheritance
      const subState = createExecutionState({
        workflowId: parseResult.data.metadata.name,
        config: {},
        secrets: {},
        globalContext: {
          ...resolvedArgs,
          input: input ?? undefined,
          $workflowDir: path.dirname(resolvedPath),
        },
      });

      // Execute
      await execute(plan, subState);

      // Return last successful output
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

export const callRuntime = new CallRuntime();
