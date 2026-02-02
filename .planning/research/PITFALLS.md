# Pitfalls Research: FlowScript

This document captures common mistakes and failure patterns in workflow engine development, based on real-world failures from Airflow, Temporal, Prefect, and other production systems.

---

## Parser Pitfalls

### YAML Deserialization Attacks
- **What goes wrong**: YAML parsers in most languages (Python, Ruby, Java) allow arbitrary object instantiation by default. An attacker can craft a malicious YAML document that executes arbitrary code when parsed. The SnakeYAML CVE-2022-1471 and Ruby on Rails YAML vulnerability are notable examples.
- **Warning signs**: Using `yaml.load()` instead of `yaml.safe_load()`, enabling custom tag constructors, accepting YAML from untrusted sources
- **Prevention**:
  - Always use safe parsing modes (`yaml.safe_load()` in Python, SafeConstructor in Java)
  - Never deserialize arbitrary objects from YAML
  - Whitelist allowed types explicitly
  - Validate YAML structure against a schema before processing
- **Phase impact**: Core Parser (Phase 1) - must be secure from the start

### XML External Entity (XXE) Injection
- **What goes wrong**: XML parsers process external entity references by default, allowing attackers to read arbitrary files, perform SSRF attacks, or cause denial of service. XXE vulnerabilities were found in LangChain libraries as recently as 2024 (CVE-2024-1455).
- **Warning signs**: Processing XML from user input, DTD processing enabled, using older XML libraries
- **Prevention**:
  - Disable DTD processing entirely
  - Disable external entity loading
  - Use defusedxml in Python or equivalent safe parsers
  - Consider using JSON for data exchange where possible
- **Phase impact**: Core Parser (Phase 1) - critical security requirement

### XML Billion Laughs / Entity Expansion Attack
- **What goes wrong**: Nested entity definitions expand exponentially, consuming gigabytes of memory from a few KB of input. A small XML file can bring down servers. Still actively exploited in 2024-2025.
- **Warning signs**: Accepting XML input, no entity expansion limits, no input size validation
- **Prevention**:
  - Disable DTD processing (eliminates the entire attack class)
  - Set entity expansion limits
  - Limit input size before parsing
  - Consider JSON as an alternative (no entity expansion)
- **Phase impact**: Core Parser (Phase 1)

### Parser Differentials Between Languages/Libraries
- **What goes wrong**: Different YAML/XML parsers handle edge cases differently. Duplicate keys, type coercion, anchor references, and multi-document streams behave inconsistently. Trail of Bits documented authentication bypasses (CVE-2020-16250 in HashiCorp Vault) from parser differentials.
- **Warning signs**: Using multiple parsers in the same pipeline, assuming consistent behavior across environments
- **Prevention**:
  - Test parser behavior explicitly for edge cases
  - Document expected parser behavior
  - Use strict mode where available (YAML 1.2 strict mode rejects duplicate keys)
  - Validate parsed output against schema, not just input format
- **Phase impact**: Core Parser (Phase 1)

### Markdown/Frontmatter Boundary Confusion
- **What goes wrong**: YAML frontmatter delimiters (`---`) are ambiguous in documents containing multiple YAML document separators or horizontal rules. Edge cases in mixed YAML+XML+Markdown formats create parsing ambiguity.
- **Warning signs**: Inconsistent parsing results, delimiter conflicts between formats
- **Prevention**:
  - Define clear, unambiguous boundary syntax
  - Use distinct delimiters for different sections
  - Parse in explicit order with well-defined state machine
  - Add explicit section markers beyond just `---`
- **Phase impact**: Core Parser (Phase 1)

---

## Execution Pitfalls

