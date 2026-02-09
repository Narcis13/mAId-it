/**
 * Runtime Type Definitions for FlowScript
 *
 * Defines the NodeRuntime interface and configuration types for
 * HTTP and File runtimes.
 */

import type { ExecutionState } from '../execution/types.ts';
import type { NodeAST } from '../types/ast.ts';
import type { ValidationError } from '../types/errors.ts';

// ============================================================================
// Runtime Interface
// ============================================================================

/**
 * Parameters passed to runtime execute method.
 */
export interface ExecutionParams<TConfig = unknown, TInput = unknown> {
  /** The AST node being executed */
  node: NodeAST;
  /** Input data from previous node (or undefined for sources) */
  input: TInput;
  /** Resolved configuration for this node */
  config: TConfig;
  /** Current execution state */
  state: ExecutionState;
  /** Optional abort signal for cooperative cancellation */
  signal?: AbortSignal;
}

/**
 * NodeRuntime interface - contract for all runtime implementations.
 *
 * @template TConfig - Configuration type for this runtime
 * @template TInput - Input type (void for sources)
 * @template TOutput - Output type
 */
export interface NodeRuntime<TConfig = unknown, TInput = unknown, TOutput = unknown> {
  /** Runtime type identifier (e.g., 'http:source', 'file:sink') */
  type: string;

  /**
   * Execute the node with provided context.
   */
  execute(params: ExecutionParams<TConfig, TInput>): Promise<TOutput>;

  /**
   * Optional: Custom validation beyond schema.
   */
  validate?(node: NodeAST): ValidationError[];
}

/**
 * Result wrapper for runtime outputs with optional metadata.
 */
export interface RuntimeExecuteResult<T = unknown> {
  /** The output data */
  output: T;
  /** Optional metadata about the execution */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Authentication configuration for HTTP requests.
 */
export interface AuthConfig {
  /** Authentication type */
  type: 'bearer' | 'basic' | 'none';
  /** Bearer token (may be secret reference like $secrets.API_TOKEN) */
  token?: string;
  /** Username for basic auth */
  username?: string;
  /** Password for basic auth */
  password?: string;
}

// ============================================================================
// HTTP Configuration Types
// ============================================================================

/**
 * Configuration for HTTP source nodes (fetching data).
 */
export interface HttpSourceConfig {
  /** URL to fetch (may contain template expressions) */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Query parameters */
  params?: Record<string, string>;
  /** Request body (for POST) */
  body?: unknown;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** JMESPath expression for response extraction */
  extract?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Configuration for HTTP sink nodes (sending data).
 */
export interface HttpSinkConfig {
  /** URL to send to (may contain template expressions) */
  url: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Result returned by HTTP sink operations.
 */
export interface HttpSinkResult {
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
}

// ============================================================================
// File Configuration Types
// ============================================================================

// ============================================================================
// Database Configuration Types
// ============================================================================

/**
 * Configuration for database source nodes (querying data).
 */
export interface DatabaseSourceConfig {
  /** Connection URL (postgres://... or sqlite:///path) — may contain template expressions */
  connection: string;
  /** SQL query with parameterized placeholders ($1, $2, ...) */
  query: string;
  /** Query parameters (resolved from template expressions) */
  params?: unknown[];
}

/**
 * Configuration for database sink nodes (writing data).
 */
export interface DatabaseSinkConfig {
  /** Connection URL — may contain template expressions */
  connection: string;
  /** Target table name */
  table: string;
  /** Write operation type (default: insert) */
  operation?: 'insert' | 'upsert' | 'update';
  /** Batch size for chunked writes (default: 100) */
  batch?: number;
  /** Columns for upsert conflict detection */
  conflictColumns?: string[];
  /** WHERE clause for updates (with $1, $2, ... params) */
  where?: string;
}

/**
 * Result returned by database sink operations.
 */
export interface DatabaseSinkResult {
  /** Number of rows affected */
  rowsAffected: number;
  /** Number of batches executed */
  batches: number;
}

// ============================================================================
// File Configuration Types
// ============================================================================

/**
 * File format for reading/writing.
 */
export type FileFormat = 'json' | 'text' | 'auto';

/**
 * Configuration for file source nodes (reading files).
 */
export interface FileSourceConfig {
  /** File path (may contain template expressions) */
  path: string;
  /** File format (default: 'auto' - detect from extension) */
  format?: FileFormat;
}

/**
 * Configuration for file sink nodes (writing files).
 */
export interface FileSinkConfig {
  /** File path (may contain template expressions) */
  path: string;
  /** File format */
  format?: 'json' | 'text';
  /** Pretty-print JSON (default: true) */
  pretty?: boolean;
  /** Create parent directories if needed (default: true) */
  createDir?: boolean;
}

/**
 * Result returned by file sink operations.
 */
export interface FileSinkResult {
  /** Resolved file path */
  path: string;
  /** Number of bytes written */
  bytes: number;
}
