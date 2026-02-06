# Exploration Report: CLI & Validator Subsystem

## Overview

The CLI and Validator subsystem provides the user-facing interface for the FlowScript workflow engine. The CLI is built with Commander.js and offers three commands (`run`, `validate`, `parse`). The Validator performs multi-pass static analysis of parsed workflow ASTs. Together they form the primary entry point for interacting with `.flow.md` files.

---

## 1. CLI Architecture

### 1.1 Entry Point (`src/cli/index.ts`)

The CLI entry point uses a shebang (`#!/usr/bin/env bun`) for direct execution. It reads the package version dynamically from `package.json` using `Bun.file()`. The program is created with Commander.js under the name `flowscript`.

**Three commands are registered:**

| Command    | Description                            | File              |
|------------|----------------------------------------|-------------------|
| `validate` | Validate .flow.md workflow files       | `src/cli/validate.ts` |
| `run`      | Execute a .flow.md workflow            | `src/cli/run.ts`      |
| `parse`    | Parse a .flow.md file and output AST   | Inline in `index.ts`  |

The `package.json` `bin` field maps `flowscript` to `./src/cli/index.ts`, meaning the CLI can be invoked directly via `bun` or linked as an executable.

### 1.2 Root Entry Point (`index.ts`)

The root `index.ts` is minimal -- just `console.log("Hello via Bun!");`. It serves no functional purpose for the workflow engine. The actual entry point is `src/cli/index.ts`.

---

## 2. CLI Commands in Detail

### 2.1 `validate` Command

**Syntax:** `flowscript validate <files...>`

**Options:**
- `-f, --format <format>` - Output format: `text` (default) or `json`
- `--no-color` - Disable colored output
- `-s, --strict` - Treat warnings as errors

**Implementation (`src/cli/validate.ts`):**

The validate command supports both single-file and multi-file validation:

1. **`validateFile(filePath, options)`** - Validates a single file:
   - Checks file existence using `Bun.file().exists()`
   - Reads source text for error context display
   - Calls `parseFile()` from the parser module
   - If parse fails, formats parse errors and returns
   - If parse succeeds, calls `validate()` from the validator module
   - In strict mode, warnings are treated as errors (workflow fails if any warnings exist)
   - On success with no warnings, reports the file as valid with a node count
   - Returns a `ValidateResult` with `valid`, `output`, `errorCount`, and `warningCount`

2. **`validateFiles(filePaths, options)`** - Validates multiple files sequentially:
   - Iterates files calling `validateFile()` for each
   - Aggregates results into a combined output
   - All-or-nothing validity (fails if any file fails)

**Node counting** is handled by a recursive `countNodes()` function that traverses nested structures (cases, default, then, else, body, branches).

### 2.2 `run` Command

**Syntax:** `flowscript run <file>`

**Options:**
- `--dry-run` - Show execution plan without running
- `-c, --config <key=value>` - Override config values (repeatable via `collectConfig()`)
- `--input <json>` - Workflow input data as JSON string
- `-f, --format <format>` - Output format: `text` (default) or `json`
- `--no-color` - Disable colored output

**Implementation (`src/cli/run.ts`):**

The `runWorkflow()` function orchestrates the full pipeline: **parse -> validate -> plan -> execute**.

**Step-by-step flow:**

1. **File existence check** - Uses `Bun.file().exists()`
2. **Parse** - Calls `parseFile(filePath)` from the parser
3. **Validate** - Calls `validate(parseResult.data)` from the validator
4. **Build execution plan** - Calls `buildExecutionPlan(parseResult.data)` from the scheduler
5. **Dry-run check** - If `--dry-run`, formats and returns the execution plan
6. **Parse config overrides** - Converts `key=value` strings to a config record
7. **Parse input JSON** - Parses the `--input` JSON string
8. **Merge config** - Merges workflow frontmatter config with CLI overrides
9. **Build secrets** - Reads secret names from metadata, looks up values from `process.env`
10. **Create execution state** - Calls `createExecutionState()` with workflowId, config, secrets, and global context
11. **Execute with progress** - Uses `ora` spinner for progress display, calls `execute(executionPlan, state)`
12. **Format result** - On success, shows completion summary; on failure, shows error details

