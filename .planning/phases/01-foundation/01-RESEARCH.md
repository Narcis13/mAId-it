# Phase 1: Foundation - Research

**Researched:** 2026-02-02
**Domain:** Parser, Validator, CLI for .flow.md file validation
**Confidence:** HIGH

## Summary

Phase 1 establishes the parsing and validation foundation for FlowScript. The core challenge is parsing a three-part file format (YAML frontmatter, XML body, optional Markdown footer) while preserving source locations for error messages and preventing security vulnerabilities (XXE injection, YAML deserialization attacks).

The recommended approach uses Bun's native YAML parser (safe by default, no object instantiation) for frontmatter, fast-xml-parser with `processEntities: false` for secure XML parsing, and a custom source location tracking layer to convert byte offsets to line/column positions. Validation follows a multi-pass approach: symbol collection, reference resolution, type checking, and graph cycle detection using Kahn's algorithm.

The CLI will use commander.js (proven Bun compatibility) with @babel/code-frame for compiler-style error messages showing source context with carets.

**Primary recommendation:** Use native Bun.YAML + fast-xml-parser (processEntities: false) + custom location tracker + commander + @babel/code-frame for a secure, well-formatted validation experience.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Bun.YAML` | built-in | YAML frontmatter parsing | Native Zig parser, safe by default, no external deps |
| `fast-xml-parser` | 5.3.x | XML body parsing | 43M weekly downloads, fastest pure-JS, active maintenance |
| `commander` | 12.x | CLI framework | Battle-tested, Bun-compatible, full TypeScript support |
| `@babel/code-frame` | 7.27.x | Error formatting | Industry standard for compiler-style error messages |
| `zod` | 3.23.x | Schema validation | TypeScript-first, parse-don't-validate, excellent inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chalk` | 4.x | Terminal colors | Error message colorization (use v4 for CJS compat) |
| `yaml` | 2.8.x | Fallback YAML parser | If Bun.YAML has edge cases with advanced features |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fast-xml-parser` | `sax-wasm` | Has native line/column tracking, but WebAssembly complexity |
| `fast-xml-parser` | `@rgrove/parse-xml` | Safer by default, but slower (253k ops/s vs 127k ops/s benchmarks favor parse-xml actually) |
| `commander` | `Clerc` or `Bluebun` | Bun-native but less mature ecosystem |
| `Bun.YAML` | `yaml` npm package | More features (custom tags), but external dependency |

**Installation:**
```bash
bun add fast-xml-parser commander @babel/code-frame zod chalk@4
bun add -d @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── parser/
│   ├── index.ts           # Main parse() entry point
│   ├── frontmatter.ts     # YAML frontmatter extraction
│   ├── body.ts            # XML body parsing
│   ├── location.ts        # Source location tracking/conversion
│   └── types.ts           # AST node type definitions
├── validator/
│   ├── index.ts           # Main validate() entry point
│   ├── structural.ts      # Required fields, attribute checks
│   ├── references.ts      # Node reference resolution
│   ├── cycles.ts          # Circular dependency detection
│   └── types.ts           # Validation error types
├── cli/
│   ├── index.ts           # CLI entry point
│   ├── validate.ts        # validate command
│   └── format.ts          # Error formatting with code-frame
└── types/
    └── ast.ts             # Shared AST type definitions
```

### Pattern 1: Three-Phase File Parsing
**What:** Split file into sections, parse each independently, merge into unified AST
**When to use:** Always - the .flow.md format has three distinct sections
**Example:**
```typescript
// Source: Custom pattern based on file format spec
interface ParseResult {
  metadata: WorkflowMetadata;  // From YAML frontmatter
  nodes: NodeAST[];            // From XML body
  sourceMap: SourceMap;        // Line/column mappings
}

function parse(source: string, filePath: string): ParseResult {
  const sections = splitSections(source);  // Split on --- delimiters

  const metadata = parseYAMLFrontmatter(sections.frontmatter);
  const { nodes, sourceMap } = parseXMLBody(sections.body, sections.frontmatterLineCount);

  return { metadata, nodes, sourceMap };
}
```

### Pattern 2: Source Location Preservation
**What:** Track byte offsets during parsing, convert to line/column on demand
**When to use:** Every AST node needs location info for error messages
**Example:**
```typescript
// Source: Based on @babel/code-frame and ESLint patterns
interface SourceLocation {
  start: Position;
  end: Position;
}

interface Position {
  line: number;    // 1-indexed
  column: number;  // 0-indexed
  offset: number;  // Byte offset in original source
}

interface ASTNode {
  type: string;
  loc: SourceLocation;
  // ... node-specific properties
}

