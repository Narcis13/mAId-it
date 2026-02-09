/**
 * Tests for Batch 8: New Sink/Source Types
 *
 * 8.1 Email sink runtime (SendGrid)
 * 8.2 CSV/YAML file format support
 * 8.3 HTTP PUT/DELETE methods
 * 8.4 OAuth2 authentication
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { parseCSV, toCSV } from './file/csv';
import { parseYAML, toYAML } from './file/yaml';
import { detectFormat } from './file/path';
import { clearAllOAuth2Tokens } from './http/auth';
import type { EmailSinkConfig, EmailSinkResult, HttpSourceConfig, HttpSinkConfig, AuthConfig } from './types';
import type { ExecutionState } from '../execution/types';
import type { NodeAST } from '../types/ast';
import { join } from 'path';
import { mkdir, rm } from 'node:fs/promises';

// ============================================================================
// Test Helpers
// ============================================================================

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    workflowId: 'test',
    runId: 'run-1',
    currentWave: 0,
    nodeContext: {},
    nodeResults: new Map(),
    completedNodes: new Set(),
    errors: [],
    secrets: {},
    ...overrides,
  } as ExecutionState;
}

function makeNode(id: string, overrides: Partial<NodeAST> = {}): NodeAST {
  return {
    id,
    type: 'sink',
    category: 'sink',
    config: {},
    ...overrides,
  } as NodeAST;
}

// ============================================================================
// 8.2 CSV Parsing/Serialization
// ============================================================================

describe('CSV parsing', () => {
  test('parses simple CSV', () => {
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
    const result = parseCSV(csv);
    expect(result).toEqual([
      { name: 'Alice', age: '30', city: 'NYC' },
      { name: 'Bob', age: '25', city: 'LA' },
    ]);
  });

  test('handles quoted fields with commas', () => {
    const csv = 'name,address\n"Smith, John","123 Main St"';
    const result = parseCSV(csv);
    expect(result).toEqual([
      { name: 'Smith, John', address: '123 Main St' },
    ]);
  });

  test('handles escaped quotes', () => {
    const csv = 'name,note\nAlice,"She said ""hello"""';
    const result = parseCSV(csv);
    expect(result).toEqual([
      { name: 'Alice', note: 'She said "hello"' },
    ]);
  });

  test('returns empty array for empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  test('handles missing values', () => {
    const csv = 'a,b,c\n1,,3';
    const result = parseCSV(csv);
    expect(result).toEqual([{ a: '1', b: '', c: '3' }]);
  });
});

describe('CSV serialization', () => {
  test('serializes array of objects', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const csv = toCSV(data);
    expect(csv).toBe('name,age\nAlice,30\nBob,25');
  });

  test('escapes fields with commas', () => {
    const data = [{ name: 'Smith, John', city: 'NYC' }];
    const csv = toCSV(data);
    expect(csv).toBe('name,city\n"Smith, John",NYC');
  });

  test('returns empty string for empty array', () => {
    expect(toCSV([])).toBe('');
  });

  test('returns empty string for non-array', () => {
    expect(toCSV('hello')).toBe('');
  });
});

// ============================================================================
// 8.2 YAML Parsing/Serialization
// ============================================================================

describe('YAML parsing', () => {
  test('parses YAML object', () => {
    const yaml = 'name: Alice\nage: 30';
    const result = parseYAML(yaml) as Record<string, unknown>;
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  test('parses YAML array', () => {
    const yaml = '- one\n- two\n- three';
    const result = parseYAML(yaml);
    expect(result).toEqual(['one', 'two', 'three']);
  });

  test('parses nested YAML', () => {
    const yaml = 'user:\n  name: Alice\n  roles:\n    - admin\n    - editor';
    const result = parseYAML(yaml) as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe('Alice');
    expect(user.roles).toEqual(['admin', 'editor']);
  });
});

describe('YAML serialization', () => {
  test('serializes object to YAML', () => {
    const data = { name: 'Alice', age: 30 };
    const yaml = toYAML(data);
    expect(yaml).toContain('name: Alice');
    expect(yaml).toContain('age: 30');
  });

  test('round-trips object through YAML', () => {
    const original = { items: [1, 2, 3], nested: { key: 'value' } };
    const yaml = toYAML(original);
    const parsed = parseYAML(yaml);
    expect(parsed).toEqual(original);
  });
});

// ============================================================================
// 8.2 Format Detection
// ============================================================================

describe('detectFormat', () => {
  test('detects JSON', () => {
    expect(detectFormat('data.json')).toBe('json');
    expect(detectFormat('data.JSON')).toBe('json');
  });

  test('detects CSV', () => {
    expect(detectFormat('data.csv')).toBe('csv');
    expect(detectFormat('data.CSV')).toBe('csv');
  });

  test('detects YAML', () => {
    expect(detectFormat('config.yaml')).toBe('yaml');
    expect(detectFormat('config.yml')).toBe('yaml');
    expect(detectFormat('config.YML')).toBe('yaml');
  });

  test('defaults to text', () => {
    expect(detectFormat('readme.txt')).toBe('text');
    expect(detectFormat('readme.md')).toBe('text');
  });
});

// ============================================================================
// 8.2 File Source/Sink with CSV and YAML
// ============================================================================

describe('File source/sink CSV and YAML', () => {
  const tmpDir = join(process.cwd(), '.test-tmp-batch8');

  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('reads CSV file via file source', async () => {
    const { fileSourceRuntime } = await import('./file/source');
    const csvPath = join(tmpDir, 'test.csv');
    await Bun.write(csvPath, 'name,age\nAlice,30\nBob,25');

    const result = await fileSourceRuntime.execute({
      node: makeNode('csv-source'),
      input: undefined as void,
      config: { path: csvPath, format: 'csv' },
      state: makeState(),
    });

    expect(result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  test('reads YAML file via file source', async () => {
    const { fileSourceRuntime } = await import('./file/source');
    const yamlPath = join(tmpDir, 'test.yaml');
    await Bun.write(yamlPath, 'name: Alice\nage: 30');

    const result = await fileSourceRuntime.execute({
      node: makeNode('yaml-source'),
      input: undefined as void,
      config: { path: yamlPath, format: 'yaml' },
      state: makeState(),
    }) as Record<string, unknown>;

    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  test('auto-detects CSV format from extension', async () => {
    const { fileSourceRuntime } = await import('./file/source');
    const csvPath = join(tmpDir, 'data.csv');
    await Bun.write(csvPath, 'x,y\n1,2');

    const result = await fileSourceRuntime.execute({
      node: makeNode('csv-auto'),
      input: undefined as void,
      config: { path: csvPath },
      state: makeState(),
    });

    expect(result).toEqual([{ x: '1', y: '2' }]);
  });

  test('auto-detects YAML format from extension', async () => {
    const { fileSourceRuntime } = await import('./file/source');
    const yamlPath = join(tmpDir, 'data.yml');
    await Bun.write(yamlPath, 'key: value');

    const result = await fileSourceRuntime.execute({
      node: makeNode('yaml-auto'),
      input: undefined as void,
      config: { path: yamlPath },
      state: makeState(),
    }) as Record<string, unknown>;

    expect(result.key).toBe('value');
  });

  test('writes CSV file via file sink', async () => {
    const { fileSinkRuntime } = await import('./file/sink');
    const csvPath = join(tmpDir, 'output.csv');
    const data = [
      { name: 'Alice', score: 95 },
      { name: 'Bob', score: 87 },
    ];

    await fileSinkRuntime.execute({
      node: makeNode('csv-sink'),
      input: data,
      config: { path: csvPath, format: 'csv' },
      state: makeState(),
    });

    const content = await Bun.file(csvPath).text();
    expect(content).toBe('name,score\nAlice,95\nBob,87');
  });

  test('writes YAML file via file sink', async () => {
    const { fileSinkRuntime } = await import('./file/sink');
    const yamlPath = join(tmpDir, 'output.yaml');
    const data = { name: 'Alice', age: 30 };

    await fileSinkRuntime.execute({
      node: makeNode('yaml-sink'),
      input: data,
      config: { path: yamlPath, format: 'yaml' },
      state: makeState(),
    });

    const content = await Bun.file(yamlPath).text();
    expect(content).toContain('name: Alice');
    expect(content).toContain('age: 30');
  });
});

// ============================================================================
// 8.3 HTTP PUT/DELETE Methods
// ============================================================================

describe('HTTP PUT/DELETE methods', () => {
  test('HTTP source accepts PUT method type', () => {
    const config: HttpSourceConfig = {
      url: 'https://example.com/api',
      method: 'PUT',
    };
    expect(config.method).toBe('PUT');
  });

  test('HTTP source accepts DELETE method type', () => {
    const config: HttpSourceConfig = {
      url: 'https://example.com/api',
      method: 'DELETE',
    };
    expect(config.method).toBe('DELETE');
  });

  test('HTTP sink accepts DELETE method type', () => {
    const config: HttpSinkConfig = {
      url: 'https://example.com/api',
      method: 'DELETE',
    };
    expect(config.method).toBe('DELETE');
  });
});

// ============================================================================
// 8.4 OAuth2 Authentication Types
// ============================================================================

describe('OAuth2 authentication', () => {
  beforeEach(() => {
    clearAllOAuth2Tokens();
  });

  test('AuthConfig accepts oauth2 type', () => {
    const auth: AuthConfig = {
      type: 'oauth2',
      token_url: 'https://auth.example.com/token',
      client_id: 'my-client',
      client_secret: 'my-secret',
      scope: 'read write',
    };
    expect(auth.type).toBe('oauth2');
    expect(auth.token_url).toBe('https://auth.example.com/token');
  });

  test('getOAuth2Token throws without required fields', async () => {
    const { getOAuth2Token } = await import('./http/auth');
    const auth: AuthConfig = { type: 'oauth2' };
    await expect(getOAuth2Token(auth)).rejects.toThrow('OAuth2 requires token_url, client_id, and client_secret');
  });
});

// ============================================================================
// 8.1 Email Sink Types
// ============================================================================

describe('Email sink', () => {
  test('EmailSinkConfig has correct shape', () => {
    const config: EmailSinkConfig = {
      api_key: '{{$secrets.SENDGRID_KEY}}',
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test email',
      html: '<p>Hello</p>',
      text: 'Hello',
    };
    expect(config.api_key).toBe('{{$secrets.SENDGRID_KEY}}');
    expect(config.from).toBe('sender@example.com');
    expect(config.to).toBe('recipient@example.com');
  });

  test('email sink runtime is registered', async () => {
    // Import to trigger registration
    await import('./email/index');
    const { runtimeRegistry } = await import('./registry');
    expect(runtimeRegistry.has('email:sink')).toBe(true);
  });
});

// ============================================================================
// Validator: email sink type accepted
// ============================================================================

describe('Validator accepts email sink', () => {
  function makeWorkflowAST(nodes: NodeAST[]) {
    return {
      metadata: { name: 'test', version: '1.0.0' },
      nodes,
      sourceMap: { lineOffsets: [0] },
    } as any;
  }

  test('email is in valid sink types', async () => {
    const { validateStructural } = await import('../validator/structural');

    const ast = makeWorkflowAST([
      {
        id: 'send-email',
        type: 'sink',
        category: 'sink',
        sinkType: 'email',
        input: 'some-source',
        config: {
          api_key: '{{$secrets.KEY}}',
          from: 'a@b.com',
          to: 'c@d.com',
          subject: 'Hi',
        },
      } as NodeAST,
    ]);

    const errors = validateStructural(ast);
    const sinkTypeErrors = errors.filter((e) => e.message.includes('invalid sink type'));
    expect(sinkTypeErrors).toHaveLength(0);
  });

  test('email sink without api_key is caught', async () => {
    const { validateStructural } = await import('../validator/structural');

    const ast = makeWorkflowAST([
      {
        id: 'send-email',
        type: 'sink',
        category: 'sink',
        sinkType: 'email',
        input: 'some-source',
        config: {
          from: 'a@b.com',
          to: 'c@d.com',
          subject: 'Hi',
        },
      } as NodeAST,
    ]);

    const errors = validateStructural(ast);
    const apiKeyErrors = errors.filter((e) => e.message.includes('api_key'));
    expect(apiKeyErrors).toHaveLength(1);
  });

  test('email sink without to is caught', async () => {
    const { validateStructural } = await import('../validator/structural');

    const ast = makeWorkflowAST([
      {
        id: 'send-email',
        type: 'sink',
        category: 'sink',
        sinkType: 'email',
        input: 'some-source',
        config: {
          api_key: 'key',
          from: 'a@b.com',
          subject: 'Hi',
        },
      } as NodeAST,
    ]);

    const errors = validateStructural(ast);
    const toErrors = errors.filter((e) => e.message.includes('"to"'));
    expect(toErrors).toHaveLength(1);
  });
});
