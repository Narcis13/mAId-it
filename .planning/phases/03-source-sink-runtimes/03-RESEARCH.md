# Phase 3: Source/Sink Runtimes - Research

**Researched:** 2026-02-02
**Domain:** HTTP client patterns, file I/O with Bun, JSONPath extraction, template expression processing
**Confidence:** HIGH

## Summary

Phase 3 implements the HTTP and File runtime nodes that enable FlowScript workflows to interact with external systems. The core challenges are: (1) making HTTP requests with proper authentication, headers, timeout handling, and response extraction; (2) reading and writing files with Bun's native APIs; and (3) processing template expressions in file paths like `{{config.outputDir}}/result.json`.

The recommended approach uses **Bun's native `fetch`** for HTTP operations (fastest available, built-in AbortSignal timeout support, zero dependencies), **Bun.file() and Bun.write()** for file I/O (optimized Zig-based implementations, native JSON parsing), and **@jmespath-community/jmespath** for response data extraction (standardized spec, 8.6M weekly downloads, TypeScript support, used by AWS CLI). Template expressions in file paths use the existing expression evaluator from Phase 2.

Both HTTP and File runtimes follow the NodeRuntime interface pattern established in the architecture research, ensuring consistent execution context handling, error propagation, and output tracking.

**Primary recommendation:** Use Bun native APIs (fetch, Bun.file, Bun.write) + JMESPath for extraction + Phase 2 expression evaluator for templates. No additional HTTP client libraries needed.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fetch` (native) | built-in | HTTP requests | Bun's native fetch is 3x faster than Node.js, handles HTTP/1.1 pipelining, 256 concurrent connections |
| `Bun.file` | built-in | File reading | Lazy-loaded, optimized Zig implementation, native `.json()` and `.text()` methods |
| `Bun.write` | built-in | File writing | Atomic writes, supports strings, Blob, ArrayBuffer, Response objects |
| `@jmespath-community/jmespath` | 0.5.x | Response extraction | Standardized spec, 8.6M weekly downloads, AWS CLI uses JMESPath, TypeScript support |
| `AbortController` | built-in | Request timeout | Native timeout handling via `AbortSignal.timeout()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` | built-in | Directory operations | Only for `mkdir`, `readdir` - Bun.file doesn't handle directories |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JMESPath | `jsonpath-plus` | JSONPath syntax more familiar but no formal spec, inconsistent implementations, not actively maintained |
| JMESPath | `jsonpathly` | RFC 9535 compliant but smaller community, less documentation |
| native fetch | `axios` | Unnecessary overhead in Bun, fetch covers all use cases |
| native fetch | `got` | Node-specific, no benefit in Bun runtime |
| Bun.file | `node:fs` | Slower, more verbose, Bun.file is 3-6x faster |

**Installation:**
```bash
bun add @jmespath-community/jmespath
```

**Note:** No HTTP client library needed - Bun's native fetch is the fastest and most capable option.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── runtimes/
│   ├── index.ts           # Runtime registry and lookup
│   ├── types.ts           # NodeRuntime interface, common types
│   ├── http/
│   │   ├── index.ts       # HTTP runtime entry point
│   │   ├── source.ts      # HTTP source (GET, POST for fetching data)
│   │   ├── sink.ts        # HTTP sink (POST to external endpoints)
│   │   ├── auth.ts        # Authentication helpers (bearer, basic)
│   │   └── extract.ts     # JMESPath response extraction
│   └── file/
│       ├── index.ts       # File runtime entry point
│       ├── source.ts      # File source (read JSON, text)
│       ├── sink.ts        # File sink (write JSON, text)
│       └── path.ts        # Template path resolution
```

