/**
 * Database Runtime Module for FlowScript
 *
 * Provides database source and sink runtimes using Bun's built-in SQL API.
 * Supports PostgreSQL and SQLite.
 */

import { databaseSourceRuntime } from './source.ts';
import { databaseSinkRuntime } from './sink.ts';
import { runtimeRegistry } from '../registry.ts';

// Auto-register database runtimes
runtimeRegistry.register(databaseSourceRuntime);
runtimeRegistry.register(databaseSinkRuntime);

export { databaseSourceRuntime } from './source.ts';
export { databaseSinkRuntime } from './sink.ts';
export { createDatabaseConnection, parseDatabaseType } from './connection.ts';
export type { DatabaseConnection } from './connection.ts';