**Config override parsing (`parseConfigOverrides`):**
- Splits on first `=` sign (subsequent `=` are part of the value)
- Attempts JSON parse for the value; falls back to raw string
- Supports: JSON objects, arrays, booleans, numbers, and plain strings
- Throws on missing `=` or empty key
- Trims whitespace from keys

**Dry-run output includes:**
- Workflow name, total node count, wave count
- Config overrides (if provided)
- Input data (if provided)
- Wave breakdown with node IDs and their types (e.g., `source:http`, `transform:template`)
- Hint to run without `--dry-run`

**Important design note:** In dry-run mode, config and input are _displayed_ but _not parsed/validated_. The dry-run returns before config parsing occurs, so invalid config format or invalid JSON input will not cause errors in dry-run mode. This is intentional per the test comments.

### 2.3 `parse` Command

**Syntax:** `flowscript parse <file>`

**Options:**
- `-f, --format <format>` - Output format: `json` (default) or `yaml`
- `--no-validate` - Skip validation after parsing

**Implementation (inline in `src/cli/index.ts`):**

1. Checks file existence
2. Calls `parseFile(file)` (dynamically imported)
3. Optionally validates (unless `--no-validate`)
4. Outputs the AST as JSON
5. YAML output is declared but not implemented (falls back to JSON with a message)

This command is useful for debugging and tooling integration.

---

## 3. Error Formatting (`src/cli/format.ts`)

The formatter provides compiler-style error output using `@babel/code-frame` for source code context.

### 3.1 FormatOptions

```typescript
interface FormatOptions {
  color?: boolean;      // Enable colored output (default: true)
  context?: boolean;    // Show source code context (default: true)
  contextLines?: number; // Lines of context to show (default: 2)
  format?: 'text' | 'json';
}
```

### 3.2 Formatting Functions

| Function | Purpose |
|----------|---------|
| `formatError()` | Single error with source context, hints, severity coloring |
| `formatValidationResult()` | All errors + warnings + summary line |
| `formatParseErrors()` | Parse-stage errors with summary |
| `formatSuccess()` | Success message with node count |
| `formatFileNotFound()` | File not found error with hints |

### 3.3 Text Output Format

Each error is formatted as:
```
error[CODE]: message
  --> filepath:line:column
  <code frame with highlighted region>

hint: suggestion text
```

- **Errors** are displayed in red bold
- **Warnings** are displayed in yellow bold
- **Hints** are displayed in blue bold
- Source locations use `file:line:column` format (like Rust compiler)
- Code frames are generated by `@babel/code-frame` with syntax highlighting
- Summary line shows pass/fail with error/warning counts

### 3.4 JSON Output Format

When `--format json` is used, output is structured as:
```json
{
  "valid": boolean,
  "file": "path",
  "errorCount": number,
  "warningCount": number,
  "errors": [{ "code": "...", "severity": "...", "message": "...", "location": {...}, "hints": [...] }],
  "warnings": [...]
}
```

Parse errors include an additional `"stage": "parse"` field. File-not-found errors include `"stage": "read"`.

### 3.5 Execution Result Formatting (in `run.ts`)

**Success output:**
- Green "Execution completed successfully" header
- Workflow name, run ID, duration, nodes executed count
- Results breakdown (passed/failed/skipped)
- Last 3 node outputs (truncated to 60 chars)

**Error output:**
- Red "Execution failed" header
- Workflow name, run ID, failed wave number, completed node count
- Error message and truncated stack trace (first 3 lines)
- List of failed nodes with their error messages

**Dry-run output:**
- Cyan "Execution Plan" header
- Wave breakdown showing each wave's nodes with their types

---

## 4. Validator Architecture

### 4.1 Multi-Pass Validation (`src/validator/index.ts`)

The validator runs four passes in sequence, with intelligent short-circuiting:

| Pass | Module | What it checks | Produces |
|------|--------|----------------|----------|
| 1. Structural | `structural.ts` | Required fields, valid types, node structure | Errors + Warnings |
| 2. References | `references.ts` | Node refs, secret refs, duplicate IDs | Errors + Warnings |
| 3. Cycles | `cycles.ts` | Circular dependencies in the graph | Errors |
| 4. Types | `types.ts` | AI output schema compatibility | Warnings only |