### Race Conditions in Parallel Task Completion
- **What goes wrong**: Multiple parallel tasks completing simultaneously trigger concurrent updates to the same downstream task record. Netflix's Maestro team documented this extensively. Without proper handling, task states become inconsistent, dependencies get corrupted, or tasks execute multiple times.
- **Warning signs**: Intermittent failures in parallel workflows, inconsistent task counts, duplicate executions
- **Prevention**:
  - Implement optimistic locking with version attributes
  - Use compare-and-swap operations for state updates
  - Design for idempotent task execution
  - Implement proper transaction boundaries
- **Phase impact**: Wave Execution (Phase 3) - critical for parallel execution

### Memory Leaks from Workflow Instance Accumulation
- **What goes wrong**: Workflow runtime objects accumulate and aren't properly garbage collected. The n8n project (Issue #16862) experienced this where webhook-triggered workflows failed with memory errors, then all subsequent executions failed instantly due to corrupted memory state.
- **Warning signs**: Memory usage growing over time, sudden failures after sustained load, failures that persist after individual workflow completion
- **Prevention**:
  - Use object pooling with explicit lifecycle management
  - Implement proper cleanup on workflow completion/failure
  - Avoid per-request object instantiation for long-lived components
  - Profile memory under sustained load, not just unit tests
- **Phase impact**: Wave Execution (Phase 3), Runtime Infrastructure

### Single Point of Failure in Scheduler
- **What goes wrong**: Airflow's centralized scheduler is a documented SPOF. If the scheduler goes down or the database locks up, all workflows halt and require manual intervention (backfills) to recover.
- **Warning signs**: Single scheduler instance, shared database bottleneck, no failover mechanism
- **Prevention**:
  - Design for scheduler redundancy from the start
  - Implement graceful degradation
  - Use distributed coordination (leader election) if needed
  - Keep workflow state independent of scheduler state
- **Phase impact**: Architecture decision (Phase 1), Scale considerations (later phases)

### Error Propagation Without Context
- **What goes wrong**: Errors bubble up without preserving the execution context, making debugging nearly impossible. Teams report spending hours piecing together logs from multiple sources in Airflow compared to minutes with Temporal's execution history.
- **Warning signs**: Generic error messages, lost stack traces, no correlation between related errors
- **Prevention**:
  - Capture full execution history at each step
  - Preserve input/output/error for every task
  - Implement structured logging with correlation IDs
  - Build debugging UI into the system early
- **Phase impact**: Error Handling (Phase 2), Developer Experience

### Zombie Tasks and Orphaned Processes
- **What goes wrong**: Tasks that crash without proper cleanup leave orphaned processes or hold resources. The workflow engine thinks the task is still running, but no progress is made.
- **Warning signs**: Tasks stuck in "running" state, resource exhaustion, timeouts not triggering
- **Prevention**:
  - Implement heartbeat mechanisms
  - Use process groups for cleanup
  - Set appropriate timeouts at multiple levels
  - Design for crash recovery, not just graceful shutdown
- **Phase impact**: Wave Execution (Phase 3)

---

## AI Integration Pitfalls

### Token Limit Exceeded Mid-Response
- **What goes wrong**: LLM requests fail partway through because input + expected output exceeds context limits. Partial responses corrupt workflow state.
- **Warning signs**: Intermittent failures on longer inputs, truncated outputs, model-specific failures
- **Prevention**:
  - Calculate token counts before sending requests
  - Implement chunking strategies for large inputs
  - Reserve tokens for expected output size
  - Set max_tokens appropriately
  - Handle partial responses gracefully
- **Phase impact**: AI Task Execution (Phase 4)

### Rate Limit Cascade Failures
- **What goes wrong**: Hitting rate limits triggers retries across multiple concurrent tasks, which amplifies the problem. The system spirals into a state where almost all requests are retried failures.
- **Warning signs**: Sudden cluster-wide failures, exponentially growing retry queues, 429 errors dominating logs
- **Prevention**:
  - Implement token bucket or leaky bucket rate limiting client-side
  - Use rolling window counters to stay under limits
  - Add jitter to retry backoff
  - Implement circuit breakers
  - Queue requests with rate-aware scheduling
