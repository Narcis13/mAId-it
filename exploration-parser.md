# Parser & AST Subsystem -- Deep Exploration Report

## Overview

The FlowScript parser converts `.flow.md` files into a typed Abstract Syntax Tree (AST). The file format consists of **YAML frontmatter** (metadata, config, triggers) delimited by `---`, followed by an **XML body** (execution logic wrapped in `<workflow>`). The parser is located in `src/parser/` with AST types in `src/types/ast.ts` and error types in `src/types/errors.ts`.

### Architecture

```
.flow.md file
  |
  v
parse(source, filePath)           -- src/parser/index.ts
  |
  +-- createSourceMap()           -- src/parser/location.ts
  +-- splitFile(source)           -- src/parser/frontmatter.ts
  |     |
  |     +-- frontmatter (YAML string)
  |     +-- body (XML string)
  |     +-- offsets (byte/line positions)
  |
  +-- parseFrontmatter(yaml, ...) -- src/parser/frontmatter.ts
  |     |
  |     +-- Bun.YAML.parse()     (safe, no code execution)
  |     +-- validate name, version
  |     +-- parse trigger, config, secrets, schemas
  |     +-- returns WorkflowMetadata
  |
  +-- parseBody(xml, ...)         -- src/parser/body.ts
  |     |
  |     +-- fast-xml-parser       (processEntities: false for XXE prevention)
  |     +-- find <workflow> root
  |     +-- parseNode() for each child
  |     +-- returns NodeAST[]
  |
  v
WorkflowAST { metadata, nodes, sourceMap }
```

---

## 1. AST Node Types (`src/types/ast.ts`)

### 1.1 Source Location Types

| Type | Fields | Description |
|------|--------|-------------|
| `Position` | `line` (1-indexed), `column` (0-indexed), `offset` (byte) | A single point in the source |
| `SourceLocation` | `start: Position`, `end: Position` | A range in the source file |

### 1.2 Workflow Metadata Types (from YAML frontmatter)

| Type | Fields | Description |
|------|--------|-------------|
| `TriggerConfig` | `type: 'manual' \| 'webhook' \| 'schedule'`, `config?: Record<string, unknown>` | How the workflow is triggered |
| `ConfigField` | `type: 'string' \| 'number' \| 'boolean' \| 'object' \| 'array'`, `default?`, `required?`, `description?` | A single config field definition |
| `WorkflowMetadata` | `name`, `version`, `description?`, `trigger?`, `config?`, `secrets?`, `schemas?` | All metadata from frontmatter |

### 1.3 NodeType Union

```typescript
type NodeType =
  | 'source' | 'transform' | 'sink'         // Data Flow
  | 'branch' | 'if'                          // Conditional
  | 'loop' | 'while' | 'foreach'            // Iteration
  | 'parallel'                                // Concurrency
  | 'checkpoint';                             // Human-in-the-loop
```

### 1.4 BaseNode Interface

All nodes share:
```typescript
interface BaseNode {
  type: NodeType;    // discriminant
  id: string;        // unique identifier (required)
  loc: SourceLocation;
  input?: string;    // reference to another node's output
}
```

### 1.5 Data Flow Nodes

#### SourceNode
```typescript
interface SourceNode extends BaseNode {
  type: 'source';
  sourceType: 'http' | 'file';
  config: Record<string, unknown>;
}
```
- XML: `<source id="..." type="http|file" input="...">`
- Attributes parsed: `id`, `type` (default: `'http'`), `input`
- All other attributes go into `config`
- Child elements are parsed via `extractChildElements()` and merged into `config`

#### TransformNode
```typescript
interface TransformNode extends BaseNode {
  type: 'transform';
  transformType: 'ai' | 'template' | 'map' | 'filter';
  config: Record<string, unknown>;
}
```
- XML: `<transform id="..." type="ai|template|map|filter" input="...">`
- Attributes parsed: `id`, `type` (default: `'template'`), `input`
- All other attributes go into `config`
- Child elements merged into `config`

#### SinkNode
```typescript
interface SinkNode extends BaseNode {
  type: 'sink';
  sinkType: 'http' | 'file';
  config: Record<string, unknown>;
}
```
- XML: `<sink id="..." type="http|file" input="...">`
- Attributes parsed: `id`, `type` (default: `'http'`), `input`
- All other attributes go into `config`
- Child elements merged into `config`

### 1.6 Control Flow Nodes