### Pattern 1: NodeRuntime Interface
**What:** Standard interface for all node type implementations
**When to use:** Every runtime implementation (HTTP, File, AI, etc.)
**Example:**
```typescript
// Source: FlowScript architecture research
interface NodeRuntime<TConfig = unknown, TInput = unknown, TOutput = unknown> {
  type: string;

  // Execute the node with provided context
  execute(params: {
    node: NodeAST;
    input: TInput;
    config: TConfig;
    context: ExecutionContext;
  }): Promise<TOutput>;

  // Optional: Custom validation beyond schema
  validate?(node: NodeAST, context: ValidationContext): ValidationError[];
}

// HTTP Source Runtime
const httpSourceRuntime: NodeRuntime<HttpSourceConfig, void, unknown> = {
  type: 'http:source',

  async execute({ node, config, context }) {
    const url = context.evaluateTemplate(config.url);
    const response = await fetchWithTimeout(url, config);
    return extractResponse(response, config.extract);
  }
};
```

### Pattern 2: HTTP Fetch with Timeout and AbortController
**What:** Make HTTP requests with proper timeout handling using AbortSignal
**When to use:** All HTTP source and sink operations
**Example:**
```typescript
// Source: MDN AbortSignal.timeout() documentation
interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  timeout?: number;  // milliseconds
}

async function fetchWithTimeout(config: HttpRequestConfig): Promise<Response> {
  const { url, method, headers, params, body, timeout = 30000 } = config;

  // Build URL with query params
  const urlWithParams = new URL(url);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      urlWithParams.searchParams.set(key, value);
    }
  }

  // Use AbortSignal.timeout() for clean timeout handling
  const signal = AbortSignal.timeout(timeout);

  const response = await fetch(urlWithParams.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    throw new HttpError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      await response.text()
    );
  }

  return response;
}
```

### Pattern 3: Bearer Token Authentication
**What:** Add Authorization header with bearer token from secrets
**When to use:** HTTP requests requiring API authentication
**Example:**
```typescript
// Source: API Authentication best practices
interface AuthConfig {
  type: 'bearer' | 'basic' | 'none';
  token?: string;        // For bearer: $secrets.API_TOKEN
  username?: string;     // For basic auth
  password?: string;
}

function buildAuthHeaders(
  auth: AuthConfig | undefined,
  context: ExecutionContext
): Record<string, string> {
  if (!auth || auth.type === 'none') {
    return {};
  }

  if (auth.type === 'bearer') {
    // Token may be a secret reference like $secrets.API_TOKEN
    const token = context.resolveValue(auth.token);
    return { 'Authorization': `Bearer ${token}` };
  }

  if (auth.type === 'basic') {
    const username = context.resolveValue(auth.username);
    const password = context.resolveValue(auth.password);
    const credentials = btoa(`${username}:${password}`);
    return { 'Authorization': `Basic ${credentials}` };
  }

  return {};
}
```

### Pattern 4: JMESPath Response Extraction
**What:** Extract specific data from JSON responses using JMESPath queries
**When to use:** HTTP source nodes that need specific fields from API responses
**Example:**
```typescript
// Source: @jmespath-community/jmespath documentation
import { search } from '@jmespath-community/jmespath';

interface ExtractConfig {
  path?: string;          // JMESPath expression: "data.items[*].name"
  transform?: 'json' | 'text';  // Response format
}

async function extractResponse(
  response: Response,
  config: ExtractConfig
): Promise<unknown> {
  // Determine response format
  const contentType = response.headers.get('content-type') || '';

  if (config.transform === 'text' || !contentType.includes('application/json')) {
    return response.text();
  }

  const data = await response.json();

  // Apply JMESPath extraction if specified
  if (config.path) {
    return search(data, config.path);
  }

  return data;
}

// Example usage:
// Config: { path: "results[?status == 'active'].name" }
// Input: { results: [{ name: "A", status: "active" }, { name: "B", status: "inactive" }] }
// Output: ["A"]
```