- **Phase impact**: AI Task Execution (Phase 4)

### Structured Output Parsing Failures
- **What goes wrong**: LLMs produce syntactically invalid JSON 7-27% of the time without constraints. Field names change between calls. A prompt working in testing fails after model updates. The downstream system crashes on unexpected field types.
- **Warning signs**: JSON parse errors, missing required fields, type mismatches, inconsistent schemas
- **Prevention**:
  - Use native structured output APIs (OpenAI Structured Outputs, not just JSON mode)
  - Implement schema validation with retry on failure
  - Use constrained decoding for open-source models
  - Never ship "prompt-only JSON" to production
  - Design for 73% baseline validity, not 100%
- **Phase impact**: AI Task Execution (Phase 4) - critical for reliable AI integration

### LLM Hallucinating Function Calls
- **What goes wrong**: When using function calling / tool use, models hallucinate function names that don't exist or arguments that are invalid. The workflow engine tries to execute non-existent functions.
- **Warning signs**: Unknown function errors, argument validation failures, unexpected tool calls
- **Prevention**:
  - Validate function names against registered tools before execution
  - Validate arguments against function schemas
  - Implement allowlists for callable functions
  - Use retry with correction for minor hallucinations
- **Phase impact**: AI Task Execution (Phase 4)

### Model Provider Outages
- **What goes wrong**: OpenRouter, OpenAI, or other providers go down, and all AI tasks fail. No fallback mechanism exists.
- **Warning signs**: Cluster-wide AI task failures, timeout patterns matching provider status
- **Prevention**:
  - Implement fallback model configuration
  - Support multiple providers
  - Cache successful responses where appropriate
  - Design workflows to degrade gracefully without AI
- **Phase impact**: AI Task Execution (Phase 4)

### Cost Explosion from Retry Loops
- **What goes wrong**: Failed AI tasks retry infinitely, burning through API budgets. A single bug can cost thousands of dollars in API calls.
- **Warning signs**: Unexpected billing spikes, high retry counts, loops of identical requests
- **Prevention**:
  - Implement budget limits at workflow and task level
  - Set maximum retry counts
  - Add circuit breakers on repeated failures
  - Log and alert on unusual API usage patterns
- **Phase impact**: AI Task Execution (Phase 4), Operations

---

## Expression Language Pitfalls

### Expression Language Injection (EL Injection)
- **What goes wrong**: User-controlled data enters the expression interpreter, allowing arbitrary code execution. The Apache Struts CVE-2017-5638 (OGNL injection) was exploited via malicious Content-Type headers. Impact includes RCE, data theft, and complete server compromise.
- **Warning signs**: User input concatenated into expressions, dynamic expression construction, no input validation
- **Prevention**:
  - Never concatenate user input into expressions
  - Use parameterized expressions with data passed separately
  - Whitelist allowed expression functions
  - Sandbox expression evaluation
  - Validate input before it reaches the expression evaluator
- **Phase impact**: Expression Language (Phase 2) - security critical

### Server-Side Template Injection (SSTI)
- **What goes wrong**: Template engines execute user input as template code, leading to RCE. Even when full RCE isn't possible, attackers can read sensitive files and data.
- **Warning signs**: User input in template strings, dynamic template construction, insufficient sandboxing
- **Prevention**:
  - Use "logic-less" template engines (Mustache) where possible
  - Separate data from template logic
  - Sandbox template execution
  - Remove dangerous modules/functions from template context
- **Phase impact**: Expression Language (Phase 2)

### Exponential Expression Complexity
- **What goes wrong**: Complex nested expressions take exponential time to evaluate. A carefully crafted expression can cause denial of service.
- **Warning signs**: Expression evaluation timeouts, CPU spikes on specific workflows, nested function calls
- **Prevention**:
  - Limit expression nesting depth
  - Set evaluation timeouts
  - Implement expression complexity analysis
  - Cache expression parse trees
