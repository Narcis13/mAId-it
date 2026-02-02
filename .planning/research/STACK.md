# Stack Research: FlowScript

> Research Date: February 2025
> Target Runtime: Bun (TypeScript)

## Recommended Stack

### Parsing

- **YAML**: `Bun.YAML` (built-in) — native — Bun 1.2.21+ includes a native YAML parser written in Zig. Supports YAML 1.2 spec, hot reloading, and direct ES module imports. No external dependencies needed. Falls back: `yaml` (npm) v2.x for advanced AST manipulation if needed.

- **XML**: `fast-xml-parser` — v5.3.x — Fastest pure-JS XML parser with ~43M weekly downloads. Supports streaming, validation, and both browser/Node environments. 3x faster than xml2js with lower memory overhead.

### Expression Language

**Recommendation: Custom parser with `expression-sandbox` for safe evaluation**

For FlowScript's `{{node.output}}` template syntax, build a custom two-phase approach:

1. **Template parsing**: Use a simple regex/parser to extract `{{...}}` expressions
2. **Safe evaluation**: Use `expression-sandbox` for sandboxed execution

`expression-sandbox` provides:
- No access to global scope
- No `eval()` or `Function()` constructor access
- No property access starting with `_`
- Only returns primitive values
- Cannot modify objects passed in

Alternative: `expr-eval` for math-heavy expressions, `filtrex` for spreadsheet-like expressions.

**Rationale**: Native `eval()` is unsafe for user-provided expressions. A sandboxed evaluator prevents injection attacks while allowing flexible data access patterns.

### DAG Scheduling

**Recommendation: Build custom (200-300 lines)**

Available libraries are either:
- Too heavyweight (Temporal, Dagster)
- Too immature (`@ts-dag/builder` at v0.1.0-alpha.6, 2 years stale)
- Wrong runtime (dagx is Rust)

**Custom implementation pattern:**

```typescript
interface DAGNode {
  id: string;
  dependencies: string[];
  execute: () => Promise<void>;
}

class WaveScheduler {
  // Kahn's algorithm for topological sort
  // Execute nodes in waves (all nodes with satisfied deps run in parallel)
  async execute(nodes: DAGNode[]): Promise<void>;
}
```

This gives you:
- Full control over execution semantics
- Wave-based parallelism with `Promise.all()`
- Custom error handling and retry logic
- Minimal code footprint

**Reference**: `graphology` library for graph data structures if needed.

### Schema Validation

**Recommendation: `zod` — v3.x — TypeScript-first validation**

Zod is the standard for TypeScript projects in 2025:
- Zero dependencies
- Best-in-class TypeScript inference
- Excellent DX with chainable API
- Parse, don't validate paradigm

**Use case fit:**
```typescript
const NodeOutputSchema = z.object({
  data: z.unknown(),
  status: z.enum(['success', 'error']),
});

type NodeOutput = z.infer<typeof NodeOutputSchema>;
```

**Alternative consideration**: `TypeBox` + `ajv` if you need:
- JSON Schema compatibility for external tools
- Maximum performance (10x faster than Zod)
- OpenAPI spec generation

For FlowScript, Zod's DX advantage outweighs TypeBox's performance edge.

### CLI

**Recommendation: `commander` — v12.x — Battle-tested CLI framework**

Commander works with Bun and provides:
- Subcommand support (`flowscript run`, `flowscript validate`)
- Automatic help generation
- Option parsing with types
- Version handling

**Bun compatibility**: Confirmed working. Historical issues (2022) with `child_process` are resolved in current Bun versions targeting Node.js v23 compatibility.

**Alternatives:**
- `Clerc` — Bun-native, full-featured
- `Bluebun` — Zero dependencies, Bun-specific
- `Bunli` — Type-safe CLI with zero config

Commander wins for ecosystem maturity and documentation.

### HTTP

**Recommendation: Native `fetch` — built-in — No library needed**