// Build line offset index once, use for all conversions
function buildLineOffsets(source: string): number[] {
  const offsets = [0];  // Line 1 starts at offset 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function offsetToPosition(offset: number, lineOffsets: number[]): Position {
  let line = 1;
  for (let i = 1; i < lineOffsets.length; i++) {
    if (lineOffsets[i] > offset) break;
    line = i + 1;
  }
  return {
    line,
    column: offset - lineOffsets[line - 1],
    offset
  };
}
```

### Pattern 3: Multi-Pass Validation
**What:** Validate in stages - structural, then references, then semantics
**When to use:** Always - catches errors in logical order for clearest messages
**Example:**
```typescript
// Source: Based on compiler validation patterns
function validate(ast: WorkflowAST): ValidationResult {
  const errors: ValidationError[] = [];

  // Pass 1: Structural validation (required fields, valid attributes)
  const structuralErrors = validateStructure(ast);
  if (structuralErrors.length > 0) {
    return { valid: false, errors: structuralErrors };
  }

  // Pass 2: Build symbol table, check references
  const symbols = buildSymbolTable(ast);
  const referenceErrors = validateReferences(ast, symbols);

  // Pass 3: Check for cycles using Kahn's algorithm
  const cycleErrors = detectCycles(ast, symbols);

  // Pass 4: Semantic validation (types, constraints)
  const semanticErrors = validateSemantics(ast, symbols);

  return {
    valid: errors.length === 0,
    errors: [...referenceErrors, ...cycleErrors, ...semanticErrors]
  };
}
```

### Pattern 4: Kahn's Algorithm for Cycle Detection
**What:** Topological sort that fails when cycles exist
**When to use:** Detecting circular dependencies in workflow DAG
**Example:**
```typescript
// Source: Kahn (1962), standard algorithm
interface Graph {
  nodes: Set<string>;
  edges: Map<string, string[]>;  // node -> dependencies
}

function detectCycles(graph: Graph): string[] | null {
  const inDegree = new Map<string, number>();
  const reverseEdges = new Map<string, string[]>();

  // Initialize in-degree counts
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
    reverseEdges.set(node, []);
  }

  // Count incoming edges
  for (const [node, deps] of graph.edges) {
    for (const dep of deps) {
      inDegree.set(node, (inDegree.get(node) || 0) + 1);
      reverseEdges.get(dep)?.push(node);
    }
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const dependent of reverseEdges.get(node) || []) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  // If not all nodes processed, cycles exist
  if (sorted.length < graph.nodes.size) {
    const cycleNodes = [...graph.nodes].filter(n => !sorted.includes(n));
    return cycleNodes;
  }

  return null;  // No cycles
}
```

### Anti-Patterns to Avoid
- **Parsing XML with DTD processing enabled:** Opens XXE vulnerabilities - always set `processEntities: false`
- **Using `eval()` or `new Function()` for expressions:** Security risk - use sandboxed evaluator
- **Single-pass validation:** Produces confusing error cascades - validate in stages
- **Line-by-line parsing for error locations:** Slow and complex - use byte offset conversion
- **Concatenating user input into error messages:** XSS risk in web contexts - sanitize always

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing | Custom parser | `Bun.YAML` | YAML spec is complex, edge cases in anchors, multi-doc |
| XML parsing | Custom parser | `fast-xml-parser` | Namespace handling, entity escaping, malformed input |
| CLI argument parsing | Manual `process.argv` | `commander` | Subcommands, help generation, validation |
| Error formatting with source | String concatenation | `@babel/code-frame` | Handles tabs, Unicode, syntax highlighting |
| Schema validation | Manual type checks | `zod` | Nested objects, transforms, inference, clear errors |
| Cycle detection | DFS with visited set | Kahn's algorithm | Standard, O(V+E), identifies all cycle participants |

**Key insight:** The parsing domain has decades of security research. Every custom parser is a potential vulnerability. Use battle-tested libraries with safe defaults.

## Common Pitfalls

### Pitfall 1: XXE Injection via XML Parsing
**What goes wrong:** XML parser processes external entities, allowing file disclosure or SSRF
**Why it happens:** Most XML parsers enable DTD/entity processing by default
**How to avoid:** Always configure parser with `processEntities: false`, disable DTD
**Warning signs:** Seeing `<!DOCTYPE` or `<!ENTITY` in error messages, file access errors during parsing
```typescript
// SECURE configuration for fast-xml-parser
const parser = new XMLParser({
  processEntities: false,      // CRITICAL: Prevents XXE
  ignoreAttributes: false,     // We need attributes
  parseTagValue: false,        // Don't auto-convert values
  trimValues: true
});
```

### Pitfall 2: YAML Deserialization Attacks
**What goes wrong:** YAML parser instantiates arbitrary objects from custom tags
**Why it happens:** YAML 1.1 supports language-specific type tags that can trigger code execution
**How to avoid:** Use Bun.YAML (safe by default) or yaml package with strict schema
**Warning signs:** `!!python/object` or similar tags in input, unexpected constructor calls
```typescript
// Bun.YAML is safe by default - no object instantiation
const config = Bun.YAML.parse(frontmatter);