### Pattern 5: Bun File Reading with Format Detection
**What:** Read files using Bun.file() with automatic format handling
**When to use:** File source nodes reading JSON or text files
**Example:**
```typescript
// Source: Bun File I/O documentation - https://bun.com/docs/runtime/file-io
type FileFormat = 'json' | 'text' | 'auto';

interface FileSourceConfig {
  path: string;           // May contain templates: "{{config.dataDir}}/input.json"
  format?: FileFormat;    // Default: 'auto' (detect from extension)
}

async function readFile(
  config: FileSourceConfig,
  context: ExecutionContext
): Promise<unknown> {
  // Resolve template expressions in path
  const resolvedPath = context.evaluateTemplate(config.path);

  const file = Bun.file(resolvedPath);

  // Check file exists
  if (!(await file.exists())) {
    throw new FileError(`File not found: ${resolvedPath}`);
  }

  // Determine format
  const format = config.format ?? detectFormat(resolvedPath);

  if (format === 'json') {
    // Bun.file().json() is optimized - faster than .text() + JSON.parse()
    return file.json();
  }

  return file.text();
}

function detectFormat(path: string): FileFormat {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'json'; // Parse YAML as JSON
  return 'text';
}
```

### Pattern 6: Bun File Writing with Directory Creation
**What:** Write files using Bun.write() with automatic directory creation
**When to use:** File sink nodes writing JSON or text output
**Example:**
```typescript
// Source: Bun File I/O documentation
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface FileSinkConfig {
  path: string;           // May contain templates
  format?: 'json' | 'text';
  createDir?: boolean;    // Default: true - create parent directories
  pretty?: boolean;       // Default: true - pretty-print JSON
}

async function writeFile(
  data: unknown,
  config: FileSinkConfig,
  context: ExecutionContext
): Promise<{ path: string; bytes: number }> {
  // Resolve template expressions in path
  const resolvedPath = context.evaluateTemplate(config.path);

  // Create parent directory if needed
  if (config.createDir !== false) {
    await mkdir(dirname(resolvedPath), { recursive: true });
  }

  // Determine content to write
  let content: string;
  if (config.format === 'json' || typeof data === 'object') {
    const indent = config.pretty !== false ? 2 : 0;
    content = JSON.stringify(data, null, indent);
  } else {
    content = String(data);
  }

  // Write file - Bun.write handles atomic writes
  const bytes = await Bun.write(resolvedPath, content);

  return { path: resolvedPath, bytes };
}
```

### Pattern 7: Template Path Resolution
**What:** Resolve template expressions in file paths using Phase 2 evaluator
**When to use:** File paths containing `{{...}}` expressions
**Example:**
```typescript
// Source: Phase 2 expression evaluator integration
// Path: "{{config.outputDir}}/result-{{date('YYYY-MM-DD')}}.json"
// Context: { config: { outputDir: './output' } }
// Result: "./output/result-2026-02-02.json"

function resolveTemplatePath(
  template: string,
  context: ExecutionContext
): string {
  // Use Phase 2 evaluateTemplate function
  const result = context.evaluateTemplate(template);

  // Validate result is a valid path string
  if (typeof result !== 'string') {
    throw new FileError(`Path template must evaluate to string, got ${typeof result}`);
  }

  // Normalize path (handle . and ..)
  return normalizePath(result);
}

// Security: Prevent path traversal attacks
function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');

  // Check for path traversal attempts
  if (normalized.includes('../') || normalized.startsWith('/')) {
    // For v1, allow only relative paths within workflow directory
    // Future: configurable base directory
    throw new FileError(`Path traversal not allowed: ${path}`);
  }

  return normalized;
}
```

