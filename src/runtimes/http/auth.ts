/**
 * OAuth2 Authentication for HTTP Runtimes
 *
 * Implements OAuth2 client credentials flow with token caching
 * and automatic refresh on 401 responses.
 */

import type { AuthConfig } from '../types.ts';
import { HttpError } from '../errors.ts';

// ============================================================================
// Token Cache
// ============================================================================

interface CachedToken {
  access_token: string;
  expires_at: number; // Unix timestamp in ms
}

/** In-memory token cache keyed by token_url + client_id */
const tokenCache = new Map<string, CachedToken>();

/**
 * Build a cache key from OAuth2 config fields.
 */
function cacheKey(tokenUrl: string, clientId: string): string {
  return `${tokenUrl}::${clientId}`;
}

/**
 * Clear the cached token for a given OAuth2 config (used on 401 retry).
 */
export function clearOAuth2Token(tokenUrl: string, clientId: string): void {
  tokenCache.delete(cacheKey(tokenUrl, clientId));
}

/**
 * Clear all cached OAuth2 tokens.
 */
export function clearAllOAuth2Tokens(): void {
  tokenCache.clear();
}

// ============================================================================
// OAuth2 Token Acquisition
// ============================================================================

/**
 * Fetch an OAuth2 access token using the client credentials grant.
 *
 * Caches tokens in memory and reuses them until they expire
 * (with a 60-second safety margin).
 */
export async function getOAuth2Token(auth: AuthConfig): Promise<string> {
  if (!auth.token_url || !auth.client_id || !auth.client_secret) {
    throw new Error('OAuth2 requires token_url, client_id, and client_secret');
  }

  const key = cacheKey(auth.token_url, auth.client_id);

  // Check cache
  const cached = tokenCache.get(key);
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  // Request new token
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.client_id,
    client_secret: auth.client_secret,
  });

  if (auth.scope) {
    body.set('scope', auth.scope);
  }

  const response = await fetch(auth.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new HttpError(
      `OAuth2 token request failed: HTTP ${response.status}`,
      response.status,
      errorBody
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new Error('OAuth2 token response missing access_token');
  }

  // Cache with expiry (default 1 hour if not specified)
  const expiresIn = data.expires_in ?? 3600;
  tokenCache.set(key, {
    access_token: data.access_token,
    expires_at: Date.now() + expiresIn * 1000,
  });

  return data.access_token;
}
