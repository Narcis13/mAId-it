# Requirements: FlowScript

**Defined:** 2025-02-02
**Core Value:** Execute living markdown files as powerful, type-safe workflow programs with AI woven into every layer

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Parser

- [ ] **PARSE-01**: Engine parses YAML frontmatter from .flow.md files (name, version, trigger, config, secrets, input/output schemas)
- [ ] **PARSE-02**: Engine parses XML body into node AST (source, transform, sink, control flow nodes)
- [ ] **PARSE-03**: Engine preserves source locations for error messages
- [ ] **PARSE-04**: Engine handles malformed input with clear error messages
- [ ] **PARSE-05**: Parser is secure against XXE injection (DTD disabled)
- [ ] **PARSE-06**: Parser is secure against YAML deserialization attacks (safe mode)

### Validator

- [ ] **VALID-01**: Validator checks all required fields present on nodes
- [ ] **VALID-02**: Validator verifies all node references resolve to defined nodes
- [ ] **VALID-03**: Validator checks input/output type compatibility between connected nodes
- [ ] **VALID-04**: Validator detects circular dependencies and reports clear error
- [ ] **VALID-05**: Validator checks all referenced secrets are declared in frontmatter
- [ ] **VALID-06**: Validator ensures node IDs are unique within scope

### Expression Language

- [ ] **EXPR-01**: Engine evaluates template expressions `{{node.output}}`
- [ ] **EXPR-02**: Engine resolves variable references `$config.key`, `$secrets.NAME`, `$context.key`
- [ ] **EXPR-03**: Engine provides built-in functions (string, array, math, time)
- [ ] **EXPR-04**: Expression evaluation is sandboxed (no access to globals, no code injection)
- [ ] **EXPR-05**: Engine handles expression errors gracefully with context

### HTTP Runtime

- [ ] **HTTP-01**: HTTP source node makes GET requests with headers and params
- [ ] **HTTP-02**: HTTP source node makes POST requests with JSON body
- [ ] **HTTP-03**: HTTP source node supports bearer token authentication
- [ ] **HTTP-04**: HTTP sink node posts data to external endpoints
- [ ] **HTTP-05**: HTTP nodes support response extraction via JSONPath

### File Runtime

- [ ] **FILE-01**: File source node reads JSON files and parses content
- [ ] **FILE-02**: File source node reads text files as string
- [ ] **FILE-03**: File sink node writes JSON data to files
- [ ] **FILE-04**: File sink node writes text content to files
- [ ] **FILE-05**: File paths support template expressions

### AI Runtime

- [ ] **AI-01**: AI node calls OpenRouter API with model selection (claude-3.5-sonnet, gpt-4, etc.)
- [ ] **AI-02**: AI node supports system prompt and user prompt
- [ ] **AI-03**: AI node supports prompt templating with workflow data
- [ ] **AI-04**: AI node validates output against declared schema (using zod)
- [ ] **AI-05**: AI node retries on schema validation failure
- [ ] **AI-06**: AI node handles rate limits with backoff
- [ ] **AI-07**: AI node respects token budget configuration

### Transform Nodes

- [ ] **TRANS-01**: Template node renders strings with Handlebars-like syntax
- [ ] **TRANS-02**: Map node transforms each item in array using expression
- [ ] **TRANS-03**: Filter node filters array items based on condition expression

### Control Flow

- [ ] **CTRL-01**: Branch node routes based on pattern matching conditions
- [ ] **CTRL-02**: If/else node provides simple conditional routing
- [ ] **CTRL-03**: Loop node iterates with max count and break condition
- [ ] **CTRL-04**: While node iterates while condition is true
- [ ] **CTRL-05**: Foreach node iterates over collection items
- [ ] **CTRL-06**: Break statement exits current loop early
- [ ] **CTRL-07**: Goto statement jumps to named node

### Parallel Execution

- [ ] **PARA-01**: Scheduler builds DAG from node dependencies
- [ ] **PARA-02**: Scheduler calculates execution waves (nodes that can run in parallel)
- [ ] **PARA-03**: Executor runs wave nodes concurrently up to concurrency limit
- [ ] **PARA-04**: Parallel block runs child branches simultaneously
- [ ] **PARA-05**: Foreach supports max-concurrency attribute

### Error Handling

- [ ] **ERR-01**: Nodes support retry with exponential backoff
- [ ] **ERR-02**: Retry includes jitter to prevent thundering herd
- [ ] **ERR-03**: Nodes support fallback to alternative node on failure
- [ ] **ERR-04**: Nodes support configurable timeout
- [ ] **ERR-05**: Workflow-level error handler captures unhandled failures

### State & Persistence

- [ ] **STATE-01**: Engine persists execution state to JSON file after each wave
- [ ] **STATE-02**: Engine can resume failed workflow from last checkpoint
- [ ] **STATE-03**: Engine tracks node outputs for expression resolution
- [ ] **STATE-04**: Context hierarchy (global -> phase -> node) is maintained

### CLI

- [ ] **CLI-01**: `flowscript validate <file>` validates workflow without executing
- [ ] **CLI-02**: `flowscript run <file>` executes workflow and shows progress
- [ ] **CLI-03**: `flowscript run --dry-run` validates and shows execution plan
- [ ] **CLI-04**: CLI displays clear error messages with source locations
- [ ] **CLI-05**: CLI supports `--config key=value` overrides
- [ ] **CLI-06**: CLI supports `--input '{"field": "value"}'` for workflow input

### Checkpoints