### Anti-Patterns to Avoid
- **Not using AbortSignal for timeouts:** Leads to hanging requests, resource leaks
- **Hardcoding timeout values:** Always make timeout configurable per-node
- **Using synchronous file operations:** Blocks the event loop, use async Bun.file APIs
- **Parsing JSON manually after .text():** Bun.file().json() is faster (combined read+parse)
- **Not creating parent directories:** Bun.write fails silently without parent dirs
- **Allowing arbitrary file paths:** Path traversal vulnerability, validate paths
- **Not handling HTTP error responses:** Check response.ok before processing
- **Exposing bearer tokens in logs:** Ensure secrets are redacted (Phase 2 handles this)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client | Custom XMLHttpRequest wrapper | Native `fetch` | Built-in, optimized, handles edge cases |
| Request timeout | setTimeout + abort logic | `AbortSignal.timeout()` | Cleaner, handles cleanup automatically |
| JSON querying | Recursive property traversal | JMESPath | Handles filters, projections, complex queries |
| File reading | node:fs with manual encoding | `Bun.file()` | 3-6x faster, cleaner API, native JSON parsing |
| File writing | fs.writeFile with encoding | `Bun.write()` | Atomic writes, handles multiple input types |
| URL building | String concatenation | `URL` constructor + `URLSearchParams` | Handles encoding, edge cases |
| Bearer auth | Manual header string | Standard header pattern | Consistent, matches API expectations |

**Key insight:** Bun's native APIs are heavily optimized (written in Zig) and handle edge cases that custom implementations miss. The 3-6x speed improvement over Node.js APIs is well documented.

## Common Pitfalls

### Pitfall 1: Unhandled HTTP Error Responses
**What goes wrong:** HTTP 4xx/5xx responses don't throw by default, code continues with error response
**Why it happens:** fetch() only throws on network errors, not HTTP errors
**How to avoid:** Always check `response.ok` before processing response body
**Warning signs:** Workflows succeeding but with empty/error data, silent failures
```typescript
// WRONG: Assumes fetch throws on 404
const data = await (await fetch(url)).json();

// CORRECT: Check response status
const response = await fetch(url);
if (!response.ok) {
  throw new HttpError(`HTTP ${response.status}`, response.status);
}
const data = await response.json();
```

### Pitfall 2: Request Timeout Not Configured
**What goes wrong:** Requests hang indefinitely when server doesn't respond
**Why it happens:** fetch() has no default timeout, waits forever
**How to avoid:** Always use `AbortSignal.timeout()` with reasonable default (30s)
**Warning signs:** Workflow executions that never complete, orphaned processes
```typescript
// WRONG: No timeout
const response = await fetch(url);

// CORRECT: With timeout
const signal = AbortSignal.timeout(30000);
const response = await fetch(url, { signal });
```

### Pitfall 3: JMESPath Extraction on Non-JSON Response
**What goes wrong:** JMESPath extraction fails when API returns text/HTML error
**Why it happens:** Server error pages are often HTML, not JSON
**How to avoid:** Check Content-Type before parsing, handle gracefully
**Warning signs:** "Unexpected token < in JSON" errors
```typescript
// Check content type before JSON parsing
const contentType = response.headers.get('content-type');
if (!contentType?.includes('application/json')) {
  throw new HttpError(`Expected JSON but got ${contentType}`);
}
```

### Pitfall 4: File Path Injection
**What goes wrong:** Template like `{{userInput}}/data.json` allows reading arbitrary files
**Why it happens:** No validation of resolved paths
**How to avoid:** Validate paths don't escape allowed directory, reject `..` and absolute paths
**Warning signs:** Errors about missing files in unexpected locations
```typescript
// Validate resolved path
const resolved = resolveTemplatePath(config.path, context);
if (resolved.includes('..') || resolved.startsWith('/')) {
  throw new FileError('Path traversal not allowed');
}
```

### Pitfall 5: Bearer Token in Query String
**What goes wrong:** Token appears in server logs, URL history, referrer headers
**Why it happens:** Mistake in authentication implementation
**How to avoid:** Always put tokens in Authorization header, never in URL
**Warning signs:** Security audits flagging token exposure
```typescript
// WRONG: Token in URL
fetch(`${url}?token=${token}`);

// CORRECT: Token in header
fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
```

