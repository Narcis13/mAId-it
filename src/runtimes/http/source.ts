/**
 * HTTP Source Runtime for FlowScript
 *
 * Fetches data from HTTP APIs with support for:
 * - GET and POST methods
 * - Query parameters and headers
 * - Bearer and Basic authentication
 * - JMESPath response extraction
 * - Configurable timeouts
 */

import { search } from '@jmespath-community/jmespath';
import type { NodeRuntime, ExecutionParams, HttpSourceConfig, AuthConfig } from '../types.ts';
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
 * Build complete URL with query parameters.
 */
function buildUrl(
  baseUrl: string,
  params: Record<string, string> | undefined,
  state: ExecutionState
): string {
  const resolvedUrl = resolveValue(baseUrl, state);
  const resolvedParams = resolveRecord(params, state);

  const url = new URL(resolvedUrl);

  for (const [key, value] of Object.entries(resolvedParams)) {
    url.searchParams.append(key, value);
  }

  return url.toString();
}

// ============================================================================
// HTTP Source Runtime
// ============================================================================

/**
 * HTTP Source Runtime implementation.
 *
 * Fetches data from HTTP APIs and optionally extracts specific fields
 * using JMESPath expressions.
 *
 * @example
 * ```xml
 * <http:source id="fetch-users"
 *   url="https://api.example.com/users"
 *   method="GET"
 *   auth.type="bearer"
 *   auth.token="{{$secrets.API_TOKEN}}"
 *   extract="data.users[*].{id: id, name: name}"
 * />
 * ```
 */
class HttpSourceRuntime implements NodeRuntime<HttpSourceConfig, void, unknown> {
  readonly type = 'http:source';

  async execute(params: ExecutionParams<HttpSourceConfig, void>): Promise<unknown> {
    const { config, state } = params;
    const timeout = config.timeout ?? 30000;

    // Build request URL with resolved params
    const url = buildUrl(config.url, config.params, state);

    // Build headers
    const resolvedHeaders = resolveRecord(config.headers, state);
    const authHeaders = await buildAuthHeaders(config.auth, state);
    const headers = { ...resolvedHeaders, ...authHeaders };

    // Build request options
    const options: RequestInit = {
      method: config.method,
      headers,
      signal: AbortSignal.timeout(timeout),
    };

    // Add body for POST/PUT requests
    if ((config.method === 'POST' || config.method === 'PUT') && config.body !== undefined) {
      options.body = JSON.stringify(config.body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
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
      const retryHeaders = { ...resolvedHeaders, ...newAuthHeaders };
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

    // Parse response based on content type
    const contentType = response.headers.get('content-type') || '';
    let data: unknown;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType.startsWith('text/') || contentType.includes('xml')) {
      data = await response.text();
    } else {
      // No content-type or unknown: try JSON parse, fall back to text
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    // Apply JMESPath extraction if specified
    if (config.extract) {
      return search(data as Parameters<typeof search>[0], config.extract);
    }

    return data;
  }
}

/**
 * HTTP source runtime instance.
 */
export const httpSourceRuntime = new HttpSourceRuntime();
