/**
 * HTTP Sink Runtime for FlowScript
 *
 * Sends data to HTTP endpoints with support for:
 * - POST, PUT, and PATCH methods
 * - Custom headers
 * - Bearer and Basic authentication
 * - Configurable timeouts
 */

import type { NodeRuntime, ExecutionParams, HttpSinkConfig, HttpSinkResult, AuthConfig } from '../types.ts';
import { HttpError } from '../errors.ts';
import { evaluateTemplateInContext } from '../../execution/index.ts';
import type { ExecutionState } from '../../execution/types.ts';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve template expressions in a string value using execution state.
 */
function resolveValue(value: string, state: ExecutionState): string {
  return evaluateTemplateInContext(value, state);
}

/**
 * Resolve template expressions in all values of a record.
 */
function resolveRecord(
  record: Record<string, string> | undefined,
  state: ExecutionState
): Record<string, string> {
  if (!record) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    resolved[key] = resolveValue(value, state);
  }
  return resolved;
}

/**
 * Build authentication headers based on auth configuration.
 */
function buildAuthHeaders(
  auth: AuthConfig | undefined,
  state: ExecutionState
): Record<string, string> {
  if (!auth || auth.type === 'none') {
    return {};
  }

  if (auth.type === 'bearer' && auth.token) {
    // Resolve the token (may be a template like {{$secrets.API_TOKEN}})
    const token = resolveValue(auth.token, state);
    return { Authorization: `Bearer ${token}` };
  }

  if (auth.type === 'basic' && auth.username && auth.password) {
    const username = resolveValue(auth.username, state);
    const password = resolveValue(auth.password, state);
    const credentials = btoa(`${username}:${password}`);
    return { Authorization: `Basic ${credentials}` };
  }

  return {};
}

/**
 * Convert Response headers to a plain object.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// ============================================================================
// HTTP Sink Runtime
// ============================================================================

/**
 * HTTP Sink Runtime implementation.
 *
 * Sends workflow data to external HTTP endpoints. Takes the input from
 * the previous node and posts it as the request body.
 *
 * @example
 * ```xml
 * <http:sink id="post-results"
 *   url="https://api.example.com/webhook"
 *   method="POST"
 *   auth.type="bearer"
 *   auth.token="{{$secrets.WEBHOOK_TOKEN}}"
 * />
 * ```
 */
class HttpSinkRuntime implements NodeRuntime<HttpSinkConfig, unknown, HttpSinkResult> {
  readonly type = 'http:sink';

  async execute(params: ExecutionParams<HttpSinkConfig, unknown>): Promise<HttpSinkResult> {
    const { config, input, state } = params;
    const timeout = config.timeout ?? 30000;
    const method = config.method ?? 'POST';

    // Resolve URL with template expressions
    const url = resolveValue(config.url, state);

    // Build headers
    const resolvedHeaders = resolveRecord(config.headers, state);
    const authHeaders = buildAuthHeaders(config.auth, state);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...resolvedHeaders,
      ...authHeaders,
    };

    // Build request options
    const options: RequestInit = {
      method,
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeout),
    };

    // Make the request
    const response = await fetch(url, options);

    // Check for HTTP errors
    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        body
      );
    }

    // Return result metadata
    return {
      status: response.status,
      statusText: response.statusText,
      headers: headersToRecord(response.headers),
    };
  }
}

/**
 * HTTP sink runtime instance.
 */
export const httpSinkRuntime = new HttpSinkRuntime();
