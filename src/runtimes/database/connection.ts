/**
 * Database Connection Manager for FlowScript
 *
 * Manages database connections using Bun's built-in SQL API.
 * Supports PostgreSQL and SQLite via connection URL parsing.
 */

import { SQL } from 'bun';
import { DatabaseError } from '../errors.ts';

/**
 * Wrapper around Bun's SQL instance providing a consistent interface.
 */
export interface DatabaseConnection {
  /** Execute a query and return rows */
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Execute a statement (no return) */
  execute(sql: string, params?: unknown[]): Promise<void>;
  /** Close the connection */
  close(): void;
  /** The database type */
  type: 'postgres' | 'sqlite';
}

/**
 * Determine the database type from a connection URL.
 */
export function parseDatabaseType(url: string): 'postgres' | 'sqlite' {
  if (url.startsWith('sqlite:') || url.startsWith('file:') || url === ':memory:') {
    return 'sqlite';
  }
  // Default to postgres (matches Bun.SQL behavior)
  return 'postgres';
}

/**
 * Create a database connection from a URL string.
 *
 * @param url - Connection URL (postgres://... or sqlite:///path)
 * @returns A DatabaseConnection instance
 */
export function createDatabaseConnection(url: string): DatabaseConnection {
  const dbType = parseDatabaseType(url);

  let db: InstanceType<typeof SQL>;
  try {
    db = new SQL(url);
  } catch (err) {
    throw new DatabaseError(
      `Failed to connect to database: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err instanceof Error ? err : undefined
    );
  }

  return {
    type: dbType,

    async query(sqlStr: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
      try {
        const results = await db.unsafe(sqlStr, params as any[]);
        // Bun.SQL returns an array-like result
        return Array.from(results) as Record<string, unknown>[];
      } catch (err) {
        throw new DatabaseError(
          `Query failed: ${err instanceof Error ? err.message : String(err)}`,
          sqlStr,
          err instanceof Error ? err : undefined
        );
      }
    },

    async execute(sqlStr: string, params?: unknown[]): Promise<void> {
      try {
        await db.unsafe(sqlStr, params as any[]);
      } catch (err) {
        throw new DatabaseError(
          `Execute failed: ${err instanceof Error ? err.message : String(err)}`,
          sqlStr,
          err instanceof Error ? err : undefined
        );
      }
    },

    close(): void {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    },
  };
}