#### BranchNode (pattern matching)
```typescript
interface BranchCase {
  condition: string;      // from `when` attribute on <case>
  nodes: NodeAST[];       // child nodes inside <case>
  loc: SourceLocation;
}

interface BranchNode extends BaseNode {
  type: 'branch';
  cases: BranchCase[];
  default?: NodeAST[];    // from <default> child element
}
```
- XML structure:
  ```xml
  <branch id="..." input="...">
    <case when="condition">
      <source ... />
    </case>
    <default>
      <transform ... />
    </default>
  </branch>
  ```
- Uses `<case when="...">` children (not `<match pattern="...">` as in spec)
- Uses `<default>` child (not `<otherwise>` as in spec)

#### IfNode (conditional)
```typescript
interface IfNode extends BaseNode {
  type: 'if';
  condition: string;    // from `condition` attribute
  then: NodeAST[];      // from <then> child
  else?: NodeAST[];     // from <else> child (optional)
}
```
- XML structure:
  ```xml
  <if id="..." condition="expr" input="...">
    <then>
      <source ... />
    </then>
    <else>
      <transform ... />
    </else>
  </if>
  ```
- The `condition` attribute is read as a raw string (no expression parsing at parse time)

#### LoopNode (fixed iteration)
```typescript
interface LoopNode extends BaseNode {
  type: 'loop';
  maxIterations?: number;    // from `max` attribute (parsed as int)
  breakCondition?: string;   // from `break` attribute
  body: NodeAST[];           // direct children
}
```
- XML: `<loop id="..." max="5" break="expr" input="...">`
- All direct children become the `body` array
- Note: `max` attribute (not `maxIterations`), `break` attribute (not `breakCondition`)

#### WhileNode (condition-based loop)
```typescript
interface WhileNode extends BaseNode {
  type: 'while';
  condition: string;    // from `condition` attribute
  body: NodeAST[];      // direct children
}
```
- XML: `<while id="..." condition="expr" input="...">`
- All direct children become the `body` array

#### ForeachNode (collection iteration)
```typescript
interface ForeachNode extends BaseNode {
  type: 'foreach';
  collection: string;        // from `collection` attribute
  itemVar: string;           // from `item` attribute (default: 'item')
  maxConcurrency?: number;   // from `concurrency` attribute (parsed as int)
  body: NodeAST[];           // direct children
}
```
- XML: `<foreach id="..." collection="expr" item="varName" concurrency="5" input="...">`
- Note: uses `collection` attribute (spec uses `input` for the collection)
- Note: uses `concurrency` attribute (spec uses `max` on a nested `<parallel>`)

#### ParallelNode (concurrent execution)
```typescript
interface ParallelNode extends BaseNode {
  type: 'parallel';
  branches: NodeAST[][];    // array of branch arrays
}
```
- XML structure:
  ```xml
  <parallel id="..." input="...">
    <branch>
      <source ... />
    </branch>
    <branch>
      <transform ... />
    </branch>
  </parallel>
  ```
- Each `<branch>` child creates a separate `NodeAST[]` in the `branches` array
- Note: The `<branch>` children inside `<parallel>` are **not** parsed as `BranchNode` -- they are treated as simple containers for child nodes. There is no `id` requirement on these inner `<branch>` elements.

#### CheckpointNode (human approval gate)
```typescript
interface CheckpointNode extends BaseNode {
  type: 'checkpoint';
  prompt: string;                        // from `prompt` attribute
  timeout?: number;                      // from `timeout` attribute (parsed as int)
  defaultAction?: 'approve' | 'reject'; // from `default` attribute
}
```
- XML: `<checkpoint id="..." prompt="..." timeout="3600" default="approve|reject" input="...">`
- Very simplified compared to spec (no actions, conditions, or nested goto)

### 1.7 Top-level WorkflowAST

```typescript
interface SourceMap {
  source: string;        // full file content
  filePath: string;      // file path
  lineOffsets: number[]; // byte offset for each line start
}

interface WorkflowAST {
  metadata: WorkflowMetadata;
  nodes: NodeAST[];
  sourceMap: SourceMap;
}
```

---

## 2. Main Parser Entry Point (`src/parser/index.ts`)

### `parse(source: string, filePath: string): ParseResult<WorkflowAST>`

Synchronous parser with 5 steps:

1. **Build source map** -- `createSourceMap(source, filePath)` precomputes line offsets
2. **Split file** -- `splitFile(source)` separates YAML frontmatter from XML body
3. **Parse frontmatter** -- `parseFrontmatter(yaml, lineOffsets, frontmatterStart)`
4. **Parse body** -- `parseBody(xml, frontmatterLineCount, bodyStart, source)`
5. **Assemble AST** -- combines metadata + nodes + sourceMap into `WorkflowAST`

