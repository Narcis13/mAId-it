---
phase: "01-foundation"
plan: "03"
subsystem: validator-cli
tags: [validator, cli, commander, code-frame, kahn-algorithm]

dependency-graph:
  requires:
    - 01-01  # AST types and error types
    - 01-02  # Parser implementation
  provides:
    - Multi-pass workflow validator
    - CLI validate command
    - Compiler-style error formatting
  affects:
    - 02-*  # Expression evaluator will use validation
    - 03-*  # Executor will validate before running

tech-stack:
  added:
    - "@babel/code-frame": "Error display with source context"
    - "@types/babel__code-frame": "TypeScript types"
  patterns:
    - "Multi-pass validation (structural, references, cycles)"
    - "Kahn's algorithm for cycle detection"
    - "Discriminated unions for type-safe node handling"
    - "Levenshtein distance for suggestion generation"

key-files:
  created:
    - src/validator/structural.ts
    - src/validator/references.ts
    - src/validator/cycles.ts
    - src/validator/index.ts
    - src/cli/format.ts
    - src/cli/validate.ts
  modified:
    - src/cli/index.ts
    - package.json

decisions:
  - "Multi-pass validation order: structural -> references -> cycles"
  - "Skip cycle detection if reference validation has errors"
  - "Levenshtein distance threshold: max(2, length/3)"
  - "Return top 3 similar suggestions for undefined references"
  - "Warnings don't fail validation unless --strict mode"

metrics:
  duration: "5 min"
  completed: "2026-02-02"
  tasks: 3
  files-created: 6
  files-modified: 2
  lines-added: ~2100
---

# Phase 01 Plan 03: Validator and CLI Summary

Multi-pass validator with compiler-style error output using @babel/code-frame

## What Was Built

### Multi-Pass Validator
- **Structural validation** - Required fields, valid attribute types
- **Reference validation** - Node refs, secret refs, duplicate IDs
- **Cycle detection** - Kahn's algorithm with cycle path reporting

### CLI Error Formatter
- Compiler-style output with source code context
- Color/no-color support
- JSON output format for tooling integration
- Hints for fixing errors

### CLI Validate Command
- `flowscript validate <files...>` validates workflow files
- Exit code 0 on valid, 1 on invalid
- Batch validation support
- `--strict` mode treats warnings as errors

## Validation Capabilities

| Feature | Error Code | Description |
|---------|-----------|-------------|
| Missing field | VALID_MISSING_REQUIRED_FIELD | Required attribute not present |
| Invalid type | VALID_INVALID_FIELD_TYPE | Wrong value for type attribute |
| Unknown node | VALID_UNKNOWN_NODE_TYPE | Unrecognized node element |
| Undefined ref | VALID_UNDEFINED_NODE_REF | Input references missing node |
| Undefined secret | VALID_UNDEFINED_SECRET_REF | Secret not declared in frontmatter |
| Duplicate ID | VALID_DUPLICATE_NODE_ID | Same ID used twice |
| Circular dep | VALID_CIRCULAR_DEPENDENCY | Nodes form dependency cycle |

## Example Output

```
error[VALID_UNDEFINED_NODE_REF]: Node "process" references undefined node "nonexistent"
  --> workflow.flow.md:9:0
   7 |   <url>https://example.com</url>
   8 | </source>
>  9 | <transform id="process" type="template" input="nonexistent">
     | ^^^^^^^^^^ Node "process" references undefined node "nonexistent"
  10 |   <template>{{input}}</template>
  11 | </transform>

hint: Did you mean: fetch?

Validation failed: 1 error
```

## Decisions Made

1. **Multi-pass order**: Structural first to catch basic errors, then references, then cycles (skipped if reference errors exist to avoid false positives)

2. **Suggestion algorithm**: Levenshtein distance with threshold `max(2, length/3)` provides good typo suggestions

3. **Cycle reporting**: Full cycle path shown (a -> b -> c -> a) rather than just "cycle detected"

4. **Warning vs Error**: Some checks are warnings (sink without input, loop without exit condition) that don't fail validation unless `--strict` is used

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Phase 1 Foundation is now complete. The validator provides:
- Clean API for execution engine to check workflows
- Error types with source locations for all validation passes
- CLI foundation for adding more commands

Ready to proceed to Phase 2 (Expression Evaluator) which will add runtime expression validation.
