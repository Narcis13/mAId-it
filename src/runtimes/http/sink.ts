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
import { getOAuth2Token, clearOAuth2Token } from './auth.ts';

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
async function buildAuthHeaders(
  auth: AuthConfig | undefined,
  state: ExecutionState
): Promise<Record<string, string>> {
  if (!auth || auth.type === 'none') {
    return {};
  }

  if (auth.type === 'bearer' && auth.token) {
    const token = resolveValue(auth.token, state);
    return { Authorization: `Bearer ${token}` };
  }

  if (auth.type === 'basic' && auth.username && auth.password) {
    const username = resolveValue(auth.username, state);
    const password = resolveValue(auth.password, state);
    const credentials = btoa(`${username}:${password}`);
    return { Authorization: `Basic ${credentials}` };
  }

  if (auth.type === 'oauth2') {
    const resolvedAuth: AuthConfig = {
      ...auth,
      token_url: auth.token_url ? resolveValue(auth.token_url, state) : undefined,
      client_id: auth.client_id ? resolveValue(auth.client_id, state) : undefined,
      client_secret: auth.client_secret ? resolveValue(auth.client_secret, state) : undefined,
      scope: auth.scope ? resolveValue(auth.scope, state) : undefined,
    };
    const token = await getOAuth2Token(resolvedAuth);
    return { Authorization: `Bearer ${token}` };
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
    const authHeaders = await buildAuthHeaders(config.auth, state);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...resolvedHeaders,
      ...authHeaders,
    };

    // Build request options
    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
    };

    // Add body for methods that support it (not DELETE)
    if (method !== 'DELETE') {
      options.body = JSON.stringify(input);
    }

    // Make the request
    let response = await fetch(url, options);

    // OAuth2 token refresh on 401
    if (response.status === 401 && config.auth?.type === 'oauth2' && config.auth.token_url && config.auth.client_id) {
      clearOAuth2Token(
        resolveValue(config.auth.token_url, state),
        resolveValue(config.auth.client_id, state)
      );
      const newAuthHeaders = await buildAuthHeaders(config.auth, state);
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...resolvedHeaders,
        ...newAuthHeaders,
      };
      response = await fetch(url, { ...options, headers: retryHeaders });
    }

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
