/**
 * AI Runtime for FlowScript
 *
 * Executes AI nodes by calling OpenRouter via fetch with tool-based structured output.
 * Validates responses against Zod schemas and retries on validation failures.
 *
 * Key features:
 * - Tool calling forces structured JSON output when output-schema is provided
 * - Validates response against Zod schema parsed via parseSchemaDSL
 * - Retries validation failures with error feedback in new user message
 * - Exponential backoff with jitter on rate limits (429)
 * - Configurable timeout with AbortSignal (default: 60 seconds)
 */

import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { ExecutionState } from '../../execution/types.ts';
import type { AINodeConfig, AIResult, AIUsage } from './types.ts';
import { AIError, SchemaValidationError, isRateLimitError } from './errors.ts';
import { calculateBackoffMs, sleep, buildRetryPrompt } from './retry.ts';
import { parseSchemaDSL } from './schema-dsl.ts';
import { evaluateTemplateInContext } from '../../execution/index.ts';
import type { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_TOKENS = 4096;

// ============================================================================
// Types for OpenRouter API
// ============================================================================

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface OpenRouterToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OpenRouterTool {
  type: 'function';
  function: OpenRouterToolFunction;
}

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
  finish_reason: string;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  usage: OpenRouterUsage;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve template expressions in a string value using execution state.
 */
function resolveTemplate(value: string, state: ExecutionState): string {
  return evaluateTemplateInContext(value, state);
}

/**
 * Convert Zod schema to JSON Schema for OpenRouter tool definition.
 * Uses Zod's built-in JSON schema generation.
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod provides a way to get a JSON Schema-like representation
  // We'll build a simple JSON schema from the Zod schema's shape
  const zodSchema = schema as unknown as {
    _def: {
      typeName: string;
      shape?: () => Record<string, z.ZodType>;
      type?: z.ZodType;
    };
  };

  const typeName = zodSchema._def?.typeName;

  if (typeName === 'ZodString') {
    return { type: 'string' };
  }

  if (typeName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }

  if (typeName === 'ZodArray') {
    const innerType = zodSchema._def?.type;
    return {
      type: 'array',
      items: innerType ? zodToJsonSchema(innerType) : {},
    };
  }

  if (typeName === 'ZodObject') {
    const shape = zodSchema._def?.shape?.() ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      // In our DSL, all fields are required by default
      required.push(key);
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  // Fallback for unknown types
  return {};
}

/**
 * Build the tool definition for structured output.
 */
function buildOutputTool(schema: z.ZodType): OpenRouterTool {
  return {
    type: 'function',
    function: {
      name: 'output',
      description: 'Return the structured output according to the schema',
      parameters: zodToJsonSchema(schema),
    },
  };
}

/**
 * Extract output from tool call response.
 */
function extractToolCallOutput(response: OpenRouterResponse): unknown {
  const choice = response.choices[0];

  if (!choice) {
    throw new AIError('No response choice from API', 'API_ERROR', false);
  }

  const toolCalls = choice.message.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    // No tool call - try to parse content as JSON
    const content = choice.message.content;
    if (!content) {
      throw new AIError('No output from AI model', 'API_ERROR', false);
    }
    try {
      return JSON.parse(content);
    } catch {
      throw new AIError(
        'AI did not return valid JSON and did not use tool calling',
        'VALIDATION',
        true
      );
    }
  }

  const outputCall = toolCalls.find((tc) => tc.function.name === 'output');
  if (!outputCall) {
    throw new AIError('AI did not call the output tool', 'VALIDATION', true);
  }

  try {
    return JSON.parse(outputCall.function.arguments);
  } catch {
    throw new AIError(
      'Tool call arguments are not valid JSON',
      'VALIDATION',
      true
    );
  }
}

/**
 * Parse usage from OpenRouter response.
 */
function parseUsage(usage: OpenRouterUsage): AIUsage {
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    // Cost estimation would require model-specific pricing
    // For now, return 0 as placeholder
    totalCost: 0,
  };
}

// ============================================================================
// AI Runtime Configuration from Node
// ============================================================================

/**
 * Configuration extracted from node.config for AI nodes.
 * Parser stores <system> and <user> child elements in config.
 */
interface AINodeRawConfig {
  model: string;
  system?: string;
  user?: string;
  'output-schema'?: string;
  'max-tokens'?: number | string;
  'max-retries'?: number | string;
  timeout?: number | string;
}

// ============================================================================
// AI Runtime Implementation
// ============================================================================

/**
 * AI Runtime implementation.
 *
 * Executes AI transform nodes by:
 * 1. Extracting system/user prompts from node.config
 * 2. Resolving template expressions in prompts
 * 3. Parsing output-schema DSL to Zod schema
 * 4. Calling OpenRouter with tool calling for structured output
 * 5. Validating response against schema
 * 6. Retrying on validation failure with error feedback
 * 7. Using exponential backoff on rate limits
 *
 * @example
 * ```xml
 * <transform type="ai" id="analyze" model="anthropic/claude-3.5-sonnet">
 *   <system>You are a sentiment analyzer.</system>
 *   <user>Analyze: {{input.text}}</user>
 *   <output-schema>{sentiment: string, score: number}</output-schema>
 * </transform>
 * ```
 */
class AIRuntime implements NodeRuntime<AINodeRawConfig, unknown, AIResult> {
  readonly type = 'ai';