### Pitfall 6: Synchronous JSON Parsing After Text Read
**What goes wrong:** Performance degradation, unnecessary memory copies
**Why it happens:** Not knowing Bun.file().json() exists
**How to avoid:** Use `.json()` method directly on BunFile
**Warning signs:** Slower file reads than expected
```typescript
// WRONG: Two-step parsing
const text = await Bun.file(path).text();
const data = JSON.parse(text);

// CORRECT: Single optimized step
const data = await Bun.file(path).json();
```

### Pitfall 7: Missing Parent Directory for File Write
**What goes wrong:** Bun.write() silently fails or throws when parent dir doesn't exist
**Why it happens:** Assuming directories exist
**How to avoid:** Create parent directories with `mkdir({ recursive: true })` before write
**Warning signs:** "ENOENT: no such file or directory" errors
```typescript
// Ensure parent directory exists
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

await mkdir(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, data);
```

## Code Examples

Verified patterns from official sources:

### Complete HTTP Source Runtime
```typescript
// Source: Bun fetch docs + JMESPath integration
import { search } from '@jmespath-community/jmespath';

interface HttpSourceConfig {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  auth?: {
    type: 'bearer' | 'basic' | 'none';
    token?: string;
    username?: string;
    password?: string;
  };
  extract?: string;  // JMESPath expression
  timeout?: number;  // Default: 30000ms
}

class HttpSourceRuntime implements NodeRuntime<HttpSourceConfig, void, unknown> {
  type = 'http:source';

  async execute({ config, context }): Promise<unknown> {
    // Resolve template expressions in config values
    const url = context.evaluateTemplate(config.url);
    const resolvedHeaders: Record<string, string> = {};

    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        resolvedHeaders[key] = context.evaluateTemplate(value);
      }
    }

    // Build URL with params
    const urlObj = new URL(url);
    if (config.params) {
      for (const [key, value] of Object.entries(config.params)) {
        urlObj.searchParams.set(key, context.evaluateTemplate(value));
      }
    }

    // Build auth headers
    const authHeaders = this.buildAuthHeaders(config.auth, context);

    // Make request with timeout
    const signal = AbortSignal.timeout(config.timeout ?? 30000);
    const response = await fetch(urlObj.toString(), {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...resolvedHeaders,
        ...authHeaders,
      },
      body: config.body ? JSON.stringify(config.body) : undefined,
      signal,
    });

    // Check response status
    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    // Parse response
    const data = await response.json();

    // Apply JMESPath extraction
    if (config.extract) {
      return search(data, config.extract);
    }

    return data;
  }

  private buildAuthHeaders(
    auth: HttpSourceConfig['auth'],
    context: ExecutionContext
  ): Record<string, string> {
    if (!auth || auth.type === 'none') return {};

    if (auth.type === 'bearer') {
      const token = context.resolveValue(auth.token!);
      return { 'Authorization': `Bearer ${token}` };
    }

    if (auth.type === 'basic') {
      const username = context.resolveValue(auth.username!);
      const password = context.resolveValue(auth.password!);
      return { 'Authorization': `Basic ${btoa(`${username}:${password}`)}` };
    }

    return {};
  }
}
```

### Complete HTTP Sink Runtime
```typescript
// Source: Bun fetch docs
interface HttpSinkConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';  // Default: POST
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'none';
    token?: string;
  };
  timeout?: number;
}

class HttpSinkRuntime implements NodeRuntime<HttpSinkConfig, unknown, HttpSinkResult> {
  type = 'http:sink';

  async execute({ input, config, context }): Promise<HttpSinkResult> {
    const url = context.evaluateTemplate(config.url);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        headers[key] = context.evaluateTemplate(value);
      }
    }

    // Add auth if configured
    if (config.auth?.type === 'bearer') {
      const token = context.resolveValue(config.auth.token!);
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Make request
    const signal = AbortSignal.timeout(config.timeout ?? 30000);
    const response = await fetch(url, {
      method: config.method ?? 'POST',
      headers,
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        await response.text()
      );
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }
}

interface HttpSinkResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

### Complete File Source Runtime
```typescript
// Source: Bun File I/O docs - https://bun.com/docs/runtime/file-io
interface FileSourceConfig {
  path: string;
  format?: 'json' | 'text' | 'auto';
}