// If using 'yaml' package as fallback, use core schema
import { parse } from 'yaml';
const config = parse(frontmatter, { schema: 'core' });  // Safe schema
```

### Pitfall 3: Lost Source Locations
**What goes wrong:** Error messages show wrong line numbers or no location at all
**Why it happens:** XML body parsing doesn't account for YAML frontmatter lines
**How to avoid:** Track section offsets, add base line number to all body locations
**Warning signs:** Errors pointing to line 1 for all XML issues, off-by-N errors
```typescript
function parseXMLBody(xml: string, frontmatterLines: number): ParsedBody {
  const result = parser.parse(xml);

  // Adjust all locations by frontmatter offset
  adjustLocations(result, frontmatterLines + 1); // +1 for closing ---

  return result;
}
```

### Pitfall 4: Unclear Circular Dependency Errors
**What goes wrong:** Error says "circular dependency detected" without showing the cycle path
**Why it happens:** Cycle detection only finds nodes in cycle, not the path
**How to avoid:** After detecting cycle, trace back to find and report the full path
**Warning signs:** Users can't figure out which connections to remove
```typescript
function reportCycle(cycleNodes: string[], graph: Graph): string {
  // Find a path through the cycle for clear error message
  const path = traceCyclePath(cycleNodes, graph);
  return `Circular dependency: ${path.join(' -> ')} -> ${path[0]}`;
}
```

### Pitfall 5: Unhelpful Validation Errors
**What goes wrong:** Multiple validation errors for a single root cause
**Why it happens:** Continuing validation after finding errors that invalidate later checks
**How to avoid:** Stop validation pass on fatal errors, prioritize structural errors
**Warning signs:** "undefined is not iterable" errors, dozens of cascading errors

## Code Examples

Verified patterns from official sources:

### Secure YAML Parsing with Bun
```typescript
// Source: Bun official docs - https://bun.com/docs/api/yaml
// Bun.YAML.parse is safe by default - no arbitrary object instantiation

interface WorkflowMetadata {
  name: string;
  version: string;
  config?: Record<string, unknown>;
  secrets?: string[];
  schemas?: Record<string, unknown>;
}

function parseFrontmatter(yaml: string): WorkflowMetadata {
  const raw = Bun.YAML.parse(yaml);

  // Validate with zod for runtime type safety
  return metadataSchema.parse(raw);
}
```

### Secure XML Parsing with fast-xml-parser
```typescript
// Source: fast-xml-parser docs + security discussion
// https://github.com/NaturalIntelligence/fast-xml-parser/discussions/353
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  processEntities: false,        // CRITICAL: Disable entity processing (XXE prevention)
  ignoreAttributes: false,       // Preserve attributes like id, type, input
  attributeNamePrefix: '',       // No prefix for cleaner attribute access
  parseTagValue: false,          // Keep values as strings
  trimValues: true,              // Clean whitespace
  isArray: (name) => ['source', 'transform', 'sink', 'branch', 'case'].includes(name)
});

function parseXMLBody(xml: string): RawXMLResult {
  return parser.parse(xml);
}
```

### CLI Error Formatting with @babel/code-frame
```typescript
// Source: @babel/code-frame docs - https://babeljs.io/docs/babel-code-frame
import { codeFrameColumns } from '@babel/code-frame';

interface ValidationError {
  message: string;
  loc: SourceLocation;
}

function formatError(source: string, error: ValidationError): string {
  const frame = codeFrameColumns(source, {
    start: { line: error.loc.start.line, column: error.loc.start.column }
  }, {
    highlightCode: true,
    message: error.message
  });

  return frame;
}

// Output looks like:
//   5 | <source id="fetch" type="http">
//   6 |   <url>{{config.endpoint}}</url>
// > 7 |   <input>{{undefined-node.output}}</input>
//     |          ^^^^^^^^^^^^^^^^^^^^^^^^^ Node 'undefined-node' is not defined
//   8 | </source>
```

### Zod Schema for Workflow Metadata
```typescript
// Source: Zod docs - https://zod.dev
import { z } from 'zod';

const configFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  default: z.unknown().optional(),
  required: z.boolean().optional(),
  description: z.string().optional()
});

const metadataSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/, 'Version must be semver format'),
  description: z.string().optional(),
  trigger: z.object({
    type: z.enum(['manual', 'webhook', 'schedule']),
    config: z.record(z.unknown()).optional()
  }).optional(),
  config: z.record(configFieldSchema).optional(),
  secrets: z.array(z.string()).optional(),
  schemas: z.record(z.unknown()).optional()
});

type WorkflowMetadata = z.infer<typeof metadataSchema>;
```

### Commander CLI Setup
```typescript
// Source: Commander docs - https://github.com/tj/commander.js
import { Command } from 'commander';
import { version } from '../package.json';

const program = new Command();

program
  .name('flowscript')
  .description('Text-native workflow engine')
  .version(version);

program
  .command('validate')
  .description('Validate a workflow file without executing')
  .argument('<file>', 'Path to .flow.md file')
  .option('--format <type>', 'Output format: text, json', 'text')
  .action(async (file, options) => {
    const result = await validateFile(file);

    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printValidationResult(result);
    }

    process.exit(result.valid ? 0 : 1);
  });

program.parse();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xml2js` callback-based | `fast-xml-parser` promise/sync | 2020+ | 3x faster, cleaner API |
| `js-yaml` with unsafe load | Bun.YAML native | Bun 1.2.21 (2025) | Zero deps, safe default |
| Manual `process.argv` parsing | `commander` v12 | Stable | Proper help, subcommands |
| String formatting errors | `@babel/code-frame` | Stable | Industry-standard error UX |

**Deprecated/outdated:**
- `xml2js`: Callback-based API, slower, heavier - use `fast-xml-parser` instead
- `js-yaml` unsafe load: Security risk - Bun.YAML or `yaml` with core schema
- Manual regex for YAML frontmatter: Error-prone - use proper delimiter parsing

## Open Questions

Things that couldn't be fully resolved:

1. **Source location tracking in fast-xml-parser**
   - What we know: fast-xml-parser does not expose line/column info for parsed nodes
   - What's unclear: Whether there's a configuration option or post-processing approach
   - Recommendation: Build a simple source location tracker that runs alongside parsing. Use byte offsets from tag positions in the raw string, convert to line/column using pre-built line offset index.

2. **Bun.YAML edge cases with anchors and aliases**
   - What we know: Bun.YAML supports YAML 1.2 including anchors/aliases
   - What's unclear: Whether there are edge cases where it differs from `yaml` package
   - Recommendation: Test with complex YAML fixtures, have `yaml` package as fallback option if needed.

3. **Custom tag handling for future extensibility**
   - What we know: Current XML nodes are well-defined (source, transform, sink, branch, etc.)
   - What's unclear: How to handle custom/plugin node types in the future
   - Recommendation: Design AST to have generic node type, validate known types first, allow pass-through for future unknown types with warning.

## Sources

### Primary (HIGH confidence)
- [Bun YAML Documentation](https://bun.com/docs/api/yaml) - Native YAML API, safe parsing
- [fast-xml-parser GitHub](https://github.com/NaturalIntelligence/fast-xml-parser) - v5.3.4, security options
- [fast-xml-parser XXE Discussion](https://github.com/NaturalIntelligence/fast-xml-parser/discussions/353) - Security configuration
- [Commander.js GitHub](https://github.com/tj/commander.js) - v12.x CLI framework
- [@babel/code-frame Docs](https://babeljs.io/docs/babel-code-frame) - Error formatting API
- [Zod GitHub](https://github.com/colinhacks/zod) - Schema validation library
- [yaml Package Docs](https://eemeli.org/yaml/) - Safe schemas, maxAliasCount protection

### Secondary (MEDIUM confidence)
- [OWASP XXE Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html) - Security best practices
- [Topological Sort with Kahn's Algorithm](https://dev.to/leopfeiffer/topological-sort-with-kahns-algorithm-3dl1) - Cycle detection algorithm
- [sax-wasm GitHub](https://github.com/justinwilaby/sax-wasm) - Alternative with line/column tracking
- [@rgrove/parse-xml](https://github.com/rgrove/parse-xml) - Alternative with byte offsets

### Tertiary (LOW confidence)
- WebSearch results for "CLI error formatting 2025" - General patterns
- WebSearch results for "AST source location patterns" - Design patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs, actively maintained, Bun-compatible
- Architecture: HIGH - Patterns derived from established compiler/parser design
- Pitfalls: HIGH - Security vulnerabilities documented by OWASP, verified in library discussions

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable domain)
