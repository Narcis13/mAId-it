/**
 * Runtime Error Classes for FlowScript
 *
 * Custom error classes for HTTP and File runtime operations.
 */

// ============================================================================
// Runtime Error Codes
// ============================================================================

/**
 * Runtime-specific error codes that complement the base ErrorCode enum.
 */
export type RuntimeErrorCode =
  | 'RUNTIME_HTTP_ERROR'
  | 'RUNTIME_FILE_NOT_FOUND'
  | 'RUNTIME_FILE_WRITE_ERROR'
  | 'RUNTIME_PATH_TRAVERSAL'
  | 'RUNTIME_TIMEOUT';

// ============================================================================
// HTTP Error
// ============================================================================

/**
 * Error thrown when HTTP requests fail.
 *
 * @example
 * ```ts
 * throw new HttpError('HTTP 404: Not Found', 404, '{"error":"Resource not found"}');
 *
 * // Check if error is retryable
 * if (error.isRetryable) {
 *   // Retry the request
 * }
 * ```
 */
export class HttpError extends Error {
  /** Error code for categorization */
  readonly code: RuntimeErrorCode = 'RUNTIME_HTTP_ERROR';

  constructor(
    message: string,
    /** HTTP status code */
    public readonly status: number,
    /** Response body (if available) */
    public readonly body?: string
  ) {
    super(message);
    this.name = 'HttpError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  /**
   * Whether this error is retryable.
   * Returns true for:
   * - 429 (Too Many Requests / Rate Limited)
   * - 5xx (Server Errors)
   */
  get isRetryable(): boolean {
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }
}

// ============================================================================
// File Error
// ============================================================================

/**
 * Error thrown when file operations fail.
 *
 * @example
 * ```ts
 * throw new FileError('File not found: /path/to/file.json', '/path/to/file.json', 'ENOENT');
 * ```
 */
export class FileError extends Error {
  constructor(
    message: string,
    /** File path that caused the error */
    public readonly path?: string,
    /** System error code (e.g., 'ENOENT', 'EACCES') */
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FileError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, FileError.prototype);
  }
}

// ============================================================================
// Timeout Error
// ============================================================================

/**
 * Error thrown when an operation times out.
 *
 * @example
 * ```ts
 * throw new TimeoutError('Request timed out after 30000ms', 30000);
 * ```
 */
export class TimeoutError extends Error {
  /** Error code for categorization */
  readonly code: RuntimeErrorCode = 'RUNTIME_TIMEOUT';

  constructor(
    message: string,
    /** Timeout value in milliseconds */
    public readonly timeout: number
  ) {
    super(message);
    this.name = 'TimeoutError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

// ============================================================================
// Path Traversal Error
// ============================================================================

/**
 * Error thrown when a path traversal attack is detected.
 *
 * @example
 * ```ts
 * throw new PathTraversalError('Path traversal not allowed: ../../../etc/passwd');
 * ```
 */
export class PathTraversalError extends Error {
  /** Error code for categorization */
  readonly code: RuntimeErrorCode = 'RUNTIME_PATH_TRAVERSAL';

  constructor(
    message: string,
    /** The invalid path */
    public readonly path?: string
  ) {
    super(message);
    this.name = 'PathTraversalError';

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, PathTraversalError.prototype);
  }
}
