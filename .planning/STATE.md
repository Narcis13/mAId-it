# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-02-02)

**Core value:** Execute living markdown files as powerful, type-safe workflow programs with AI woven into every layer
**Current focus:** Phase 7 - Production Readiness (Not started)

## Current Position

Phase: 6 of 8 (Scheduling & Parallelism) - VERIFIED
Plan: 4 of 4 in current phase
Status: Phase 6 complete and verified
Last activity: 2026-02-05 - Phase 6 verified and complete

Progress: [███████████████████████] 79%

## Performance Metrics

**Velocity:**
- Total plans completed: 23
- Average duration: 2.9 min
- Total execution time: 1.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 5 | 22 min | 4 min |
| 02-expression-execution-core | 3 | 10 min | 3.3 min |
| 03-source-sink-runtimes | 3 | 7 min | 2.3 min |
| 04-ai-integration | 4 | 8 min | 2 min |
| 05-transform-control-flow | 4 | 10 min | 2.5 min |
| 06-scheduling-parallelism | 4 | 11 min | 2.75 min |

**Recent Trend:**
- Last 5 plans: 05-04 (4 min), 06-01 (2 min), 06-02 (2 min), 06-03 (3 min), 06-04 (4 min)
- Trend: Stable

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
- [02-03]: Context hierarchy: node > phase > global via Object.assign order
- [02-03]: Node outputs exposed as nodeId.output pattern for expression access
- [02-03]: Secret redaction: show keys only, replace values with [REDACTED]
- [02-03]: null/undefined render as empty string in templates (cleaner output)
- [03-01]: NodeRuntime interface uses generics for type-safe config/input/output
- [03-01]: HttpError.isRetryable returns true for 429 and 5xx status codes
- [03-01]: Object.setPrototypeOf in error constructors for proper prototype chain
- [03-01]: RuntimeRegistry uses Map internally for O(1) lookup
- [03-02]: JMESPath extraction at source level via config.extract
- [03-02]: Separate registry.ts to avoid circular imports (http -> registry, not http -> index)
- [03-02]: Default timeout 30 seconds for HTTP operations
- [03-02]: Sink returns metadata (status, statusText, headers), not response body
- [03-03]: Path traversal blocked: ../ and absolute paths rejected for sandbox security
- [03-03]: Auto-format detection: .json extension triggers JSON parsing, else text
- [03-03]: Bun.file().json() over .text() + JSON.parse() for optimized parsing
- [03-03]: Import from registry.ts to avoid circular deps (not ../index)
- [04-01]: AIErrorCode uses four categories: TIMEOUT, RATE_LIMIT, VALIDATION, API_ERROR
- [04-01]: SchemaValidationError stores failedOutput and validationMessage for retry prompts
- [04-01]: Full jitter backoff capped at 32 seconds following AWS best practices
- [04-01]: isRateLimitError detects both status 429 and 'rate limit' in error message
- [04-02]: Recursive parser with splitByCommaRespectingBraces for nested structures
- [04-02]: findFirstColonOutsideBraces for correct key:value parsing in nested contexts
- [04-02]: Object.setPrototypeOf in SchemaDSLError for proper instanceof behavior
- [04-03]: Tool calling forces structured output via OpenRouter API
- [04-03]: Prompts extracted from config.system and config.user (parser child elements)
- [04-03]: Input added to nodeContext for template resolution
- [04-03]: AbortSignal.timeout for request timeout (native API)
- [04-03]: Validation happens after tool call extraction, not during
- [04-04]: Warnings not errors for type mismatches since AI output types resolve at runtime
- [04-04]: Pass 4 placement for type validation (runs only if no prior errors)
- [04-04]: Field access extraction via pattern {{nodeId.output.field}} extracts 'field' for schema check
- [05-01]: BreakSignal has optional targetLoopId for breaking specific outer loops
- [05-01]: GotoSignal has required targetNodeId for executor handling
- [05-01]: DEFAULT_MAX_ITERATIONS = 1000 as safety bound for all loops
- [05-01]: Transform configs use $item, $index, $first, $last, $items iteration variables
- [05-02]: Input added to nodeContext for template access (consistent with AI runtime)
- [05-02]: Array coercion wraps single values for defensive map/filter handling
- [05-02]: Filter returns original items not booleans (standard filter semantics)
- [05-03]: Control flow runtimes return metadata, executor handles body execution
- [05-03]: Branch/If evaluate conditions and return which branch to take with bodyNodeIds
- [05-03]: Loop/While/Foreach return iteration metadata with bodyNodeIds for executor
- [05-03]: Break/Goto always throw signals, return type is 'never'
- [05-04]: Auto-registration pattern: import side-effect registers runtimes with global registry
- [05-04]: Re-export all runtime types and signals from main index for convenient imports
- [06-01]: Semaphore passes permits directly to waiting tasks without incrementing pool
- [06-01]: Wave 0 contains nodes with no dependencies; subsequent waves depend only on completed waves
- [06-01]: DEFAULT_MAX_CONCURRENCY = 10 for wave execution
- [06-01]: Control flow nodes handle body execution internally; only top-level nodes participate in wave scheduling
- [06-02]: executeNode accepts nodes Map parameter for control flow handlers (06-03/04)
- [06-02]: State cloning uses structuredClone for deep nodeContext copy
- [06-02]: nodeResults shared across cloned states (nodeId provides isolation)
- [06-02]: Fail-fast error handling: first error stops wave and throws
- [06-02]: Node output exposed in nodeContext for expression access
- [06-03]: ParallelResult contains branches array, branchCount, and optional maxConcurrency
- [06-03]: cloneStateForBranch injects $branch index into nodeContext for branch identification
- [06-03]: Branch-specific maxConcurrency overrides global if provided
- [06-03]: Fail-fast error handling: first branch error surfaced immediately
- [06-04]: Clone state BEFORE resolving config so 'input' is available in templates
- [06-04]: Check nodeResult.status after execution and throw on failure for fail-fast
- [06-04]: Sequential foreach: break stops all iterations; parallel: break only stops own
- [06-04]: ForeachResult.bodyNodeIds are string IDs; executor looks up NodeAST from nodes map

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-05
Stopped at: Completed 06-04-PLAN.md (Phase 6 complete)
Resume file: None

## Phase Commits

| Phase | First Commit | Phase Directory | Recorded |
|-------|--------------|-----------------|----------|
| 01-foundation | d26a3a0 | .planning/phases/01-foundation | 2026-02-02 |
| 02-expression-execution-core | 5bbc844 | .planning/phases/02-expression-execution-core | 2026-02-02 |
| 03-source-sink-runtimes | e15a010 | .planning/phases/03-source-sink-runtimes | 2026-02-02 |
| 04-ai-integration | e623d91 | .planning/phases/04-ai-integration | 2026-02-04 |
| 05-transform-control-flow | 3b51b0d | .planning/phases/05-transform-control-flow | 2026-02-05 |
| 06-scheduling-parallelism | c75e8f6 | .planning/phases/06-scheduling-parallelism | 2026-02-05 |