Bun's native fetch implementation:
- Written in Zig for minimal overhead
- 3x faster than Node.js fetch
- Supports HTTP/1.1 pipelining
- Handles 256 concurrent connections by default
- Native streaming, compression, redirects

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

No external HTTP client library needed.

### State Persistence

**Recommendation: `bun:sqlite` — built-in — File-based persistence**

Bun's native SQLite driver:
- 3-6x faster than better-sqlite3
- 8-9x faster than Deno SQLite
- Synchronous API (no async overhead)
- WAL mode for concurrent access
- Zero dependencies

**Use cases for FlowScript:**
- Execution state tracking
- Run history
- Node output caching
- Workflow metadata

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('flowscript.db');
db.run(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow TEXT,
    status TEXT,
    started_at INTEGER,
    completed_at INTEGER
  )
`);
```

**Alternative**: Plain JSON files via `Bun.write()` for simpler use cases.

---

## Confidence Levels

| Category | Library | Confidence | Reasoning |
|----------|---------|------------|-----------|
| YAML | `Bun.YAML` | **HIGH** | Native, well-documented, no dependencies |
| XML | `fast-xml-parser` | **HIGH** | 43M weekly downloads, actively maintained, fastest option |
| Expression | `expression-sandbox` | **MEDIUM** | Less popular than expr-eval but better security model. Consider building custom if needs are simple. |
| DAG | Custom | **HIGH** | Better to build ~200 lines than adopt immature/heavyweight libraries |
| Schema | `zod` | **HIGH** | Industry standard, TypeScript-first, excellent DX |
| CLI | `commander` | **HIGH** | Proven with Bun, extensive ecosystem |
| HTTP | Native `fetch` | **HIGH** | Built-in, fastest option, well-documented |
| Persistence | `bun:sqlite` | **HIGH** | Native, fastest SQLite driver available |

---

## What NOT to Use

- **xml2js** — Slower than fast-xml-parser, callback-based legacy design, heavier runtime. Only acceptable for legacy integration maintenance.

- **js-yaml** — While functional, Bun's native `Bun.YAML` is faster (Zig-based) and requires no dependency.

- **eval() / new Function()** — Never use for user-provided expressions. Security risk allows arbitrary code execution.

- **Ajv alone** — Verbose JSON Schema syntax, poor TypeScript inference. Only use with TypeBox wrapper if JSON Schema compatibility is required.

- **@ts-dag/builder** — v0.1.0-alpha.6, last updated 2 years ago. Too immature for production.

- **Temporal / Dagster** — Overkill for a file-based workflow engine. These are distributed workflow orchestrators meant for enterprise scale.

- **axios / got / node-fetch** — Unnecessary in Bun. Native fetch is faster and has no dependencies.

- **better-sqlite3** — While excellent for Node.js, Bun's native `bun:sqlite` is 3-6x faster.

- **Yup** — React/form-focused validation. Zod has better TypeScript integration and is more general-purpose.

- **Cliffy** — Designed for Deno, uncertain Bun compatibility.

---

## Package Summary

```json
{
  "dependencies": {
    "fast-xml-parser": "^5.3.0",
    "expression-sandbox": "^2.0.0",
    "zod": "^3.23.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

**Total external dependencies: 4**

Built-ins used (no install needed):
- `Bun.YAML` — YAML parsing
- `fetch` — HTTP client
- `bun:sqlite` — Persistence

---

## Sources

- [Bun YAML Documentation](https://bun.com/docs/runtime/yaml)
- [fast-xml-parser npm](https://www.npmjs.com/package/fast-xml-parser)
- [expression-sandbox GitHub](https://github.com/JoshuaWise/expression-sandbox)
- [Zod vs TypeBox Comparison](https://betterstack.com/community/guides/scaling-nodejs/typebox-vs-zod/)
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite)
- [Bun Fetch Documentation](https://bun.com/docs/runtime/networking/fetch)
- [Commander.js](https://www.npmjs.com/package/commander)
- [Bun Node.js Compatibility](https://bun.com/docs/runtime/nodejs-compat)