Errors from steps 3 and 4 are accumulated; if any errors exist, the function returns `{ success: false, errors }`.

### `parseFile(filePath: string): Promise<ParseResult<WorkflowAST>>`

Async wrapper that reads a file from disk using `Bun.file()`, then calls `parse()`.

### Re-exports

The module re-exports all key functions and types from the submodules: `createSourceMap`, `buildLineOffsets`, `createLocation`, `adjustLocation`, `findOffset`, `splitFile`, `parseFrontmatter`, `parseBody`, and types `FileSections`, `SplitResult`, `RawXMLNode`.

---

## 3. Frontmatter Parser (`src/parser/frontmatter.ts`)

### `splitFile(source: string): SplitResult`

Splits the `.flow.md` file into frontmatter and body sections:

- **Requires** the file to start with `---\n` (or `---\r\n`)
- Finds the closing `\n---\n` (or `\r\n---\r\n`) delimiter
- Returns `FileSections` with:
  - `frontmatter` -- raw YAML content between delimiters
  - `frontmatterStart` / `frontmatterEnd` -- byte offsets
  - `frontmatterLineCount` -- total lines including delimiters
  - `body` -- everything after closing delimiter
  - `bodyStart` -- byte offset of body
- Validates body is not empty/whitespace-only
- Handles both LF and CRLF line endings

### `parseFrontmatter(yaml, lineOffsets, frontmatterStart): FrontmatterResult`

Parses YAML into `WorkflowMetadata`:

1. **YAML parsing** -- Uses `Bun.YAML.parse()` (safe by default, no deserialization attacks)
2. **Object validation** -- Ensures result is a non-null, non-array object
3. **Required field validation**:
   - `name` -- must be a non-empty string
   - `version` -- must be a string
4. **Semver validation** -- Version must match `^\d+\.\d+(\.\d+)?$` (X.Y or X.Y.Z)
5. **Optional field parsing**:
   - `description` -- string
   - `trigger` -- via `parseTrigger()`
   - `config` -- via `parseConfig()`
   - `secrets` -- via `parseSecrets()`
   - `schemas` -- passthrough as `Record<string, unknown>`

### `parseTrigger(value)` (private)

Accepts trigger as:
- **String**: `'manual'`, `'webhook'`, `'schedule'` -- returns `{ type: value }`
- **Object**: extracts `type` and `config` sub-object
- Unknown string values default to `{ type: 'manual' }`

### `parseConfig(value)` (private)

Parses config map where each field has:
- `type` -- one of `'string' | 'number' | 'boolean' | 'object' | 'array'` (default: `'string'`)
- `default` -- any value
- `required` -- boolean
- `description` -- string

### `parseSecrets(value)` (private)

Filters array to only string values.

---

## 4. XML Body Parser (`src/parser/body.ts`)

### XML Parser Configuration

Uses `fast-xml-parser` with:
- `ignoreAttributes: false` -- preserves all XML attributes
- `attributeNamePrefix: ''` -- no prefix on attribute names
- `preserveOrder: true` -- maintains element order
- `trimValues: true` -- trims text content
- `processEntities: false` -- **prevents XXE injection**
- `cdataPropName: '__cdata'` -- supports CDATA sections
- `parseTagValue: false` -- keeps text as strings (not auto-number/boolean)
- `parseAttributeValue: false` -- keeps attribute values as strings

### `parseBody(xml, bodyLineOffset, bodyByteOffset, fullSource): BodyResult`

1. Parses XML using fast-xml-parser
2. Validates a `<workflow>` root element exists
3. Iterates children of `<workflow>`, calling `parseNode()` for each
4. Accumulates errors; returns all nodes or all errors

### `parseNode(xmlNode, ...)` (private)

Dispatches based on XML tag name:

| Tag Name | Parser Function | AST Node Type |
|----------|----------------|---------------|
| `source` | `parseSourceNode()` | `SourceNode` |
| `transform` | `parseTransformNode()` | `TransformNode` |
| `sink` | `parseSinkNode()` | `SinkNode` |
| `branch` | `parseBranchNode()` | `BranchNode` |
| `if` | `parseIfNode()` | `IfNode` |
| `loop` | `parseLoopNode()` | `LoopNode` |
| `while` | `parseWhileNode()` | `WhileNode` |
| `foreach` | `parseForeachNode()` | `ForeachNode` |
| `parallel` | `parseParallelNode()` | `ParallelNode` |
| `checkpoint` | `parseCheckpointNode()` | `CheckpointNode` |
| (unknown) | returns `VALID_UNKNOWN_NODE_TYPE` error | -- |