**Short-circuit logic:**
- Pass 3 (cycles) is **skipped if Pass 2 has reference errors** -- because dangling references would cause false cycle positives
- Pass 4 (types) is **skipped if any prior errors exist** -- types are only checked on valid graphs

The main `validate()` function returns a `ValidationResult`:
```typescript
interface ValidationResult {
  valid: boolean;       // true if no errors (warnings allowed)
  errors: ValidationError[];
  warnings: ValidationError[];
}
```

A convenience `validateWithOrder()` function combines validation with topological sort, returning the execution order if valid.

### 4.2 Error Type System (`src/types/errors.ts`)

**Error codes are organized by category:**

| Category | Codes |
|----------|-------|
| Parse | `PARSE_YAML_INVALID`, `PARSE_XML_INVALID`, `PARSE_MISSING_FRONTMATTER`, `PARSE_MISSING_BODY` |
| Structural | `VALID_MISSING_REQUIRED_FIELD`, `VALID_INVALID_FIELD_TYPE`, `VALID_UNKNOWN_NODE_TYPE` |
| Reference | `VALID_UNDEFINED_NODE_REF`, `VALID_UNDEFINED_SECRET_REF`, `VALID_DUPLICATE_NODE_ID` |
| Graph | `VALID_CIRCULAR_DEPENDENCY` |
| Type | `VALID_INVALID_SCHEMA`, `VALID_TYPE_MISMATCH` |
| Expression | `EXPR_PARSE_ERROR`, `EXPR_EVAL_ERROR`, `EXPR_UNDEFINED_VARIABLE`, `EXPR_UNDEFINED_FUNCTION`, `EXPR_BLOCKED_ACCESS`, `EXPR_TYPE_ERROR` |

Each `ValidationError` has:
- `code` - Programmatic error code
- `message` - Human-readable description
- `loc?` - Source location (`SourceLocation`)
- `severity` - `'error'` or `'warning'`
- `hints?` - Array of fix suggestions

---

## 5. Structural Validation (`src/validator/structural.ts`)

### 5.1 Metadata Validation

| Check | Severity | Code |
|-------|----------|------|
| `name` is required and non-empty | Error | `VALID_MISSING_REQUIRED_FIELD` |
| `version` is required and non-empty | Error | `VALID_MISSING_REQUIRED_FIELD` |
| `trigger.type` must be `manual`, `webhook`, or `schedule` | Error | `VALID_INVALID_FIELD_TYPE` |
| Config field types must be `string`, `number`, `boolean`, `object`, or `array` | Error | `VALID_INVALID_FIELD_TYPE` |

### 5.2 Node Validation (All Types)

| Check | Severity | Code |
|-------|----------|------|
| Every node must have non-empty `id` | Error | `VALID_MISSING_REQUIRED_FIELD` |
| Unknown node type (exhaustiveness check) | Error | `VALID_UNKNOWN_NODE_TYPE` |

### 5.3 Per-Node-Type Validation

**Source nodes:**
- `sourceType` must be `http` or `file` (Error)

**Transform nodes:**
- `transformType` must be `ai`, `template`, `map`, or `filter` (Error)
- AI transforms without `input` reference produce a warning

**Sink nodes:**
- `sinkType` must be `http` or `file` (Error)
- Sinks without `input` reference produce a warning

**Branch nodes:**
- Must have at least one case (Error)
- Each case must have a `when` condition (Error)
- Recursively validates child nodes in cases and default

**If nodes:**
- Must have a `condition` attribute (Error)
- Recursively validates `then` and `else` branches

**Loop nodes:**
- Must have either `maxIterations` or `breakCondition` (Warning -- prevents infinite loops)
- `maxIterations` must be positive (Error)
- Recursively validates body nodes

**While nodes:**
- Must have a `condition` attribute (Error)
- Recursively validates body nodes

**Foreach nodes:**
- Must have `collection` attribute (Error)
- Must have `item` variable name (Error)
- `maxConcurrency` must be positive if set (Error)
- Recursively validates body nodes

**Parallel nodes:**
- Must have at least one branch (Error)
- Recursively validates all branch nodes

