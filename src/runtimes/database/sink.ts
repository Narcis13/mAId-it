/**
 * Database Sink Runtime for FlowScript
 *
 * Writes data to PostgreSQL or SQLite databases with support for:
 * - INSERT, UPSERT, and UPDATE operations
 * - Batch processing for large datasets
 * - Parameterized statements (prevents SQL injection)
 *
 * @example
 * ```xml
 * <sink id="save-results" type="database"
 *   connection="sqlite:///data/app.db"
 *   table="results"
 *   operation="insert"
 *   batch="100"
 * />
 * ```
 */

import type { NodeRuntime, ExecutionParams, DatabaseSinkConfig, DatabaseSinkResult } from '../types.ts';
import { DatabaseError } from '../errors.ts';
import { createDatabaseConnection, parseDatabaseType } from './connection.ts';
import { evaluateTemplateInContext } from '../../execution/index.ts';
import type { ExecutionState } from '../../execution/types.ts';

function resolveValue(value: string, state: ExecutionState): string {
  return evaluateTemplateInContext(value, state);
}

/**
 * Build a parameterized INSERT statement.
 */
function buildInsertSQL(
  table: string,
  columns: string[],
  rowCount: number
): { sql: string; paramCount: number } {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const valuePlaceholders: string[] = [];
  let paramIdx = 1;

  for (let r = 0; r < rowCount; r++) {
    const rowPlaceholders = columns.map(() => `$${paramIdx++}`);
    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  return {
    sql: `INSERT INTO "${table}" (${colList}) VALUES ${valuePlaceholders.join(', ')}`,
    paramCount: paramIdx - 1,
  };
}

/**
 * Build a parameterized UPSERT statement (INSERT ... ON CONFLICT).
 */
function buildUpsertSQL(
  table: string,
  columns: string[],
  conflictColumns: string[],
  dbType: 'postgres' | 'sqlite'
): { sql: string } {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const conflictList = conflictColumns.map(c => `"${c}"`).join(', ');

  const updateCols = columns
    .filter(c => !conflictColumns.includes(c))
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  const onConflict = updateCols
    ? `ON CONFLICT (${conflictList}) DO UPDATE SET ${updateCols}`
    : `ON CONFLICT (${conflictList}) DO NOTHING`;

  return {
    sql: `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ${onConflict}`,
  };
}

/**
 * Build a parameterized UPDATE statement.
 */
function buildUpdateSQL(
  table: string,
  columns: string[],
  where?: string
): { sql: string; setParamCount: number } {
  const setClauses = columns.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const whereClause = where ? ` WHERE ${where}` : '';

  return {
    sql: `UPDATE "${table}" SET ${setClauses}${whereClause}`,
    setParamCount: columns.length,
  };
}

/**
 * Normalize input into an array of row objects.
 */
function normalizeInput(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return input.filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
    );
  }
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return [input as Record<string, unknown>];
  }
  throw new DatabaseError('Database sink input must be an object or array of objects');
}

class DatabaseSinkRuntime implements NodeRuntime<DatabaseSinkConfig, unknown, DatabaseSinkResult> {
  readonly type = 'database:sink';

  async execute(params: ExecutionParams<DatabaseSinkConfig, unknown>): Promise<DatabaseSinkResult> {
    const { config, input, state } = params;

    const connectionUrl = resolveValue(String(config.connection), state);
    const table = String(config.table);
    const operation = config.operation || 'insert';
    const batchSize = config.batch ? Number(config.batch) : 100;
    const dbType = parseDatabaseType(connectionUrl);

    const rows = normalizeInput(input);
    if (rows.length === 0) {
      return { rowsAffected: 0, batches: 0 };
    }

    const conn = createDatabaseConnection(connectionUrl);
    try {
      let totalAffected = 0;
      let batchCount = 0;

      if (operation === 'insert') {
        // Batch insert
        const columns = Object.keys(rows[0]!);
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { sql } = buildInsertSQL(table, columns, batch.length);
          const flatParams = batch.flatMap(row => columns.map(c => row[c]));
          await conn.execute(sql, flatParams);
          totalAffected += batch.length;
          batchCount++;
        }
      } else if (operation === 'upsert') {
        const columns = Object.keys(rows[0]!);
        const conflictColumns = config.conflictColumns
          ? (Array.isArray(config.conflictColumns) ? config.conflictColumns : [String(config.conflictColumns)])
          : [];

        if (conflictColumns.length === 0) {
          throw new DatabaseError('Upsert operation requires "conflictColumns" to be specified');
        }

        const { sql } = buildUpsertSQL(table, columns, conflictColumns, dbType);

        // Upsert one row at a time (ON CONFLICT syntax is per-row)
        for (const row of rows) {
          const rowParams = columns.map(c => row[c]);
          await conn.execute(sql, rowParams);
          totalAffected++;
        }
        batchCount = Math.ceil(rows.length / batchSize);
      } else if (operation === 'update') {
        const columns = Object.keys(rows[0]!);
        const where = config.where ? resolveValue(String(config.where), state) : undefined;
        const { sql } = buildUpdateSQL(table, columns, where);

        for (const row of rows) {
          const rowParams = columns.map(c => row[c]);
          await conn.execute(sql, rowParams);
          totalAffected++;
        }
        batchCount = Math.ceil(rows.length / batchSize);
      } else {
        throw new DatabaseError(`Unknown database operation: ${operation}`);
      }

      return { rowsAffected: totalAffected, batches: batchCount };
    } finally {
      conn.close();
    }
  }
}

export const databaseSinkRuntime = new DatabaseSinkRuntime();