Every node **requires an `id` attribute**. Missing `id` produces a `VALID_MISSING_REQUIRED_FIELD` error.

### Node-specific parsing details

#### source, transform, sink

- Extract `type`, `id`, `input` from attributes
- Validate `type` against allowed values
- All other attributes go to `config` via `extractConfig(attrs, ['id', 'type', 'input'])`
- Child elements parsed via `extractChildElements()`:
  - Finds child tag names
  - Extracts text content from children
  - If text looks like YAML key-value pairs (multiple lines with colons), parses into object
  - Otherwise stores as plain string

#### branch

- Iterates children looking for `<case>` and `<default>` elements
- `<case when="condition">` -- condition from `when` attribute, recursively parses child nodes
- `<default>` -- recursively parses child nodes

#### if

- `condition` from attribute
- Children: looks for `<then>` and `<else>` elements
- Recursively parses nodes inside each

#### loop

- `max` attribute -> `maxIterations` (parseInt)
- `break` attribute -> `breakCondition` (string)
- All children become body nodes

#### while

- `condition` attribute -> `condition` (string)
- All children become body nodes

#### foreach

- `collection` attribute -> `collection` (string)
- `item` attribute -> `itemVar` (default: `'item'`)
- `concurrency` attribute -> `maxConcurrency` (parseInt)
- All children become body nodes

#### parallel

- Children must be `<branch>` elements
- Each `<branch>` creates a separate array of recursively parsed nodes
- Inner `<branch>` elements are NOT parsed as BranchNode (no id required)

#### checkpoint

- `prompt` attribute -> `prompt` (string)
- `timeout` attribute -> `timeout` (parseInt)
- `default` attribute -> `defaultAction` (`'approve'` or `'reject'`)

### Helper Functions

#### `extractConfig(attrs, excludeKeys)`
Copies all attributes except excluded keys into a config object.

#### `extractChildElements(entry, tagName)`
Extracts text content from child XML elements. If text contains multi-line key-value pairs (every non-empty line has a colon), parses into object via `parseKeyValuePairs()`.

#### `looksLikeKeyValuePairs(text)`
Returns true if text has multiple non-empty lines where every line contains a colon.

#### `parseKeyValuePairs(text)`
Splits text on newlines, splits each line on first colon to produce key-value pairs.

#### `findNodeLocation(tagName, id, bodySource, ...)`
Searches body source for `<tagName` pattern, then checks if the tag contains `id="..."` matching the node's id. Uses string search (not regex) for efficiency.

---

## 5. Parser Internal Types (`src/parser/types.ts`)

| Type | Description |
|------|-------------|
| `FileSections` | After splitting: frontmatter string + body string + byte offsets + line counts |
| `RawXMLNode` | fast-xml-parser output structure with `':@'` attributes, `'#text'` text, tag-name children |
| `SplitResult` | Discriminated union: `{ success: true, sections }` or `{ success: false, error, line? }` |

---

## 6. Source Location Tracking (`src/parser/location.ts`)

### Functions

| Function | Description |
|----------|-------------|
| `buildLineOffsets(source)` | Scans source for `\n` characters, builds array of byte offsets where each line starts. Line 1 starts at offset 0. |
| `offsetToPosition(offset, lineOffsets)` | Binary search to convert byte offset to `{ line, column, offset }`. Line is 1-indexed, column is 0-indexed. |
| `createLocation(startOffset, endOffset, lineOffsets)` | Creates `SourceLocation` from two byte offsets. |
| `adjustLocation(loc, lineOffset, byteOffset)` | Adds line and byte offsets to an existing location (used to translate body-relative positions to full-file positions). |
| `createSourceMap(source, filePath)` | Creates `SourceMap` with original source, file path, and precomputed line offsets. |
| `findOffset(source, searchString, startFrom)` | Simple `indexOf` wrapper. |

### Location tracking strategy

The parser maintains two sets of line offsets:
1. **Full file** line offsets -- for computing final positions in the complete file
2. **Body-only** line offsets -- for the XML parser's internal positions

When a node location is found in the body, it is adjusted by adding the frontmatter's line count and byte offset to produce the final position in the full file.