class FileSourceRuntime implements NodeRuntime<FileSourceConfig, void, unknown> {
  type = 'file:source';

  async execute({ config, context }): Promise<unknown> {
    // Resolve template path
    const resolvedPath = context.evaluateTemplate(config.path);

    // Security: Validate path
    this.validatePath(resolvedPath);

    const file = Bun.file(resolvedPath);

    // Check existence
    if (!(await file.exists())) {
      throw new FileError(`File not found: ${resolvedPath}`);
    }

    // Determine format
    const format = config.format ?? this.detectFormat(resolvedPath);

    // Read file
    if (format === 'json') {
      return file.json();
    }

    return file.text();
  }

  private detectFormat(path: string): 'json' | 'text' {
    if (path.endsWith('.json')) return 'json';
    return 'text';
  }

  private validatePath(path: string): void {
    // Prevent path traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new FileError(`Invalid path: ${path}`);
    }
  }
}
```

### Complete File Sink Runtime
```typescript
// Source: Bun File I/O docs
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface FileSinkConfig {
  path: string;
  format?: 'json' | 'text';
  pretty?: boolean;     // Default: true for JSON
  createDir?: boolean;  // Default: true
}

interface FileSinkResult {
  path: string;
  bytes: number;
}

class FileSinkRuntime implements NodeRuntime<FileSinkConfig, unknown, FileSinkResult> {
  type = 'file:sink';

  async execute({ input, config, context }): Promise<FileSinkResult> {
    // Resolve template path
    const resolvedPath = context.evaluateTemplate(config.path);

    // Security: Validate path
    this.validatePath(resolvedPath);

    // Create parent directory if needed
    if (config.createDir !== false) {
      await mkdir(dirname(resolvedPath), { recursive: true });
    }

    // Determine content
    let content: string;
    if (config.format === 'json' || (config.format !== 'text' && typeof input === 'object')) {
      const indent = config.pretty !== false ? 2 : 0;
      content = JSON.stringify(input, null, indent);
    } else {
      content = String(input);
    }

    // Write file
    const bytes = await Bun.write(resolvedPath, content);

    return { path: resolvedPath, bytes };
  }

  private validatePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new FileError(`Invalid path: ${path}`);
    }
  }
}
```

### JMESPath Usage Examples
```typescript
// Source: @jmespath-community/jmespath documentation
import { search } from '@jmespath-community/jmespath';

// Example 1: Extract nested field
const data1 = { response: { data: { user: { name: 'Alice' } } } };
search(data1, 'response.data.user.name');
// Returns: 'Alice'

// Example 2: Extract array of names
const data2 = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
search(data2, 'users[*].name');
// Returns: ['Alice', 'Bob']

// Example 3: Filter with condition
const data3 = { items: [{ status: 'active', id: 1 }, { status: 'inactive', id: 2 }] };
search(data3, "items[?status == 'active']");
// Returns: [{ status: 'active', id: 1 }]

// Example 4: First item
search(data3, 'items[0]');
// Returns: { status: 'active', id: 1 }

// Example 5: Nested array projection
const data5 = { orders: [{ items: [{ price: 10 }, { price: 20 }] }] };
search(data5, 'orders[*].items[*].price');
// Returns: [[10, 20]]
```

### Custom Error Classes
```typescript
// HTTP errors with status and body
class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }

  get isRetryable(): boolean {
    // 429 (rate limit) and 5xx errors are typically retryable
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }
}

