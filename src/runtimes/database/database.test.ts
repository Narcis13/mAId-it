/**
 * Database Runtime Tests
 *
 * Tests for database source and sink runtimes using SQLite in-memory databases.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { SQL } from 'bun';
import { databaseSourceRuntime } from './source.ts';
import { databaseSinkRuntime } from './sink.ts';
import { createDatabaseConnection, parseDatabaseType } from './connection.ts';
import { DatabaseError } from '../errors.ts';
import { runtimeRegistry } from '../registry.ts';
// Side-effect import to trigger auto-registration of all runtimes
import '../index.ts';
import type { NodeAST } from '../../types/ast.ts';
import type { ExecutionState } from '../../execution/types.ts';

// ============================================================================
// Helpers
// ============================================================================

function makeState(overrides?: Partial<ExecutionState>): ExecutionState {
  return {
    workflowId: 'test',
    runId: 'test-run',
    status: 'running',
    currentWave: 0,
    startedAt: Date.now(),
    nodeResults: new Map(),
    globalContext: {},
    phaseContext: {},
    nodeContext: {},
    config: {},
    secrets: {},
    ...overrides,
  } as ExecutionState;
}

function makeNode(id: string): NodeAST {
  return {
    type: 'source',
    id,
    sourceType: 'database',
    config: {},
    loc: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } },
  } as NodeAST;
}

/**
 * Set up a test database with some data and return the file path.
 * Since we can't reuse in-memory DBs across connections, use a temp file.
 */
