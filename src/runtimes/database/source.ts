/**
 * Database Source Runtime for FlowScript
 *
 * Executes SQL queries against PostgreSQL or SQLite databases
 * and returns the result rows as output data.
 *
 * @example
 * ```xml
 * <source id="get-users" type="database"
 *   connection="sqlite:///data/app.db"
 *   query="SELECT * FROM users WHERE active = $1"
 *   params="[true]"
 * />
 * ```
 */

import type { NodeRuntime, ExecutionParams, DatabaseSourceConfig } from '../types.ts';
import { DatabaseError } from '../errors.ts';
import { createDatabaseConnection } from './connection.ts';
import { evaluateTemplateInContext } from '../../execution/index.ts';
import type { ExecutionState } from '../../execution/types.ts';

/**
 * Resolve a config value that may contain template expressions.
 */
function resolveValue(value: string, state: ExecutionState): string {
  return evaluateTemplateInContext(value, state);
}

/**
 * Parse params from config. Supports:
 * - Array directly
 * - JSON string
 * - Template expression resolving to array
 */
function resolveParams(
  params: unknown,
  state: ExecutionState
): unknown[] {
  if (params === undefined || params === null) return [];

  if (Array.isArray(params)) return params;

  if (typeof params === 'string') {
    // Resolve template expressions first
    const resolved = resolveValue(params, state);
    try {
      const parsed = JSON.parse(resolved);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [resolved];
    }
  }

  return [params];
}

class DatabaseSourceRuntime implements NodeRuntime<DatabaseSourceConfig, void, unknown> {
  readonly type = 'database:source';

  async execute(params: ExecutionParams<DatabaseSourceConfig, void>): Promise<unknown> {
    const { config, state } = params;

    // Resolve connection URL (may contain secret refs)
    const connectionUrl = resolveValue(String(config.connection), state);

    if (!config.query) {
      throw new DatabaseError('Database source requires a "query" configuration');
    }

    // Resolve query (may contain template expressions in non-parameterized parts)
    const query = resolveValue(String(config.query), state);

    // Resolve parameters
    const queryParams = resolveParams(config.params, state);

    // Create connection, execute, close
    const conn = createDatabaseConnection(connectionUrl);
    try {
      const rows = await conn.query(query, queryParams);
      return rows;
    } finally {
      conn.close();
    }
  }
}

export const databaseSourceRuntime = new DatabaseSourceRuntime();
