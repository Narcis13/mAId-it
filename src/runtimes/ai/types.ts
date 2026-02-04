/**
 * AI Runtime Type Definitions for FlowScript
 *
 * Defines configuration, result, and error types for AI node operations.
 * Used by the AI runtime to execute LLM-powered nodes.
 */

import type { ZodType } from 'zod';

// ============================================================================
// Error Codes
// ============================================================================

/**
 * AI-specific error codes for classification and retry logic.
 *
 * - TIMEOUT: Request exceeded configured timeout
 * - RATE_LIMIT: API rate limit reached (HTTP 429)
 * - VALIDATION: Output failed schema validation
 * - API_ERROR: General API error (authentication, server error, etc.)
 */
export type AIErrorCode = 'TIMEOUT' | 'RATE_LIMIT' | 'VALIDATION' | 'API_ERROR';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for AI nodes.
 *
 * @example
 * ```ts
 * const config: AINodeConfig = {
 *   model: 'anthropic/claude-3.5-sonnet',
 *   systemPrompt: 'You are a helpful assistant.',
 *   userPrompt: 'Summarize: ${input.text}',
 *   outputSchema: z.object({ summary: z.string() }),
 *   maxTokens: 1024,
 *   maxRetries: 3,
 *   timeout: 60000
 * };
 * ```
 */
export interface AINodeConfig {
  /**
   * OpenRouter model ID.
   * @example "anthropic/claude-3.5-sonnet", "openai/gpt-4-turbo"
   */
  model: string;

  /**
   * System prompt template.
   * May contain template expressions like ${input.field}.
   */
  systemPrompt: string;

  /**
   * User prompt template.
   * May contain template expressions like ${input.field}.
   */
  userPrompt: string;

  /**
   * Zod schema for output validation.
   * The AI response must conform to this schema.
   */
  outputSchema: ZodType;

  /**
   * Maximum tokens for the response.
   * @default 4096
   */
  maxTokens?: number;

  /**
   * Maximum retry attempts on validation failure.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Request timeout in milliseconds.
   * @default 60000
   */
  timeout?: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Token usage statistics from an AI request.
 */
export interface AIUsage {
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Total estimated cost in USD */
  totalCost: number;
}

/**
 * Result of an AI node execution.
 *
 * @template T - The output type (inferred from schema)
 */
export interface AIResult<T = unknown> {
  /** Validated output data */
  output: T;
  /** Token usage and cost information */
  usage: AIUsage;
  /** Number of retries used (0 if first attempt succeeded) */
  retries: number;
}