**Checkpoint nodes:**
- Must have `prompt` attribute (Error)
- `timeout` must be positive if set (Error)
- `defaultAction` must be `approve` or `reject` if set (Error)

---

## 6. Reference Validation (`src/validator/references.ts`)

### 6.1 Duplicate Node ID Detection

Recursively collects all node IDs across the entire workflow tree (including nested nodes inside branches, loops, parallels, etc.). If a duplicate ID is found, reports the location of both occurrences.

### 6.2 Input Reference Validation

For every node with an `input` attribute, checks that the referenced node ID exists in the collected set. If not found:
- Uses **Levenshtein distance** to find similar IDs for "did you mean?" suggestions
- Max edit distance = `max(2, floor(target.length / 3))`
- Returns up to 3 suggestions sorted by distance
- Falls back to listing all defined node IDs if no similar matches

### 6.3 Secret Reference Validation

Scans the **raw source text** (not the AST) using the regex pattern `\{\{\$secrets\.(\w+)\}\}` to find all secret references. For each found secret:
- Checks if it is declared in `metadata.secrets` array
- De-duplicates (same secret referenced multiple times is only reported once)
- Computes approximate line number from the match position
- Provides hints on how to declare the secret in frontmatter

This raw-source approach ensures secrets are caught anywhere in the file (including inside XML child elements, templates, URLs, etc.) rather than only in attributes the parser extracts.

---

## 7. Cycle Detection (`src/validator/cycles.ts`)

### 7.1 Algorithm

Uses **Kahn's algorithm** for topological sorting, which is O(V+E):

1. **Build dependency graph** - Two passes:
   - First pass: Collect all nodes (recursing into nested structures)
   - Second pass: Build edges from `input` references (node depends on its input source)
2. **Run Kahn's algorithm**:
   - Find all nodes with in-degree 0 (no dependencies)
   - Process queue: remove node, decrement dependents' in-degree
   - If in-degree becomes 0, add to queue
3. **Detect cycles** - If processed count < total nodes, remaining nodes form a cycle

### 7.2 Cycle Path Reporting

When a cycle is detected, uses **DFS** from the first remaining node to trace the actual cycle path. The error message shows the cycle as `A -> B -> C -> A`.

### 7.3 Execution Order

The `getExecutionOrder()` function exports a standalone topological sort, returning `string[] | undefined` (undefined if cycle exists). This is used by `validateWithOrder()`.

### 7.4 Graph Structure

Each node in the dependency graph tracks:
- `id` - Node identifier
- `loc` - Source location for error reporting
- `dependencies` - Set of nodes this node depends on
- `dependents` - Set of nodes that depend on this node

---

## 8. Type Compatibility Validation (`src/validator/types.ts`)

### 8.1 Purpose

Validates that AI node output schemas are compatible with downstream consumer expectations. Produces **warnings only** since types are resolved at runtime.

### 8.2 Process

1. Find all AI transform nodes with `output-schema` config
2. Parse the schema using the `parseSchemaDSL()` function (TypeScript-like DSL -> Zod schema)
3. If schema parsing fails, emit a `VALID_INVALID_SCHEMA` warning
4. Find all consumer nodes that reference the AI node's output (via regex matching on input attributes and config values)
5. Extract field access patterns (e.g., `{{aiNode.output.field}}` -> `field`)
6. Validate the field exists in the Zod schema shape
7. Emit `VALID_TYPE_MISMATCH` warning if field is not found

### 8.3 Consumer Detection

Uses regex pattern `\{\{\s*nodeId\b` to find nodes that reference a specific AI node's output, scanning both `input` attributes and `config` string values.

---

## 9. Test Coverage

### 9.1 Run Command Tests (`src/cli/run.test.ts`)

**33 tests across 6 categories:**

| Category | Tests | What's covered |
|----------|-------|----------------|
| File handling | 3 | Nonexistent file, invalid workflow, valid workflow parsing |
| Dry-run mode | 4 | Plan display, node count, wave breakdown, execution hint |
| Config overrides | 6 | Single, multiple, invalid format, JSON values, display in output |
| Input parsing | 3 | Valid JSON, invalid JSON in dry-run, display in output |
| Output format | 1 | Text format default (no JSON dry-run support yet) |
| No-color option | 2 | No ANSI codes, readable without color |

