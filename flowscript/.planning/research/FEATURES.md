# Features Research: FlowScript

> Research conducted: February 2026
> Focus: Workflow engine features landscape - table stakes, differentiators, anti-features

---

## Table Stakes (Must Have)

These are non-negotiable features. Without them, users will leave for alternatives.

### Core Node Types

- **Trigger nodes** — Every workflow needs an entry point. Webhooks, schedules (cron), manual triggers, and event listeners are universal expectations.
- **Action nodes** — The workhorses: HTTP requests, database operations, file operations, API calls. Users expect 100+ pre-built integrations minimum.
- **Transform nodes** — Data manipulation: JSON parsing, filtering, mapping, aggregation. Every workflow moves and reshapes data.
- **Logic nodes** — Conditional branching (if/else), switches, routers. Decision-making is fundamental.
- **Output nodes** — Sending results somewhere: notifications, emails, webhook responses, file writes.

### Control Flow

- **Sequential execution** — Steps run in order. The most basic pattern, but must be rock-solid.
- **Parallel execution** — Run multiple branches simultaneously. Critical for performance when tasks are independent.
- **Conditional branching** — If/else logic. Users expect exclusive choice (one path) and inclusive choice (multiple paths).
- **Loops** — Iterate over collections. For-each, while, do-until patterns are standard.
- **Synchronization/Join** — Wait for multiple parallel branches to complete before continuing.
- **Sub-workflows** — Compose workflows from other workflows. Reusability is expected.

### Error Handling

- **Retry with backoff** — Automatic retry for transient failures. Exponential backoff (1s, 2s, 4s...) with jitter is the standard. Typical config: 3-5 retries, max 100s interval.
- **Error classification** — Distinguish retryable errors (network timeout, 5xx) from non-retryable (4xx, validation errors).
- **Fallback paths** — Alternative execution paths when primary fails.
- **Dead letter queues** — Capture failed executions for manual review/replay.
- **Timeout handling** — Every operation needs configurable timeouts.

### Basic Observability

- **Execution logs** — See what happened, when, with what data.
- **Status tracking** — Pending, running, completed, failed states visible in real-time.
- **Error messages** — Clear, actionable error information.
- **Basic metrics** — Execution count, success/failure rates, duration.

### Data Management

- **Input/output schemas** — Define expected data shapes at workflow boundaries.
- **Variable passing** — Data flows between nodes cleanly.
- **Secret management** — API keys, credentials stored securely, never in plain text.
- **Context/state access** — Access to execution metadata (timestamp, run ID, etc.).

---

## Differentiators

### What Makes Competitors Special

#### n8n
- **Fair-code self-hosting** — Full data privacy, no vendor lock-in, deploy anywhere
- **Visual + code hybrid** — Drag-and-drop with embedded JavaScript/Python for power users
- **Execution-based pricing** — No per-step or per-user limits, predictable costs
- **400+ integrations** — Massive pre-built connector library
- **Native AI/LLM nodes** — LangChain integration, local model support, model flexibility
- **Queue mode scalability** — 220 executions/second on single instance
- **Git-based version control** — Workflows as code for proper DevOps

#### Temporal
- **Durable execution** — Workflows survive crashes, picking up exactly where they left off
- **Event history** — Complete, durable log of everything that happened
- **Long-running workflows** — Can run for years, surviving infrastructure failures
- **Deterministic replay** — Crash becomes a non-event; state recreated automatically
- **Strong consistency guarantees** — Never loses state, even if entire cluster crashes
- **Code-native** — Workflows are real code (Go, Java, Python, TypeScript), not config
- **Built-in durability features** — Automatic retries, timeouts, heartbeats without explicit handling

#### Prefect
- **Pure Python, no DAG constraints** — Native control flow (if/else, while), not rigid DAG structures
- **Decorator-based API** — Single decorator to orchestrate; minimal boilerplate
- **Task mapping** — Dynamic parallelism over collections
- **Work pools** — Decouple code from infrastructure; switch Docker/K8s/serverless without code changes
- **Smart caching** — Skip tasks whose inputs haven't changed
- **Hybrid execution** — Run anywhere, Prefect just observes and coordinates
- **Event-driven workflows** — Native event patterns, not just scheduled batch

#### Zapier/Make (What to Learn From)
- **Zero learning curve** — Non-technical users productive in minutes
- **Template marketplace** — Pre-built workflows for common use cases
- **App ecosystem** — Thousands of integrations maintained by platform

### FlowScript's Unique Angle

The text-native + AI-first approach enables capabilities that visual tools cannot match:

1. **Git-native workflows**
   - Full version control with meaningful diffs
   - Branch workflows like code; merge, review, rollback
   - CI/CD integration (test workflows before deploy)
   - Collaborative editing with proper conflict resolution

2. **Text = Portability**
   - Copy-paste workflows in Slack, docs, issues
   - LLMs can read, write, and modify workflows directly
   - No proprietary export/import formats
   - Grep, sed, awk work on workflows

3. **AI as First-Class Citizen**
   - LLMs understand Markdown/YAML/XML natively
   - AI can generate, explain, debug, optimize workflows
   - Prompt engineering in workflow definition, not separate config
   - Chain AI steps with type safety