- **Phase impact**: Expression Language (Phase 2)

### Type Coercion Bugs
- **What goes wrong**: Implicit type coercion produces unexpected results. `"5" + 3` could equal `"53"` or `8` depending on implementation. These bugs are subtle and context-dependent.
- **Warning signs**: Inconsistent expression results, type-related errors in production, user confusion
- **Prevention**:
  - Use explicit typing in expressions
  - Document type coercion rules clearly
  - Prefer strict type checking over implicit coercion
  - Test edge cases with mixed types
- **Phase impact**: Expression Language (Phase 2)

### Unbounded String Operations
- **What goes wrong**: String operations (regex, concatenation, formatting) on large inputs consume unbounded memory or time.
- **Warning signs**: Memory spikes during expression evaluation, regex timeouts, string operation hangs
- **Prevention**:
  - Limit input sizes for string operations
  - Use regex with timeout/backtracking limits
  - Implement streaming for large string operations
- **Phase impact**: Expression Language (Phase 2)

---

## State Management Pitfalls

### State Corruption from Partial Updates
- **What goes wrong**: A failure mid-update leaves state partially written. On recovery, the system sees inconsistent state that doesn't match any valid workflow position.
- **Warning signs**: State validation failures after recovery, "impossible" state combinations, data integrity errors
- **Prevention**:
  - Use transactions for multi-field updates
  - Implement write-ahead logging
  - Design state as append-only where possible
  - Validate state consistency on read
- **Phase impact**: State Management (Phase 2), Recovery (Phase 3)

### Lost State on Process Crash
- **What goes wrong**: Workflow state is held in memory and lost when the process crashes. Long-running workflows lose all progress.
- **Warning signs**: Workflows restart from beginning after crashes, no persistence layer, state only in memory
- **Prevention**:
  - Implement durable state persistence
  - Checkpoint state at each significant step
  - Use Temporal-style automatic state capture
  - Design for crash recovery from any point
- **Phase impact**: State Management (Phase 2) - fundamental design decision

### Checkpoint Explosion
- **What goes wrong**: Immutable state snapshots accumulate forever. Each workflow step creates new state, and storage grows unbounded. LangGraph multi-agent documentation notes this as a memory concern.
- **Warning signs**: Storage growth over time, slow state retrieval, cleanup processes falling behind
- **Prevention**:
  - Implement checkpoint pruning strategies
  - Use differential checkpoints where possible
  - Set retention policies
  - Monitor storage usage
- **Phase impact**: State Management (Phase 2)

### Recovery to Wrong State
- **What goes wrong**: Recovery logic restores to a checkpoint that has been superseded or invalidated by external changes. The recovered workflow operates on stale assumptions.
- **Warning signs**: Side effects re-executed, data inconsistencies after recovery, user complaints about duplicate actions
- **Prevention**:
  - Design for idempotent task execution
  - Track external side effects separately from workflow state
  - Implement compensation logic for recovery
  - Validate external state before resuming
- **Phase impact**: Recovery Mechanisms (Phase 3)

### State Version Incompatibility
- **What goes wrong**: Workflow definition changes but persisted state uses the old schema. Deserialization fails or produces corrupted state.
- **Warning signs**: Deserialization errors after updates, workflows stuck after deployment, version-specific failures
- **Prevention**:
  - Version state schemas explicitly
  - Implement state migration logic
  - Support reading old versions during transition
  - Test workflow upgrades with in-flight workflows
- **Phase impact**: State Management (Phase 2), Operations

### Distributed State Synchronization Failures
- **What goes wrong**: In distributed systems, state changes aren't properly ordered. Vector clocks or logical timestamps are needed but not implemented. Causality violations corrupt workflow logic.
- **Warning signs**: Out-of-order events, causality violations, inconsistent views across nodes
- **Prevention**:
  - Implement vector clocks or logical timestamps
  - Use single-writer patterns where possible
  - Design for eventual consistency where appropriate
  - Implement conflict resolution strategies