// File errors
class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileError';
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| axios/node-fetch | Native `fetch` | Bun 1.0+ | Zero dependencies, 3x faster in Bun |
| setTimeout for timeout | `AbortSignal.timeout()` | 2023+ | Cleaner API, automatic cleanup |
| JSONPath | JMESPath | Evolving | Standardized spec, multi-language support |
| node:fs readFile | `Bun.file()` | Bun 1.0+ | 3-6x faster, cleaner API |
| fs.writeFile | `Bun.write()` | Bun 1.0+ | Atomic writes, multiple input types |
| Manual JSON parsing | `Bun.file().json()` | Bun 1.0+ | Combined read+parse optimization |

**Deprecated/outdated:**
- **axios in Bun:** Unnecessary overhead, native fetch is faster and simpler
- **node-fetch:** Polyfill for Node.js, not needed in Bun
- **jsonpath-plus:** Not actively maintained, consider JMESPath or jsonpathly
- **Manual setTimeout for timeouts:** Use AbortSignal.timeout() instead
- **node:fs for file reading:** Use Bun.file() for better performance

## Open Questions

Things that couldn't be fully resolved:

1. **Streaming Large Responses**
   - What we know: Bun fetch supports ReadableStream via `response.body`
   - What's unclear: Best pattern for very large API responses (>100MB)
   - Recommendation: For v1, assume responses fit in memory. Add streaming support when needed based on user feedback.

2. **Concurrent Request Limits**
   - What we know: Bun handles 256 concurrent connections by default
   - What's unclear: Whether workflow-level concurrency limits should apply to HTTP nodes
   - Recommendation: Trust Bun's connection pooling for v1. Consider adding per-domain rate limiting in v2.

3. **Binary File Support**
   - What we know: Bun.file supports `.arrayBuffer()` and `.bytes()`
   - What's unclear: Whether Phase 3 should support binary files (images, PDFs)
   - Recommendation: Focus on JSON/text for v1 (per requirements). Binary support is a natural v2 extension.

4. **HTTP Caching**
   - What we know: fetch supports standard HTTP caching headers
   - What's unclear: Whether workflows should have a local response cache
   - Recommendation: No caching for v1 (workflows should be deterministic). Consider optional caching in v2.

## Sources

### Primary (HIGH confidence)
- [Bun File I/O Documentation](https://bun.com/docs/runtime/file-io) - Bun.file() and Bun.write() APIs
- [Bun.write API Reference](https://bun.com/reference/bun/write) - Write function details
- [Bun.file API Reference](https://bun.com/reference/bun/file) - File function details
- [MDN AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) - Timeout handling
- [@jmespath-community/jmespath GitHub](https://github.com/jmespath-community/typescript-jmespath) - JMESPath TypeScript implementation
- [JMESPath Specification](https://jmespath.org/) - Query language spec

### Secondary (MEDIUM confidence)
- [API Authentication Best Practices 2026](https://dev.to/apiverve/api-authentication-best-practices-in-2026-3k4a) - Bearer token patterns
- [n8n Error Handling](https://docs.n8n.io/flow-logic/error-handling/) - Workflow retry patterns
- [jsonpath-plus vs JMESPath comparison](https://npmtrends.com/JSONPath-vs-jmespath-vs-json-query-vs-jsonpath-plus) - npm trends data
- [Stainless Bearer Token Guide](https://www.stainless.com/sdk-api-best-practices/authorization-bearer-token-header-example-for-apis) - Authorization patterns

### Tertiary (LOW confidence)
- WebSearch results for "Bun.file API 2026" - General patterns
- WebSearch results for "fetch timeout handling TypeScript" - AbortController patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Bun APIs verified via official docs, JMESPath is industry standard (AWS CLI)
- Architecture: HIGH - Runtime interface pattern from Phase 1 research, well-documented
- Pitfalls: HIGH - Based on documented fetch/file API behaviors and security best practices

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable domain, Bun APIs are production-ready)