- [ ] **CHKPT-01**: Checkpoint node pauses execution and prompts in terminal
- [ ] **CHKPT-02**: User can approve, reject, or provide input at checkpoint
- [ ] **CHKPT-03**: Checkpoint supports timeout with default action
- [ ] **CHKPT-04**: Checkpoint response is available to downstream nodes

### Execution Logging

- [ ] **LOG-01**: Engine appends execution log to markdown footer
- [ ] **LOG-02**: Log includes run ID, timestamp, duration, status
- [ ] **LOG-03**: Log includes per-node timing and status
- [ ] **LOG-04**: Log is human-readable markdown format

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Error Handling

- **ERR-10**: Circuit breaker pattern for repeated failures
- **ERR-11**: Dead letter queue for failed items
- **ERR-12**: Compensation/rollback logic

### Additional Nodes

- **NODE-01**: Database source/sink (SQL queries)
- **NODE-02**: Email sink (SendGrid, SMTP)
- **NODE-03**: Queue source/sink (Redis, SQS)
- **NODE-04**: Webhook trigger source

### Self-Evolution

- **EVOL-01**: Track execution metrics (success rate, duration trends)
- **EVOL-02**: Feedback loop for AI prompt improvement
- **EVOL-03**: Automatic prompt evolution based on outcomes

### Advanced Features

- **ADV-01**: Multi-provider AI failover
- **ADV-02**: Watch mode for file triggers
- **ADV-03**: Scheduled triggers (cron)
- **ADV-04**: Workflow composition (include/call)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Visual editor | Text-native is the core value proposition |
| Real-time collaboration | Git solves this better |
| Workflow marketplace | Ecosystem feature for later |
| Distributed execution | Single-process sufficient for v1 |
| Workflow genetics/breeding | Advanced paradigm for future |
| Adversarial verification | Multi-agent feature for later |
| Database-required state | File-based is simpler, sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 1 | Pending |
| PARSE-02 | Phase 1 | Pending |
| PARSE-03 | Phase 1 | Pending |
| PARSE-04 | Phase 1 | Pending |
| PARSE-05 | Phase 1 | Pending |
| PARSE-06 | Phase 1 | Pending |
| VALID-01 | Phase 1 | Pending |
| VALID-02 | Phase 1 | Pending |
| VALID-03 | Phase 4 | Pending |
| VALID-04 | Phase 1 | Pending |
| VALID-05 | Phase 1 | Pending |
| VALID-06 | Phase 1 | Pending |
| EXPR-01 | Phase 2 | Pending |
| EXPR-02 | Phase 2 | Pending |
| EXPR-03 | Phase 2 | Pending |
| EXPR-04 | Phase 2 | Pending |
| EXPR-05 | Phase 2 | Pending |
| HTTP-01 | Phase 3 | Pending |
| HTTP-02 | Phase 3 | Pending |
| HTTP-03 | Phase 3 | Pending |
| HTTP-04 | Phase 3 | Pending |
| HTTP-05 | Phase 3 | Pending |
| FILE-01 | Phase 3 | Pending |
| FILE-02 | Phase 3 | Pending |
| FILE-03 | Phase 3 | Pending |
| FILE-04 | Phase 3 | Pending |
| FILE-05 | Phase 3 | Pending |
| AI-01 | Phase 4 | Pending |
| AI-02 | Phase 4 | Pending |
| AI-03 | Phase 4 | Pending |
| AI-04 | Phase 4 | Pending |
| AI-05 | Phase 4 | Pending |
| AI-06 | Phase 4 | Pending |
| AI-07 | Phase 4 | Pending |
| TRANS-01 | Phase 5 | Pending |
| TRANS-02 | Phase 5 | Pending |
| TRANS-03 | Phase 5 | Pending |
| CTRL-01 | Phase 5 | Pending |
| CTRL-02 | Phase 5 | Pending |
| CTRL-03 | Phase 5 | Pending |
| CTRL-04 | Phase 5 | Pending |
| CTRL-05 | Phase 5 | Pending |
| CTRL-06 | Phase 5 | Pending |
| CTRL-07 | Phase 5 | Pending |
| PARA-01 | Phase 6 | Pending |
| PARA-02 | Phase 6 | Pending |
| PARA-03 | Phase 6 | Pending |
| PARA-04 | Phase 6 | Pending |
| PARA-05 | Phase 6 | Pending |
| ERR-01 | Phase 7 | Pending |
| ERR-02 | Phase 7 | Pending |
| ERR-03 | Phase 7 | Pending |
| ERR-04 | Phase 7 | Pending |
| ERR-05 | Phase 7 | Pending |
| STATE-01 | Phase 7 | Pending |
| STATE-02 | Phase 7 | Pending |
| STATE-03 | Phase 2 | Pending |
| STATE-04 | Phase 2 | Pending |
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 8 | Pending |
| CLI-03 | Phase 8 | Pending |
| CLI-04 | Phase 1 | Pending |
| CLI-05 | Phase 8 | Pending |
| CLI-06 | Phase 8 | Pending |
| CHKPT-01 | Phase 7 | Pending |
| CHKPT-02 | Phase 7 | Pending |
| CHKPT-03 | Phase 7 | Pending |
| CHKPT-04 | Phase 7 | Pending |
| LOG-01 | Phase 7 | Pending |
| LOG-02 | Phase 7 | Pending |
| LOG-03 | Phase 7 | Pending |
| LOG-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 60 total
- Mapped to phases: 60
- Unmapped: 0

---
*Requirements defined: 2025-02-02*
*Last updated: 2025-02-02 after roadmap creation*