async function setupTestDb(): Promise<string> {
  const tmpPath = `/tmp/flowscript-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  const db = new SQL(`sqlite://${tmpPath}`);

  await db.unsafe(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      active INTEGER DEFAULT 1
    )
  `);

  await db.unsafe(
    `INSERT INTO users (name, email, active) VALUES ($1, $2, $3)`,
    ['Alice', 'alice@test.com', 1]
  );
  await db.unsafe(
    `INSERT INTO users (name, email, active) VALUES ($1, $2, $3)`,
    ['Bob', 'bob@test.com', 1]
  );
  await db.unsafe(
    `INSERT INTO users (name, email, active) VALUES ($1, $2, $3)`,
    ['Charlie', 'charlie@test.com', 0]
  );

  db.close();
  return tmpPath;
}

async function cleanupDb(path: string): Promise<void> {
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      await Bun.write(path, ''); // truncate
      // Can't reliably delete, just leave empty temp files
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Connection Manager Tests
// ============================================================================

describe('parseDatabaseType', () => {
  test('detects sqlite from sqlite:// URL', () => {
    expect(parseDatabaseType('sqlite:///data/app.db')).toBe('sqlite');
  });

  test('detects sqlite from file:// URL', () => {
    expect(parseDatabaseType('file:///data/app.db')).toBe('sqlite');
  });

  test('detects sqlite from :memory:', () => {
    expect(parseDatabaseType(':memory:')).toBe('sqlite');
  });

  test('defaults to postgres for postgres:// URL', () => {
    expect(parseDatabaseType('postgres://user:pass@localhost:5432/db')).toBe('postgres');
  });

  test('defaults to postgres for unknown URL', () => {
    expect(parseDatabaseType('somehost:5432/db')).toBe('postgres');
  });
});

describe('createDatabaseConnection', () => {
  test('creates SQLite in-memory connection', () => {
    const conn = createDatabaseConnection('sqlite://:memory:');
    expect(conn.type).toBe('sqlite');
    conn.close();
  });

  test('query returns results', async () => {
    const conn = createDatabaseConnection('sqlite://:memory:');
    await conn.execute('CREATE TABLE test (id INTEGER, val TEXT)');
    await conn.execute(`INSERT INTO test VALUES ($1, $2)`, [1, 'hello']);
    const rows = await conn.query('SELECT * FROM test');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(1);
    expect(rows[0]!.val).toBe('hello');
    conn.close();
  });

  test('throws DatabaseError on bad query', async () => {
    const conn = createDatabaseConnection('sqlite://:memory:');
    try {
      await conn.query('SELECT * FROM nonexistent_table');
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
      expect((err as DatabaseError).query).toBe('SELECT * FROM nonexistent_table');
    }
    conn.close();
  });
});

// ============================================================================
// Database Source Runtime Tests
// ============================================================================

describe('DatabaseSourceRuntime', () => {
  test('is registered with correct type', () => {
    expect(databaseSourceRuntime.type).toBe('database:source');
    expect(runtimeRegistry.has('database:source')).toBe(true);
  });

  test('queries SQLite and returns rows', async () => {
    const dbPath = await setupTestDb();
    try {
      const result = await databaseSourceRuntime.execute({
        node: makeNode('get-users'),
        input: undefined as any,
        config: {
          connection: `sqlite://${dbPath}`,
          query: 'SELECT * FROM users WHERE active = $1',
          params: [1],
        },
        state: makeState(),
      });

      expect(Array.isArray(result)).toBe(true);
      const rows = result as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[0]!.name).toBe('Alice');
      expect(rows[1]!.name).toBe('Bob');
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('returns all rows without params', async () => {
    const dbPath = await setupTestDb();
    try {
      const result = await databaseSourceRuntime.execute({
        node: makeNode('get-all'),
        input: undefined as any,
        config: {
          connection: `sqlite://${dbPath}`,
          query: 'SELECT * FROM users ORDER BY id',
        },
        state: makeState(),
      });

      const rows = result as Record<string, unknown>[];
      expect(rows).toHaveLength(3);
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('params from JSON string', async () => {
    const dbPath = await setupTestDb();
    try {
      const result = await databaseSourceRuntime.execute({
        node: makeNode('get-by-name'),
        input: undefined as any,
        config: {
          connection: `sqlite://${dbPath}`,
          query: 'SELECT * FROM users WHERE name = $1',
          params: '["Charlie"]' as any,
        },
        state: makeState(),
      });

      const rows = result as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('Charlie');
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('throws on missing query', async () => {
    try {
      await databaseSourceRuntime.execute({
        node: makeNode('bad'),
        input: undefined as any,
        config: {
          connection: 'sqlite://:memory:',
          query: '',
        },
        state: makeState(),
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
    }
  });
});

// ============================================================================
// Database Sink Runtime Tests
// ============================================================================

describe('DatabaseSinkRuntime', () => {
  test('is registered with correct type', () => {
    expect(databaseSinkRuntime.type).toBe('database:sink');
    expect(runtimeRegistry.has('database:sink')).toBe(true);
  });

  test('inserts single row', async () => {
    const dbPath = `/tmp/flowscript-sink-${Date.now()}.db`;
    const setup = new SQL(`sqlite://${dbPath}`);
    await setup.unsafe('CREATE TABLE results (id INTEGER, value TEXT)');
    setup.close();

    try {
      const result = await databaseSinkRuntime.execute({
        node: makeNode('save'),
        input: { id: 1, value: 'test' },
        config: {
          connection: `sqlite://${dbPath}`,
          table: 'results',
          operation: 'insert',
        },
        state: makeState(),
      });

      expect(result.rowsAffected).toBe(1);
      expect(result.batches).toBe(1);

      // Verify the data was written
      const verify = createDatabaseConnection(`sqlite://${dbPath}`);
      const rows = await verify.query('SELECT * FROM results');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.value).toBe('test');
      verify.close();
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('inserts array of rows', async () => {
    const dbPath = `/tmp/flowscript-sink-batch-${Date.now()}.db`;
    const setup = new SQL(`sqlite://${dbPath}`);
    await setup.unsafe('CREATE TABLE items (name TEXT, count INTEGER)');
    setup.close();

    try {
      const input = [
        { name: 'a', count: 1 },
        { name: 'b', count: 2 },
        { name: 'c', count: 3 },
      ];

      const result = await databaseSinkRuntime.execute({
        node: makeNode('bulk-insert'),
        input,
        config: {
          connection: `sqlite://${dbPath}`,
          table: 'items',
          operation: 'insert',
          batch: 2,
        },
        state: makeState(),
      });

      expect(result.rowsAffected).toBe(3);
      expect(result.batches).toBe(2); // 2 items + 1 item = 2 batches

      const verify = createDatabaseConnection(`sqlite://${dbPath}`);
      const rows = await verify.query('SELECT * FROM items ORDER BY count');
      expect(rows).toHaveLength(3);
      expect(rows[0]!.name).toBe('a');
      expect(rows[2]!.name).toBe('c');
      verify.close();
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('upserts with conflict columns', async () => {
    const dbPath = `/tmp/flowscript-sink-upsert-${Date.now()}.db`;
    const setup = new SQL(`sqlite://${dbPath}`);
    await setup.unsafe('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
    await setup.unsafe(`INSERT INTO kv VALUES ($1, $2)`, ['a', 'old']);
    setup.close();

    try {
      const result = await databaseSinkRuntime.execute({
        node: makeNode('upsert'),
        input: [
          { key: 'a', value: 'new' },  // update existing
          { key: 'b', value: 'fresh' }, // insert new
        ],
        config: {
          connection: `sqlite://${dbPath}`,
          table: 'kv',
          operation: 'upsert',
          conflictColumns: ['key'],
        },
        state: makeState(),
      });

      expect(result.rowsAffected).toBe(2);

      const verify = createDatabaseConnection(`sqlite://${dbPath}`);
      const rows = await verify.query('SELECT * FROM kv ORDER BY key');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.value).toBe('new');   // updated
      expect(rows[1]!.value).toBe('fresh'); // inserted
      verify.close();
    } finally {
      await cleanupDb(dbPath);
    }
  });

  test('returns zero for empty input', async () => {
    const result = await databaseSinkRuntime.execute({
      node: makeNode('empty'),
      input: [],
      config: {
        connection: 'sqlite://:memory:',
        table: 'anything',
        operation: 'insert',
      },
      state: makeState(),
    });

    expect(result.rowsAffected).toBe(0);
    expect(result.batches).toBe(0);
  });

  test('throws on non-object input', async () => {
    try {
      await databaseSinkRuntime.execute({
        node: makeNode('bad-input'),
        input: 'not an object',
        config: {
          connection: 'sqlite://:memory:',
          table: 'anything',
          operation: 'insert',
        },
        state: makeState(),
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
    }
  });

  test('throws on upsert without conflictColumns', async () => {
    const dbPath = `/tmp/flowscript-sink-upsert-err-${Date.now()}.db`;
    const setup = new SQL(`sqlite://${dbPath}`);
    await setup.unsafe('CREATE TABLE t (id INTEGER, val TEXT)');
    setup.close();

    try {
      await databaseSinkRuntime.execute({
        node: makeNode('bad-upsert'),
        input: [{ id: 1, val: 'x' }],
        config: {
          connection: `sqlite://${dbPath}`,
          table: 't',
          operation: 'upsert',
        },
        state: makeState(),
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
      expect((err as DatabaseError).message).toContain('conflictColumns');
    } finally {
      await cleanupDb(dbPath);
    }
  });
});

// ============================================================================
// Parser/Validator Integration Tests
// ============================================================================

describe('Parser accepts database type', () => {
  // We test the parser via parseBody
  const { parseBody } = require('../../parser/body.ts');

  test('parses database source node', () => {
    const xml = `<workflow>
      <source id="db-read" type="database" connection="sqlite:///test.db" query="SELECT 1"/>
    </workflow>`;

    const result = parseBody(xml, 0, 0, xml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.type).toBe('source');
      const node = result.nodes[0] as any;
      expect(node.sourceType).toBe('database');
      expect(node.config.connection).toBe('sqlite:///test.db');
      expect(node.config.query).toBe('SELECT 1');
    }
  });

  test('parses database sink node', () => {
    const xml = `<workflow>
      <sink id="db-write" type="database" connection="sqlite:///test.db" table="results" input="src"/>
    </workflow>`;

    const result = parseBody(xml, 0, 0, xml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.type).toBe('sink');
      const node = result.nodes[0] as any;
      expect(node.sinkType).toBe('database');
      expect(node.config.connection).toBe('sqlite:///test.db');
      expect(node.config.table).toBe('results');
    }
  });
});

describe('Validator validates database nodes', () => {
  const { validateStructural } = require('../../validator/structural.ts');
  const makeLoc = () => ({ start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } });

  test('accepts valid database source', () => {
    const ast = {
      metadata: { name: 'test', version: '1.0.0' },
      nodes: [{
        type: 'source',
        id: 'db-read',
        sourceType: 'database',
        config: { connection: 'sqlite:///test.db', query: 'SELECT 1' },
        loc: makeLoc(),
      }],
      sourceMap: { source: '', filePath: '', lineOffsets: [] },
    };

    const errors = validateStructural(ast);
    expect(errors).toHaveLength(0);
  });

  test('rejects database source without connection', () => {
    const ast = {
      metadata: { name: 'test', version: '1.0.0' },
      nodes: [{
        type: 'source',
        id: 'db-read',
        sourceType: 'database',
        config: { query: 'SELECT 1' },
        loc: makeLoc(),
      }],
      sourceMap: { source: '', filePath: '', lineOffsets: [] },
    };

    const errors = validateStructural(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: any) => e.message.includes('connection'))).toBe(true);
  });

  test('rejects database source without query', () => {
    const ast = {
      metadata: { name: 'test', version: '1.0.0' },
      nodes: [{
        type: 'source',
        id: 'db-read',
        sourceType: 'database',
        config: { connection: 'sqlite:///test.db' },
        loc: makeLoc(),
      }],
      sourceMap: { source: '', filePath: '', lineOffsets: [] },
    };

    const errors = validateStructural(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: any) => e.message.includes('query'))).toBe(true);
  });

  test('rejects database sink without table', () => {
    const ast = {
      metadata: { name: 'test', version: '1.0.0' },
      nodes: [{
        type: 'sink',
        id: 'db-write',
        sinkType: 'database',
        config: { connection: 'sqlite:///test.db' },
        loc: makeLoc(),
      }],
      sourceMap: { source: '', filePath: '', lineOffsets: [] },
    };

    const errors = validateStructural(ast);
    // Should have error for missing table (and warning for missing input)
    expect(errors.some((e: any) => e.message.includes('table'))).toBe(true);
  });
});