The `findNodeLocation()` function in `body.ts` performs string searches for `<tagName` patterns to locate nodes, then checks for matching `id` attributes. This is approximate -- the end position is estimated as `offset + tagName.length + 1`.

---

## 7. Error System (`src/types/errors.ts`)

### Error Codes

| Category | Codes |
|----------|-------|
| Parse errors | `PARSE_YAML_INVALID`, `PARSE_XML_INVALID`, `PARSE_MISSING_FRONTMATTER`, `PARSE_MISSING_BODY` |
| Structural validation | `VALID_MISSING_REQUIRED_FIELD`, `VALID_INVALID_FIELD_TYPE`, `VALID_UNKNOWN_NODE_TYPE` |
| Reference validation | `VALID_UNDEFINED_NODE_REF`, `VALID_UNDEFINED_SECRET_REF`, `VALID_DUPLICATE_NODE_ID` |
| Graph validation | `VALID_CIRCULAR_DEPENDENCY` |
| Type validation | `VALID_INVALID_SCHEMA`, `VALID_TYPE_MISMATCH` |
| Expression errors | `EXPR_PARSE_ERROR`, `EXPR_EVAL_ERROR`, `EXPR_UNDEFINED_VARIABLE`, `EXPR_UNDEFINED_FUNCTION`, `EXPR_BLOCKED_ACCESS`, `EXPR_TYPE_ERROR` |

The parser currently uses: `PARSE_YAML_INVALID`, `PARSE_XML_INVALID`, `PARSE_MISSING_FRONTMATTER`, `PARSE_MISSING_BODY`, `VALID_MISSING_REQUIRED_FIELD`, `VALID_INVALID_FIELD_TYPE`, `VALID_UNKNOWN_NODE_TYPE`.

### Error Structure

```typescript
interface ValidationError {
  code: ErrorCode;
  message: string;
  loc?: SourceLocation;
  severity: 'error' | 'warning';
  hints?: string[];        // fix suggestions
}
```

---

## 8. Test Coverage (`src/parser/frontmatter.test.ts`)

The test file covers **frontmatter parsing only**, specifically:

- **Version validation**: X.Y.Z format, X.Y format, rejects bad strings, v-prefix, single number, prerelease suffix, empty string, 4+ parts, non-numeric parts
- **Required fields**: name required, version required, valid minimal frontmatter
- **Error hints**: checks that helpful hints are attached to errors

No tests exist in the parser directory for:
- `splitFile()` edge cases
- XML body parsing
- Individual node type parsing
- Source location accuracy
- Config extraction / child element parsing

---

## 9. Spec vs. Implementation Gap Analysis

### Frontmatter: What the spec defines vs. what the parser supports

| Spec Feature | Parser Support | Notes |
|-------------|---------------|-------|
| `name` (required) | Supported | Validated as non-empty string |
| `version` (required) | Supported | Validated as semver X.Y or X.Y.Z |
| `description` | Supported | Optional string |
| `trigger.schedule` | Partially | Parser accepts `type: 'schedule'` with config, but no cron/duration validation |
| `trigger.webhook` | Partially | Parser accepts `type: 'webhook'` with config, no path/auth validation |
| `trigger.manual` | Supported | Parser accepts `type: 'manual'` |
| `trigger.watch` | **NOT supported** | Parser only recognizes 3 trigger types: manual, webhook, schedule |
| `trigger.queue` | **NOT supported** | Parser only recognizes 3 trigger types |
| `config` fields | Supported | type, default, required, description |
| `config` enum type | **NOT supported** | Parser only supports: string, number, boolean, object, array |
| `secrets` | Supported | Array of strings |
| `schemas` | Passthrough | Stored as raw `Record<string, unknown>`, no validation |
| `input` schema | **NOT supported** | Not parsed from frontmatter |
| `output` schema | **NOT supported** | Not parsed from frontmatter |
| `runtime` settings | **NOT supported** | timeout, retry, concurrency, context_budget not parsed |
| `evolution` section | **NOT supported** | generation, parent, fitness, learnings not parsed |

### XML Body: What the spec defines vs. what the parser supports