- **Phase impact**: Scale considerations (later phases)

---

## Critical Mistakes (Project-Level)

### Building Custom DSL That Requires Constant Extension
**Why it kills projects**: Almost every medium-to-large company using Airflow ends up writing a custom DSL or maintaining significant proprietary plugins. This makes upgrading difficult and dramatically increases maintenance burden. FlowScript's .flow.md format must be carefully designed to be extensible without modification.

### Ignoring Scalability Until It's Too Late
**Why it kills projects**: Systems designed for single-node execution often can't be retrofitted for distribution. Architectural decisions made early (single scheduler, in-memory state, synchronous execution) become impossible to change under production load.

### Insufficient Testing Beyond Happy Path
**Why it kills projects**: Workflow engines face extreme edge cases - crashes mid-transaction, network partitions, out-of-order events. Issues that pass lower environments (short tests) surface under sustained production load. Memory leaks, race conditions, and state corruption only appear at scale.

### Over-Automation / Feature Creep
**Why it kills projects**: In the quest for efficiency, teams automate everything. Not every process benefits from automation. Some tasks require human judgment. Adding features without clear objectives leads to overcomplicated workflows that nobody can maintain.

### Treating It as a One-Time Project
**Why it kills projects**: Workflow automation isn't static. Business needs change, integrations evolve, and edge cases accumulate. Without regular reviews and iteration, systems become brittle and disconnected from actual requirements.

### Poor Error Visibility and Debugging
**Why it kills projects**: When workflows fail in production, teams need to understand why quickly. Systems that make debugging difficult (scattered logs, lost context, no execution history) cause operational burnout and erode trust in automation.

### Ignoring Feedback from Users
**Why it kills projects**: Workflow operators interact with the system daily. Ignoring their feedback leads to disconnect between the system design and actual needs, causing inefficiencies and adoption resistance.

### No Budget/Cost Controls for AI Integration
**Why it kills projects**: AI API costs can spiral unexpectedly. Without budget limits, retry caps, and monitoring, a single bug or attack can generate massive bills. This is especially dangerous because costs are incurred immediately while value is uncertain.

---

## References

- [Trail of Bits: Security Footguns in Go's Parsers](https://blog.trailofbits.com/2025/06/17/unexpected-security-footguns-in-gos-parsers/)
- [Snyk: Unsafe Deserialization in SnakeYAML](https://snyk.io/blog/unsafe-deserialization-snakeyaml-java-cve-2022-1471/)
- [OWASP: Expression Language Injection](https://owasp.org/www-community/vulnerabilities/Expression_Language_Injection)
- [OWASP: XML External Entity Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- [PortSwigger: Server-Side Template Injection](https://portswigger.net/web-security/server-side-template-injection)
- [Netflix Tech Blog: 100X Faster Maestro](https://netflixtechblog.com/100x-faster-how-we-supercharged-netflix-maestros-workflow-engine-028e9637f041)
- [AWS: Dynamic Workflow Orchestration with DynamoDB](https://aws.amazon.com/blogs/database/build-a-dynamic-workflow-orchestration-engine-with-amazon-dynamodb-and-aws-lambda/)
- [Temporal: Error Handling in Distributed Systems](https://temporal.io/blog/error-handling-in-distributed-systems)
- [QBurst: Beyond Airflow - Lessons from Implementing Temporal](https://blog.qburst.com/2025/05/beyond-airflow-lessons-from-implementing-temporal/)
- [Agenta: Guide to Structured Outputs and Function Calling](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
- [TrueFoundry: Rate Limiting in AI Gateway](https://www.truefoundry.com/blog/rate-limiting-in-llm-gateway)
- [n8n Memory Leak Issue #16862](https://github.com/n8n-io/n8n/issues/16862)