**`parseConfigOverrides` unit tests (13 tests):**
- Simple key=value, multiple overrides
- JSON values (objects, arrays, booleans, numbers)
- Non-JSON strings fallback
- Empty values, values with equals signs
- Error cases (missing equals, empty key)
- Key whitespace trimming

### 9.2 Reference Validation Tests (`src/validator/references.test.ts`)

**6 tests for secret reference validation:**
- Undeclared secret in HTTP headers is detected
- Declared secret passes validation
- Multiple undeclared secrets all reported individually
- Secret in transform template is detected
- Same secret referenced multiple times is reported only once
- Error hints include declaration instructions

---

## 10. Example Workflows

### 10.1 `examples/hello-world.flow.md`

A 3-node linear workflow: HTTP source -> map transform -> file sink.
- Fetches a random joke from a public API
- Formats the joke using a map expression
- Saves to a file in a configurable output directory
- Demonstrates: config defaults, HTTP source, map transform, file sink, template expressions

### 10.2 `examples/file-transform.flow.md`

A 4-node data pipeline: file source -> filter -> map -> file sink.
- Reads input JSON data
- Filters items with score > 50
- Enriches with a grade field using ternary expressions
- Writes results to output file
- Demonstrates: file I/O, filter transform, map transform, chained processing

### 10.3 `src/cli/fixtures/test-workflow.flow.md`

A 2-node test fixture: HTTP source -> template transform.
- Minimal workflow used by CLI run tests
- Demonstrates: basic config, HTTP source, template transform with input reference

---

## 11. Spec vs. Implementation Gap Analysis

### 11.1 CLI Commands Specified but NOT Implemented

| Spec Command | Status | Notes |
|-------------|--------|-------|
| `flowscript run` | Implemented | Full support |
| `flowscript validate` | Implemented | Full support |
| `flowscript watch` | NOT implemented | File watching mode |
| `flowscript test` | NOT implemented | Workflow testing with coverage |
| `flowscript debug` | NOT implemented | Breakpoint debugging |
| `flowscript replay` | NOT implemented | Replay from specific node |
| `flowscript inspect` | NOT implemented | Structure, deps, schema inspection |
| `flowscript publish` | NOT implemented | Registry publishing |
| `flowscript install` | NOT implemented | Registry installation |
| `flowscript search` | NOT implemented | Registry search |

The `parse` command exists in the implementation but is NOT mentioned in the spec.

### 11.2 Validator: Spec Features NOT Validated

| Feature | Spec Reference | Status |
|---------|---------------|--------|
| `database` source/sink type | Sec 3.2 | Not in valid types list |
| `queue` source type | Sec 3.2 | Not in valid types list |
| `email` sink type | Sec 3.2 | Not in valid types list |
| `reduce` transform type | Sec 3.2 | Not in valid types list |
| `<phase>` grouping | Sec 3.1 | Not parsed or validated |
| `<context>` element | Sec 3.6 | Not parsed or validated |
| `<on-error>` handling | Sec 3.5 | Not parsed or validated |
| `<on-workflow-error>` | Sec 3.5 | Not parsed or validated |
| `<delay>` temporal primitive | Sec 3.4 | Not parsed or validated |
| `<throttle>` temporal primitive | Sec 3.4 | Not parsed or validated |
| `<debounce>` temporal primitive | Sec 3.4 | Not parsed or validated |
| `<batch>` temporal primitive | Sec 3.4 | Not parsed or validated |
| `<timeout>` wrapper | Sec 3.4 | Not parsed or validated |
| `<include>` composition | Sec 3.7 | Not parsed or validated |
| `<call>` composition | Sec 3.7 | Not parsed or validated |
| `<schema>` definitions | Sec 5 | Not parsed or validated |
| `<state>` persistence | Sec 3.6 | Not parsed or validated |
| Pattern matching in branch | Sec 3.3 | Simplified to `when` conditions |
| `<goto>` / `<set>` elements | Sec 3.3 | Not validated |
| Input/output schema in frontmatter | Sec 2 | Not validated |
| Runtime settings validation | Sec 2 | Not validated beyond basic types |
| Evolution metadata | Sec 2 | Not validated |
| Circuit breaker error handling | Sec 3.5 | Not implemented |
| Dead letter queue | Sec 3.5 | Not implemented |