| Spec Feature | Parser Support | Notes |
|-------------|---------------|-------|
| `<workflow>` root | Supported | Required root element |
| `<context>` global | **NOT supported** | Unknown node type error |
| `<phase>` grouping | **NOT supported** | Unknown node type error |
| `<source type="http">` | Supported | |
| `<source type="file">` | Supported | |
| `<source type="database">` | **NOT supported** | Parser only allows `http` or `file` |
| `<source type="queue">` | **NOT supported** | Parser only allows `http` or `file` |
| `<transform type="map">` | Supported | |
| `<transform type="filter">` | Supported | |
| `<transform type="ai">` | Supported | |
| `<transform type="template">` | Supported | |
| `<transform type="reduce">` | **NOT supported** | Parser only allows: ai, template, map, filter |
| `<ai>` as standalone tag | **NOT supported** | Must use `<transform type="ai">` |
| `<sink type="http">` | Supported | |
| `<sink type="file">` | Supported | |
| `<sink type="email">` | **NOT supported** | Parser only allows `http` or `file` |
| `<sink type="database">` | **NOT supported** | Parser only allows `http` or `file` |
| `<branch>` with `<case when>` | Supported | Different syntax from spec's `<match pattern>` |
| `<branch>` with `<match pattern>` | **NOT supported** | Parser uses `<case when="...">` instead |
| `<branch>` with `<otherwise>` | **NOT supported** | Parser uses `<default>` instead |
| `<if>` conditional | Supported | condition attribute + then/else children |
| `<loop>` with max/break | Supported | `max` and `break` attributes |
| `<while>` loop | Supported | condition attribute, but no `<do>` wrapper needed (spec uses `<do>`) |
| `<foreach>` | Supported | `collection`, `item`, `concurrency` attributes |
| `<parallel>` with branches | Supported | `<branch>` children become separate arrays |
| `<parallel>` wait/merge | **NOT supported** | No `<wait>` or `<merge>` child parsing |
| `<checkpoint>` | Supported (simplified) | Only prompt/timeout/defaultAction; no actions/conditions/goto |
| `<delay>` | **NOT supported** | Unknown node type |
| `<throttle>` | **NOT supported** | Unknown node type |
| `<debounce>` | **NOT supported** | Unknown node type |
| `<batch>` | **NOT supported** | Unknown node type |
| `<timeout>` | **NOT supported** | Unknown node type |
| `<schedule>` | **NOT supported** | Unknown node type |
| `<on-error>` | **NOT supported** | No error handling parsing (retry, fallback, circuit-breaker, dlq) |
| `<on-workflow-error>` | **NOT supported** | Unknown node type |
| `<state>` persistence | **NOT supported** | Unknown node type |
| `<include>` composition | **NOT supported** | Unknown node type |
| `<call>` workflow | **NOT supported** | Unknown node type |
| `<schema>` definition | **NOT supported** | Unknown node type |
| `<output>` element | **NOT supported** | Unknown node type |
| `<set>` variable | **NOT supported** | Unknown node type |
| `<break>` element | **NOT supported** | Only `break` attribute on `<loop>` |
| `<goto>` navigation | **NOT supported** | Unknown node type |
| Markdown footer | **NOT supported** | Parser does not parse execution logs/learnings |

### Security Features

1. **XXE Prevention**: `processEntities: false` in fast-xml-parser config
2. **Safe YAML**: `Bun.YAML.parse()` is safe by default (no arbitrary code execution)
3. **CDATA Support**: Enabled via `cdataPropName: '__cdata'` for safe code block embedding

### Limitations Summary

1. **Limited source/sink types**: Only `http` and `file` (spec defines `database`, `queue`, `email`)
2. **Limited transform types**: Only `ai`, `template`, `map`, `filter` (spec defines `reduce`)
3. **No `<ai>` standalone tag**: Must use `<transform type="ai">`
4. **No phases or context**: Structural grouping elements not supported
5. **No temporal primitives**: delay, throttle, debounce, batch, timeout, schedule all missing
6. **No error handling**: on-error, retry, fallback, circuit-breaker, dlq all missing
7. **No state persistence**: No `<state>` element
8. **No composition**: No `<include>` or `<call>` for workflow reuse
9. **No type system**: No `<schema>` definitions in XML body
10. **No runtime frontmatter**: input, output, runtime, evolution sections not parsed
11. **Simplified checkpoint**: No actions, conditions, or routing -- just prompt/timeout/default
12. **Approximate source locations**: End positions are estimated; no precise tag-end tracking
13. **No markdown footer parsing**: Execution logs and learnings not extracted
14. **Branch syntax differs from spec**: Uses `<case when>` / `<default>` instead of `<match pattern>` / `<otherwise>`
15. **While syntax differs from spec**: Direct children instead of `<do>` wrapper
16. **No `<goto>` or `<set>` support**: No variable assignment or navigation primitives
17. **No test coverage for body parsing**: Only frontmatter tests exist in parser directory