4. **Progressive Complexity**
   - Start with readable Markdown
   - Add YAML frontmatter when you need config
   - Add XML body when you need complex logic
   - Never forced into complexity you don't need

5. **Documentation Built-In**
   - Markdown footer for learnings, notes, history
   - Workflow IS the documentation
   - Runbooks that actually run

6. **Lightweight Runtime**
   - No database required for simple workflows
   - Single binary, no cluster management
   - Local-first development (unlike Airflow's 4-service minimum)

---

## Anti-Features (Avoid)

Features that add complexity without proportional value.

### Visual-Only Editor
- **Why avoid**: Forces mouse-heavy interaction, poor accessibility, impossible to diff/merge, can't use in terminal/CI
- **Instead**: Text-first with optional visualization

### Proprietary DSL
- **Why avoid**: Learning curve, vendor lock-in, poor tooling ecosystem
- **Instead**: Standard formats (YAML, XML, Markdown) that existing tools understand

### Database-Required Architecture
- **Why avoid**: Deployment complexity, operational overhead for simple use cases
- **Instead**: File-based by default, database optional for persistence/scale

### Heavyweight Scheduler
- **Why avoid**: Airflow requires 4 services and 4GB RAM just to start
- **Instead**: In-process scheduler, external schedulers optional

### Per-Step/Per-Task Pricing
- **Why avoid**: Encourages gaming the system, unpredictable costs, anxiety about usage
- **Instead**: Execution-based or flat pricing

### Rigid DAG Structure
- **Why avoid**: Real workflows have dynamic branching, conditional loops, runtime decisions
- **Instead**: Support native control flow; DAGs as one pattern, not the only pattern

### Everything-to-Everyone Feature Creep
- **Why avoid**: Hundreds of features no one uses, overwhelming UI, maintenance burden
- **Instead**: Small core, extensible architecture, plugins for specialized needs

### Complex State Machine Builders
- **Why avoid**: Visual state machine editors become unmaintainable at scale
- **Instead**: State expressed in code/config, visualized for understanding

### Mandatory Cloud/SaaS
- **Why avoid**: Data sovereignty concerns, internet dependency, compliance issues
- **Instead**: Local-first, cloud-optional architecture

### Over-Abstracted Integration Layer
- **Why avoid**: Generic "connector framework" that makes simple integrations complex
- **Instead**: HTTP requests are first-class; typed integrations as convenience layer

### Real-Time Collaboration on Workflows
- **Why avoid**: Massive engineering investment for rare use case; Git solves this better
- **Instead**: Git-based collaboration with good merge tooling

---

## Complexity Notes

Features that seem simple but are deceptively hard to implement well.

### Deceptively Complex

| Feature | Why It's Hard |
|---------|---------------|
| **Retry with backoff** | Jitter, circuit breakers, retry budgets, distinguishing transient vs permanent failures, idempotency guarantees |
| **Parallel execution** | Fan-out/fan-in, error handling in parallel branches, partial failure semantics, resource limits |
| **Durable execution** | Event sourcing, deterministic replay, versioning workflows mid-execution, handling non-determinism |
| **Schema validation** | Runtime type checking, schema evolution, backwards compatibility, error messages that help |
| **Secret management** | Secure storage, rotation, access control, audit logging, preventing leaks in logs |
| **Webhook handling** | Signature verification, replay protection, timeout handling, exactly-once semantics |
| **Scheduling** | Cron parsing edge cases, timezone handling, missed schedule recovery, distributed scheduling |
| **Sub-workflow composition** | Parameter passing, error propagation, cancellation, circular dependency detection |
| **Observability** | Structured logging without bloat, tracing across async boundaries, metrics that matter |
| **Rate limiting** | Per-integration limits, backpressure, fair queuing, burst handling |

### Start Simple, Add Later

1. **V1**: Sequential execution, basic retry, file-based state
2. **V2**: Parallel execution, conditional branching, basic observability
3. **V3**: Durable execution, distributed scheduling, advanced error handling
4. **V4**: Multi-tenant, enterprise features, advanced AI orchestration

### The 80/20 Rule

- 80% of workflows need: triggers, HTTP calls, conditionals, loops, basic retry
- 20% of workflows need: durable execution, complex state machines, distributed coordination
- Build for the 80% first; make the 20% possible but not mandatory

---

## Key Takeaways for FlowScript

1. **Table stakes are non-negotiable** — Missing retry logic or conditional branching means immediate user churn

2. **Differentiate on developer experience** — Text-native workflows enable git, AI, and tooling that visual tools can't match

3. **Avoid Airflow's complexity trap** — Local development should be instant, not a 4GB RAM multi-service ordeal

4. **Learn from Temporal's durability** — But don't require it for simple workflows

5. **Embrace Prefect's Python philosophy** — Native control flow, not artificial DAG constraints

6. **AI integration is the new table stakes** — LLM orchestration capabilities expected in 2025+

7. **Progressive complexity is the goal** — Simple workflows stay simple; complexity available when needed

---

## Sources

Research compiled from:
- Temporal documentation and blog
- Prefect documentation and GitHub
- n8n features and documentation
- Workflow Patterns initiative (workflowpatterns.com)
- IBM analysis of Airflow limitations
- Various workflow tool comparisons and reviews
- AI orchestration framework analyses