### 11.3 Trigger Validation Gap

The structural validator checks `trigger.type` against `['manual', 'webhook', 'schedule']`, but the spec defines triggers differently -- as a rich object with `schedule`, `webhook`, `manual`, `watch`, and `queue` sub-fields. The current validator expects a flat `type` field that doesn't match the spec's nested structure. The example workflows use `trigger: { manual: true }` which has no explicit `type` field.

---

## 12. Limitations, Edge Cases, and Issues

### 12.1 Dry-Run Config/Input Validation Gap

The dry-run mode returns before config overrides and input JSON are parsed/validated. This means `flowscript run file.flow.md --dry-run --input 'bad json'` succeeds, which could be confusing -- users might think their input is valid when it isn't. The test suite documents this as intentional behavior.

### 12.2 YAML Output Not Supported

The `parse` command advertises YAML output format but falls back to JSON with a message. Bun doesn't have native YAML serialization.

### 12.3 Secret Reference Detection is Source-Based

The secret reference validator scans raw source text rather than walking the AST. This is actually a strength (catches secrets anywhere), but it could produce false positives if `{{$secrets.NAME}}` appears inside markdown comments or the execution log footer.

### 12.4 Levenshtein Suggestions May Be Noisy

The "did you mean?" feature uses a maximum distance of `max(2, floor(len/3))`, which for short IDs (e.g., 3 chars) allows distance up to 2, potentially suggesting unrelated names.

### 12.5 No Expression Validation at Parse Time

The validator does not check expression syntax in `condition`, `when`, `collection`, or template attributes. Invalid expressions are only caught at runtime during execution.

### 12.6 Node Type Display Incomplete

The `getNodeTypeDisplay()` function in run.ts only handles `source`, `sink`, and `transform` with their subtypes. For control flow nodes (`if`, `loop`, `while`, `foreach`, `parallel`, `branch`, `checkpoint`), it just returns the bare type name without additional detail.

### 12.7 Limited JSON Format Support

While the validate command supports JSON output for both success and error cases, the run command only supports text format for dry-run and execution results. JSON output format for the run command is accepted but not meaningfully different from text.

### 12.8 Sequential File Validation

`validateFiles()` processes files sequentially rather than in parallel, which could be slow for large file sets. This is a minor performance issue.

### 12.9 Spinner Disabled with No-Color

When `--no-color` is passed to the run command, the `ora` spinner is completely disabled (set to null), not just de-colored. This means no progress indication at all in no-color mode.

### 12.10 Type Validator Depends on Zod Internals

The type compatibility checker uses `instanceof z.ZodObject` and accesses `.shape` directly, coupling it to Zod's internal API. This could break with Zod version updates.

### 12.11 Cycle Detection Ignores Nested Scope

The cycle detector treats all node IDs as globally scoped. Nodes nested inside loops, branches, or parallel blocks can reference nodes outside their scope, but the cycle detector builds a flat graph without considering scoping rules. This could miss valid cycles within nested structures or report false positives.

---

## 13. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `commander` | ^14.0.3 | CLI argument parsing |
| `chalk` | 4 | Terminal coloring (CommonJS version) |
| `ora` | ^9.3.0 | Terminal spinner for progress |
| `@babel/code-frame` | ^7.29.0 | Source code frame formatting |
| `zod` | ^4.3.6 | Schema validation (type validator) |

---

## 14. Summary

The CLI and Validator subsystem is well-structured and provides a solid foundation. The validate command offers comprehensive multi-pass validation with beautiful error output, and the run command orchestrates the full pipeline from parse to execution. However, the implementation covers roughly 20-30% of the spec's envisioned CLI surface area, with many advanced commands (watch, test, debug, inspect, registry) not yet implemented. The validator focuses on the currently-supported node types and doesn't validate features from the spec that haven't been implemented in the parser/runtime yet (phases, temporal primitives, composition, etc.). The error formatting is production-quality with Babel code frames, Levenshtein suggestions, and both text and JSON output modes.