  async execute(
    params: ExecutionParams<AINodeRawConfig, unknown>
  ): Promise<AIResult> {
    const { config, state, input } = params;

    // Get API key from secrets
    const apiKey = state.secrets['OPENROUTER_API_KEY'];
    if (!apiKey) {
      throw new AIError(
        'OPENROUTER_API_KEY not found in secrets',
        'API_ERROR',
        false
      );
    }

    // Extract configuration
    const model = config.model;
    if (!model) {
      throw new AIError('model is required for AI nodes', 'API_ERROR', false);
    }

    const systemPromptTemplate = config.system ?? '';
    const userPromptTemplate = config.user ?? '';

    // Parse numeric config values
    const maxTokens =
      typeof config['max-tokens'] === 'string'
        ? parseInt(config['max-tokens'], 10)
        : config['max-tokens'] ?? DEFAULT_MAX_TOKENS;
    const maxRetries =
      typeof config['max-retries'] === 'string'
        ? parseInt(config['max-retries'], 10)
        : config['max-retries'] ?? DEFAULT_MAX_RETRIES;
    const timeout =
      typeof config.timeout === 'string'
        ? parseInt(config.timeout, 10)
        : config.timeout ?? DEFAULT_TIMEOUT;

    // Parse output schema if provided
    const outputSchemaDSL = config['output-schema'];
    let outputSchema: z.ZodType | undefined;
    if (outputSchemaDSL) {
      outputSchema = parseSchemaDSL(outputSchemaDSL);
    }

    // Add input to state for template resolution
    const stateWithInput = {
      ...state,
      nodeContext: {
        ...state.nodeContext,
        input,
      },
    };

    // Resolve template expressions in prompts
    const systemPrompt = resolveTemplate(systemPromptTemplate, stateWithInput);
    const userPrompt = resolveTemplate(userPromptTemplate, stateWithInput);

    // Execute with retry logic
    let retries = 0;
    let currentUserPrompt = userPrompt;
    let lastError: Error | undefined;

    while (retries <= maxRetries) {
      try {
        const result = await this.callOpenRouter({
          apiKey,
          model,
          systemPrompt,
          userPrompt: currentUserPrompt,
          outputSchema,
          maxTokens,
          timeout,
        });

        // Validate output against schema if provided
        if (outputSchema) {
          const validation = outputSchema.safeParse(result.output);
          if (!validation.success) {
            const errorMessage = validation.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ');

            throw new SchemaValidationError(
              'Output does not match schema',
              result.output,
              errorMessage
            );
          }
          result.output = validation.data;
        }

        return {
          ...result,
          retries,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Handle rate limits with backoff
        if (isRateLimitError(error)) {
          if (retries >= maxRetries) {
            throw new AIError(
              `Rate limit exceeded after ${retries} retries`,
              'RATE_LIMIT',
              false
            );
          }
          const backoffMs = calculateBackoffMs(retries);
          await sleep(backoffMs);
          retries++;
          continue;
        }

        // Handle validation errors with retry prompt
        if (error instanceof SchemaValidationError) {
          if (retries >= maxRetries) {
            throw new AIError(
              `Validation failed after ${retries} retries: ${error.validationMessage}`,
              'VALIDATION',
              false
            );
          }
          // Build retry prompt with error feedback
          currentUserPrompt = buildRetryPrompt(
            userPrompt,
            error.failedOutput,
            error.validationMessage
          );
          retries++;
          continue;
        }

        // Handle timeout errors
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new AIError(
            `Request timed out after ${timeout}ms`,
            'TIMEOUT',
            true
          );
        }

        // Re-throw other errors
        if (error instanceof AIError) {
          throw error;
        }

        throw new AIError(
          `API error: ${lastError.message}`,
          'API_ERROR',
          false
        );
      }
    }

    // Should not reach here, but just in case
    throw new AIError(
      `Max retries (${maxRetries}) exceeded`,
      'API_ERROR',
      false
    );
  }

  /**
   * Call OpenRouter API with tool calling for structured output.
   */
  private async callOpenRouter(options: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    outputSchema?: z.ZodType;
    maxTokens: number;
    timeout: number;
  }): Promise<{ output: unknown; usage: AIUsage }> {
    const {
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      outputSchema,
      maxTokens,
      timeout,
    } = options;

    // Build messages
    const messages: OpenRouterMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userPrompt });

    // Build request body
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
    };

    // Add tool calling if schema is provided
    if (outputSchema) {
      body.tools = [buildOutputTool(outputSchema)];
      body.tool_choice = { type: 'function', function: { name: 'output' } };
    }

    // Make the request
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://flowscript.dev', // Required by OpenRouter
        'X-Title': 'FlowScript',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    // Handle HTTP errors
    if (!response.ok) {
      const errorBody = await response.text();

      if (response.status === 429) {
        throw new AIError(
          `Rate limit exceeded: ${errorBody}`,
          'RATE_LIMIT',
          true
        );
      }

      if (response.status === 401) {
        throw new AIError(
          'Invalid API key',
          'API_ERROR',
          false
        );
      }

      throw new AIError(
        `OpenRouter API error (${response.status}): ${errorBody}`,
        'API_ERROR',
        response.status >= 500 // Server errors are retryable
      );
    }

    // Parse response
    const data = (await response.json()) as OpenRouterResponse;

    // Extract output
    let output: unknown;
    if (outputSchema) {
      output = extractToolCallOutput(data);
    } else {
      // No schema - return raw content
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new AIError('No content in response', 'API_ERROR', false);
      }
      // Try to parse as JSON, otherwise return as string
      try {
        output = JSON.parse(content);
      } catch {
        output = content;
      }
    }

    return {
      output,
      usage: parseUsage(data.usage),
    };
  }
}

/**
 * AI runtime instance.
 */
export const aiRuntime = new AIRuntime();
