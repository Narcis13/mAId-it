/**
 * Retry Utilities Tests
 *
 * Tests for executeWithRetry wrapper and isRetryableError helper.
 */

import { describe, test, expect, mock } from 'bun:test';
import { executeWithRetry, isRetryableError } from './retry';
import { HttpError } from '../runtimes/errors';
import { AIError } from '../runtimes/ai/errors';

// ============================================================================
// isRetryableError Tests
// ============================================================================

describe('isRetryableError', () => {
  test('returns true for HttpError with 429 status', () => {
    const error = new HttpError('Rate limited', 429);
    expect(isRetryableError(error)).toBe(true);
    expect(error.isRetryable).toBe(true);
  });

  test('returns true for HttpError with 5xx status', () => {
    const error500 = new HttpError('Internal Server Error', 500);
    const error502 = new HttpError('Bad Gateway', 502);
    const error503 = new HttpError('Service Unavailable', 503);

    expect(isRetryableError(error500)).toBe(true);
    expect(isRetryableError(error502)).toBe(true);
    expect(isRetryableError(error503)).toBe(true);
  });

  test('returns false for HttpError with 4xx status (except 429)', () => {
    const error400 = new HttpError('Bad Request', 400);
    const error401 = new HttpError('Unauthorized', 401);
    const error404 = new HttpError('Not Found', 404);

    expect(isRetryableError(error400)).toBe(false);
    expect(isRetryableError(error401)).toBe(false);
    expect(isRetryableError(error404)).toBe(false);
  });

  test('returns true for AIError with retryable=true', () => {
    const error = new AIError('Rate limit exceeded', 'RATE_LIMIT', true);
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns false for AIError with retryable=false', () => {
    const error = new AIError('Invalid API key', 'API_ERROR', false);
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns true for TimeoutError', () => {
    const error = new Error('Request timed out');
    error.name = 'TimeoutError';
    expect(isRetryableError(error)).toBe(true);
  });

  test('returns false for AbortError (user cancellation)', () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns false for generic Error', () => {
    const error = new Error('Something went wrong');
    expect(isRetryableError(error)).toBe(false);
  });

  test('returns false for non-Error values', () => {
    expect(isRetryableError('error string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError({ message: 'error' })).toBe(false);
  });

  test('returns true for DOMException-like TimeoutError object', () => {
    const error = { name: 'TimeoutError', message: 'Timeout' };
    expect(isRetryableError(error)).toBe(true);
  });
});

// ============================================================================
// executeWithRetry Tests
// ============================================================================

describe('executeWithRetry', () => {
  test('returns result on first success', async () => {
    const fn = mock(async () => 'success');

    const result = await executeWithRetry(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on retryable error and succeeds', async () => {
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 2) {
        throw new HttpError('Server Error', 500);
      }
      return 'success after retry';
    });

    const result = await executeWithRetry(fn, {
      maxRetries: 3,
      backoffBase: 10, // Fast for testing
    });

    expect(result).toBe('success after retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('exhausts retries and throws last error', async () => {
    const fn = mock(async () => {
      throw new HttpError('Server Error', 500);
    });

    await expect(
      executeWithRetry(fn, {
        maxRetries: 2,
        backoffBase: 10,
      })
    ).rejects.toThrow('Server Error');

    // Initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry on non-retryable error', async () => {
    const fn = mock(async () => {
      throw new HttpError('Not Found', 404);
    });

    await expect(
      executeWithRetry(fn, { maxRetries: 3 })
    ).rejects.toThrow('Not Found');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('calls fallback when all retries exhausted', async () => {
    const fn = mock(async () => {
      throw new HttpError('Server Error', 500);
    });

    const fallback = mock(async () => 'fallback result');

    const result = await executeWithRetry(
      fn,
      { maxRetries: 1, backoffBase: 10 },
      fallback
    );

    expect(result).toBe('fallback result');
    // Initial attempt + 1 retry = 2 calls
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test('does not call fallback on non-retryable error', async () => {
    const fn = mock(async () => {
      throw new HttpError('Bad Request', 400);
    });

    const fallback = mock(async () => 'fallback result');

    await expect(
      executeWithRetry(fn, { maxRetries: 3 }, fallback)
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(0);
  });

  test('passes AbortSignal to function', async () => {
    let receivedSignal: AbortSignal | undefined;

    const fn = mock(async (signal: AbortSignal) => {
      receivedSignal = signal;
      return 'done';
    });

    await executeWithRetry(fn, { timeout: 5000 });

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(false);
  });

  test('uses default config values', async () => {
    const fn = mock(async () => 'success');

    await executeWithRetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on AIError with retryable=true', async () => {
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 2) {
        throw new AIError('Rate limit', 'RATE_LIMIT', true);
      }
      return 'success';
    });

    const result = await executeWithRetry(fn, {
      maxRetries: 3,
      backoffBase: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('does not retry on AbortError', async () => {
    const fn = mock(async () => {
      const error = new Error('User cancelled');
      error.name = 'AbortError';
      throw error;
    });

    await expect(
      executeWithRetry(fn, { maxRetries: 3 })
    ).rejects.toThrow('User cancelled');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on timeout and succeeds', async () => {
    let attempts = 0;
    const fn = mock(async () => {
      attempts++;
      if (attempts < 2) {
        const error = new Error('Timed out');
        error.name = 'TimeoutError';
        throw error;
      }
      return 'success';
    });

    const result = await executeWithRetry(fn, {
      maxRetries: 3,
      backoffBase: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('converts non-Error throws to Error', async () => {
    const fn = mock(async () => {
      throw 'string error';
    });

    await expect(
      executeWithRetry(fn, { maxRetries: 0 })
    ).rejects.toThrow('string error');
  });
});
