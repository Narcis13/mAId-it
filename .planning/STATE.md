# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-02-02)

**Core value:** Execute living markdown files as powerful, type-safe workflow programs with AI woven into every layer
**Current focus:** Phase 2 - Expression & Execution Core (In progress)

## Current Position

Phase: 2 of 8 (Expression & Execution Core)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-02 - Completed 02-02-PLAN.md (Built-in Functions Library)

Progress: [███████░░░] 18%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 4 min
- Total execution time: 0.48 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 22 min | 4 min |
| 02-expression-execution-core | 2 | 7 min | 3.5 min |

**Recent Trend:**
- Last 5 plans: 01-03 (5 min), 01-04 (2 min), 01-05 (3 min), 02-01 (4 min), 02-02 (3 min)
- Trend: Stable/Improving

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from research build order (Parser -> Validator -> CLI -> Expression -> Executor -> HTTP -> File -> AI -> Transform -> Control -> Scheduler -> Error -> State -> Checkpoint -> Logging -> Full CLI)
- [Roadmap]: Grouped HTTP+File together (same pattern), Transform+Control together (both data manipulation), Error+State+Checkpoint+Logging together (all production concerns)
- [01-01]: Used discriminated unions for NodeAST type-safe handling
- [01-01]: 1-indexed lines, 0-indexed columns for source locations (Babel convention)
- [01-01]: ErrorCode enum covers parse, structural, reference, and graph validation categories
- [01-02]: processEntities: false in XMLParser for XXE injection prevention
- [01-02]: Bun.YAML used for safe YAML parsing (no arbitrary code execution)
- [01-02]: ParseResult union type pattern for success/error handling
- [01-03]: Multi-pass validation order: structural -> references -> cycles
- [01-03]: Skip cycle detection if reference validation has errors
- [01-03]: Levenshtein distance threshold: max(2, length/3) for suggestions
- [01-04]: Secret pattern `{{$secrets.NAME}}` (dollar sign inside braces)
- [01-04]: Scan raw source for secrets instead of node.config to catch XML child elements
- [01-05]: Semver pattern /^\d+\.\d+(\.\d+)?$/ for X.Y.Z or X.Y formats (no v prefix, no prerelease)
- [02-01]: jsep bitwise ops removed (not needed in workflows)
- [02-01]: Nullish coalescing (??) added to jsep at lowest precedence
- [02-01]: BLOCKED_PROPS Set for __proto__, constructor, prototype security
- [02-01]: Only Identifier callee allowed for function calls (no obj.method())
- [02-01]: Null-safe member access returns undefined instead of throwing
- [02-02]: Luxon for date/time operations (ESM-native, robust timezone handling)
- [02-02]: All 115 functions null-safe - return defaults instead of throwing
- [02-02]: Central registry pattern: getBuiltinFunctions() returns flat Record<string, Function>

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-02
Stopped at: Completed 02-02-PLAN.md (Built-in Functions Library)
Resume file: None

## Phase Commits

| Phase | First Commit | Phase Directory | Recorded |
|-------|--------------|-----------------|----------|
| 01-foundation | d26a3a0 | .planning/phases/01-foundation | 2026-02-02 |
| 02-expression-execution-core | 5bbc844 | .planning/phases/02-expression-execution-core | 2026-02-02 |
