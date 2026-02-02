# Architecture Research: FlowScript

Research into workflow engine architecture patterns, component responsibilities, and implementation strategies for the FlowScript text-native workflow engine.

---

## Core Components

### Parser

**Responsibility**: Convert `.flow.md` source files into an Abstract Syntax Tree (AST) that represents the workflow structure.

**Input**:
- Raw `.flow.md` file content (text)
- File path (for error reporting)

**Output**: Workflow AST with three sections:
```typescript
interface WorkflowAST {
  // From YAML frontmatter
  metadata: {
    name: string;
    version: string;
    description?: string;
    trigger?: TriggerConfig;
    config?: Record<string, ConfigField>;
    secrets?: string[];
    input?: Record<string, SchemaField>;
    output?: Record<string, SchemaField>;
    runtime?: RuntimeConfig;
  };

  // From XML body
  nodes: NodeAST[];
  phases: PhaseAST[];
  context?: ContextAST;
  errorHandler?: ErrorHandlerAST;

  // From Markdown footer (optional, read-only)
  executionLog?: ExecutionLogAST;
}
```

**Implementation approach**:
1. **Lexical Analysis**: Split file into three sections using delimiters (`---` for YAML, `<workflow>` for XML, `<!--` for footer)
2. **YAML Parsing**: Use standard YAML parser (e.g., `yaml` package in Bun)
3. **XML Parsing**: Use XML parser (e.g., `fast-xml-parser` or custom recursive descent parser for the subset of XML used)
4. **AST Construction**: Transform parsed structures into typed AST nodes

**Key considerations**:
- Preserve source locations for error messages
- Handle malformed input gracefully with clear error messages
- Support incremental parsing for watch mode (future)

---

### Validator

**Responsibility**: Verify that the parsed AST represents a valid, executable workflow by checking types, dependencies, and constraints.

**Input**:
- WorkflowAST from Parser
- Node registry (available node types)
- Schema definitions

**Output**:
- Validation result (success or list of errors)
- Enriched AST with resolved types (optional)

**Key validations**:

| Category | Validation | Error Example |
|----------|------------|---------------|
| **Structural** | All required fields present | "Node 'fetch-data' missing required 'type' attribute" |
| **References** | All node references resolve | "Node 'process' references undefined node 'data-source'" |
| **Types** | Input/output types match | "Node 'filter' expects string[], got number" |
| **Cycles** | No circular dependencies | "Circular dependency detected: A -> B -> C -> A" |
| **Secrets** | All referenced secrets declared | "Secret 'API_KEY' used but not declared in frontmatter" |
| **Schema** | AI output schemas valid | "Schema field 'score' has invalid type 'float' (use 'number')" |
| **Uniqueness** | Node IDs unique within scope | "Duplicate node ID 'process' in phase 'gather'" |
| **Control Flow** | Break/continue in valid context | "<break> outside of loop context" |

**Implementation approach**:
1. **Pass 1 - Symbol collection**: Build symbol table of all nodes, phases, schemas
2. **Pass 2 - Reference resolution**: Resolve all node references, fail on undefined
3. **Pass 3 - Type checking**: Verify input/output type compatibility
4. **Pass 4 - Constraint checking**: Validate business rules (timeouts, limits, etc.)

---

### Scheduler

**Responsibility**: Analyze node dependencies and determine execution order, maximizing parallelism while respecting data flow constraints.

**Input**:
- Validated WorkflowAST
- Runtime configuration (concurrency limits)

**Output**:
```typescript
interface ExecutionPlan {
  waves: Wave[];           // Groups of nodes that can run in parallel
  dependencies: Map<NodeId, NodeId[]>;  // For dynamic scheduling
}

interface Wave {
  waveNumber: number;
  nodes: NodeId[];
  maxConcurrency: number;
}
```

**DAG Construction Approach**:

1. **Build dependency graph**: For each node, identify its dependencies from:
   - Explicit `input` attributes referencing other nodes
   - Implicit ordering within phases
   - Control flow dependencies (branch targets, loop bodies)

2. **Topological sort**: Order nodes such that dependencies come before dependents
   - Use Kahn's algorithm: O(V + E) time complexity
   - Detect cycles (should be caught by validator, but double-check)

3. **Wave calculation**: Group nodes by "distance from sources"
   ```
   Wave 0: Nodes with no dependencies (sources)
   Wave 1: Nodes whose dependencies are all in Wave 0
   Wave N: Nodes whose dependencies are all in Waves < N
   ```

**Wave Calculation Algorithm** (based on Coffman-Graham):
```
function calculateWaves(nodes, dependencies):
  indegree = {}  // count of unmet dependencies
  wave = {}      // assigned wave number

  // Initialize
  for node in nodes:
    indegree[node] = dependencies[node].length
    if indegree[node] == 0:
      wave[node] = 0

  // Process in waves
  currentWave = 0
  while unassigned nodes exist:
    for node where wave[node] == currentWave:
      for dependent in reverseDependencies[node]:
        indegree[dependent]--
        if indegree[dependent] == 0:
          wave[dependent] = currentWave + 1
    currentWave++

  // Group by wave
  return groupBy(nodes, n => wave[n])
```

**Parallel execution constraints**:
- Respect `max-concurrency` on `<foreach>` and `<parallel>`
- Respect global `runtime.concurrency` limit
- Consider resource constraints (AI rate limits, etc.)

---

### Executor

**Responsibility**: Run the execution plan, managing node lifecycle, data flow, and error handling.

**Input**:
- ExecutionPlan from Scheduler
- Initial context (config, secrets, input)
- Node runtime registry

**Output**:
- Workflow result (success with output, or failure with error)
- Execution trace (for logging/debugging)

**Execution Model**:

```
┌────────────────────────────────────────────────────────────────┐
│                       EXECUTOR                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                               │
│  │ Wave Runner │ ─── Orchestrates parallel wave execution       │
│  └──────┬──────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │Node Invoker │ ─── Calls appropriate runtime for node type   │
│  └──────┬──────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    NODE RUNTIMES                         │   │
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌──────┐           │   │
│  │  │ AI │ │HTTP│ │File│ │Map │ │Loop│ │Custom│           │   │
│  │  └────┘ └────┘ └────┘ └────┘ └────┘ └──────┘           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │Context Mgr  │   │ Data Store  │   │ Error Mgr   │          │
│  │             │   │             │   │             │          │
│  │ Variables   │   │ Node outputs│   │ Retry logic │          │
│  │ Scope chain │   │ Expressions │   │ Fallbacks   │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Node Isolation**:
- Each node execution receives an isolated context snapshot
- Nodes cannot directly modify other nodes' state
- Communication happens only through declared input/output

**Data Passing Between Nodes**:
```typescript
interface NodeContext {
  // Immutable inputs
  input: unknown;           // From declared `input` attribute
  config: Record<string, unknown>;  // From frontmatter config
  secrets: Record<string, string>;  // Resolved secret values
  context: Record<string, unknown>; // Hierarchical context values

  // References to other node outputs
  refs: {
    [nodeId: string]: {
      output: unknown;
      status: 'success' | 'failed';
      duration: number;
    };
  };
}

interface NodeResult {
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: Error;
  duration: number;
  logs?: string[];
}
```

**Execution flow for a single wave**:
```
1. Collect all nodes in wave
2. For each node (up to concurrency limit):
   a. Build NodeContext from dependencies
   b. Resolve expressions in node definition
   c. Invoke appropriate node runtime
   d. Store result in Data Store
   e. Emit execution event
3. Wait for all nodes to complete
4. Check for failures, apply error handling
5. Proceed to next wave (or abort)
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐                                                     │
│  │ .flow.md   │ ─────────────────────────────────────────────────┐  │
│  │   file     │                                                  │  │
│  └─────┬──────┘                                                  │  │
│        │                                                         │  │
│        ▼                                                         │  │
│  ┌────────────┐     ┌────────────┐     ┌────────────┐           │  │
│  │   PARSER   │────▶│ VALIDATOR  │────▶│ SCHEDULER  │           │  │
│  │            │     │            │     │            │           │  │
│  │ string →   │     │ AST →      │     │ AST →      │           │  │
│  │   AST      │     │ AST+errors │     │ Plan       │           │  │
│  └────────────┘     └────────────┘     └────────────┘           │  │
│                                              │                   │  │
│                                              ▼                   │  │
│                                        ┌────────────┐           │  │
│                                        │  EXECUTOR  │           │  │
│                                        │            │           │  │
│                                        │ Plan →     │           │  │
│                                        │   Result   │           │  │
│                                        └─────┬──────┘           │  │
│                                              │                   │  │
│        ┌─────────────────────────────────────┼───────────────┐  │  │
│        │                                     │               │  │  │
│        ▼                                     ▼               ▼  │  │
│  ┌──────────┐                         ┌──────────┐    ┌────────┴┐│  │
│  │  stdout  │                         │  State   │    │.flow.md ││  │
│  │  (logs)  │                         │  (JSON)  │    │ footer  ││  │
│  └──────────┘                         └──────────┘    └─────────┘│  │
│                                                                  │  │
└──────────────────────────────────────────────────────────────────┘  │
                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Data between nodes within workflow**:
```
Wave 0:    [source-a]              [source-b]
               │                       │
               ▼                       ▼
           ┌───────┐               ┌───────┐
           │output │               │output │
           └───┬───┘               └───┬───┘
               │                       │
               └───────────┬───────────┘
                           │
Wave 1:                    ▼
                    [transform-c]
                     input: "source-a.output, source-b.output"
                           │
                           ▼
                       ┌───────┐
                       │output │
                       └───┬───┘
                           │
Wave 2:                    ▼
                      [sink-d]
```

---

## Extension Model

**How custom nodes are registered and invoked**:

### Node Runtime Interface

```typescript
interface NodeRuntime<TConfig = unknown, TInput = unknown, TOutput = unknown> {
  // Metadata
  type: string;              // e.g., 'http', 'ai', 'custom'
  version: string;

  // Schema declarations
  configSchema?: JSONSchema;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;

  // Lifecycle hooks
  validate?(node: NodeAST, context: ValidationContext): ValidationError[];

  // Execution
  execute(params: {
    node: NodeAST;
    input: TInput;
    config: TConfig;
    context: ExecutionContext;
  }): Promise<TOutput>;

  // Cleanup (optional)
  cleanup?(context: ExecutionContext): Promise<void>;
}
```

### Built-in Runtimes

| Runtime | Purpose | Input | Output |
|---------|---------|-------|--------|
| `http` | HTTP requests | URL, method, headers, body | Response data |
| `ai` | AI model calls | Prompt, model, schema | Structured response |
| `file` | File I/O | Path, content | File data or success |
| `map` | Transform each item | Array, expression | Transformed array |
| `filter` | Filter items | Array, condition | Filtered array |
| `template` | String templating | Template, data | Rendered string |
| `branch` | Conditional routing | Condition, branches | Goto target |
| `loop` | Iteration | Max, body | Accumulated results |

### Custom Node Registration

```typescript
// src/runtimes/index.ts
import { NodeRuntime } from './types';
import { httpRuntime } from './http';
import { aiRuntime } from './ai';
import { fileRuntime } from './file';
// ...

const builtinRuntimes: Map<string, NodeRuntime> = new Map([
  ['http', httpRuntime],
  ['ai', aiRuntime],
  ['file', fileRuntime],
  // ...
]);

export function registerRuntime(runtime: NodeRuntime): void {
  if (builtinRuntimes.has(runtime.type)) {
    throw new Error(`Runtime '${runtime.type}' already registered`);
  }
  builtinRuntimes.set(runtime.type, runtime);
}

export function getRuntime(type: string): NodeRuntime | undefined {
  return builtinRuntimes.get(type);
}
```

### Future: Plugin-based Loading

```typescript
// Later: dynamic plugin loading
interface Plugin {
  name: string;
  version: string;
  runtimes: NodeRuntime[];

  onLoad?(engine: WorkflowEngine): void;
  onUnload?(): void;
}

// Load from node_modules or local path
async function loadPlugin(path: string): Promise<Plugin> {
  const module = await import(path);
  return module.default as Plugin;
}
```

---

## Execution Models

### Sequential vs Parallel

| Model | When to Use | Implementation |
|-------|-------------|----------------|
| **Sequential** | Strict ordering required, debugging | Single-threaded wave execution |
| **Parallel** | Independent nodes, performance | Promise.all within waves |
| **Streaming** | Continuous data (v2+) | Async iterators, backpressure |

### Sync vs Async

All node execution is **async** in FlowScript:
- External calls (HTTP, AI) are inherently async
- File I/O benefits from async
- Enables timeout handling
- Allows progress reporting

```typescript
// All node runtimes are async
async execute(params: NodeParams): Promise<NodeResult>

// Wave execution
async function executeWave(wave: Wave, context: ExecutionContext): Promise<void> {
  const promises = wave.nodes.map(nodeId =>
    executeNode(nodeId, context)
  );

  // Respect concurrency limit
  const results = await pLimit(wave.maxConcurrency)(promises);

  // Check for failures
  const failures = results.filter(r => r.status === 'failed');
  if (failures.length > 0 && !context.continueOnError) {
    throw new WaveExecutionError(failures);
  }
}
```

---

## State Management

**How workflow state is tracked**:

### During Execution

```typescript
interface ExecutionState {
  // Workflow identity
  workflowId: string;
  runId: string;

  // Progress
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentWave: number;
  currentNode?: string;

  // Timing
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Results
  nodeResults: Map<string, NodeResult>;

  // Context (mutable during execution)
  variables: Record<string, unknown>;

  // Checkpoints
  pendingCheckpoints: string[];
}
```

### Persistence

For v1, file-based state persistence:

```typescript
// State file: .flowscript/state/{workflow-name}/{run-id}.json
interface PersistedState {
  workflowId: string;
  runId: string;
  status: string;
  startedAt: string;       // ISO timestamp
  completedAt?: string;

  // Serialized node results
  nodeResults: Array<{
    nodeId: string;
    status: string;
    output?: unknown;
    error?: string;
    duration: number;
  }>;

  // For checkpoint resume
  lastCompletedWave: number;
  variables: Record<string, unknown>;
}
```

### State Access Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| **Read node output** | Access completed node's result | `{{fetch-data.output}}` |
| **Read variable** | Access workflow variable | `$state.cursor` |
| **Write variable** | Set workflow variable | `<set var="count" value="{{count + 1}}"/>` |
| **Persist state** | Save state for resume | Automatic after each wave |
| **Resume from state** | Continue failed workflow | `flowscript resume <run-id>` |

---

## Suggested Build Order

Based on dependencies and incremental value delivery:

### Phase 1: Foundation (Week 1)

1. **Parser** (no dependencies)
   - Why first: Everything depends on being able to read workflow files
   - Start with YAML frontmatter parsing, then XML body
   - Test with static .flow.md files from spec

2. **Validator** (depends on Parser)
   - Why second: Catch errors early, provides fast feedback loop
   - Start with structural validation, add type checking incrementally

3. **Basic CLI** (depends on Parser, Validator)
   - `flowscript validate <file>` — validate without executing
   - Enables testing of parser/validator in isolation

### Phase 2: Execution Core (Week 2)

4. **Expression Evaluator** (no hard dependencies)
   - Why: Needed for data flow between nodes
   - Template syntax: `{{node.output.field}}`
   - Variable syntax: `$config.key`, `$secrets.NAME`

5. **Executor Framework** (depends on Validator, Expression)
   - Basic sequential execution (waves = 1 node each)
   - Node invocation abstraction
   - Context management

6. **HTTP Runtime** (depends on Executor)
   - First concrete runtime
   - Proves the runtime interface design
   - Immediately useful for real workflows

7. **File Runtime** (depends on Executor)
   - Second runtime, different I/O pattern
   - Read and write files

### Phase 3: AI Integration (Week 3)

8. **AI Runtime** (depends on Executor)
   - OpenRouter integration
   - Prompt templating
   - Structured output parsing

9. **Schema Validation** (depends on AI Runtime)
   - Validate AI outputs against declared schemas
   - Runtime type checking

### Phase 4: Control Flow (Week 3-4)

10. **Scheduler** (depends on Validator)
    - DAG construction
    - Wave calculation
    - Parallel execution

11. **Transform Runtimes** (depends on Executor)
    - `map`, `filter`, `template`
    - Build on expression evaluator

12. **Control Flow Runtimes** (depends on Executor, Scheduler)
    - `<branch>`, `<if>` — conditional routing
    - `<loop>`, `<while>`, `<foreach>` — iteration
    - `<parallel>` — explicit parallelism

### Phase 5: Production Readiness (Week 4+)

13. **Error Handling** (depends on Executor)
    - Retry with backoff
    - Fallback nodes
    - Error propagation

14. **State Persistence** (depends on Executor)
    - Save/restore execution state
    - Resume failed workflows

15. **Execution Logging** (depends on Executor)
    - Write to markdown footer
    - Structured execution traces

16. **Full CLI** (depends on all above)
    - `flowscript run <file>` — full execution
    - `flowscript run --dry-run` — validate + plan
    - Progress output, error reporting

---

## Key Interfaces

### Parser → Validator

```typescript
interface ParseResult {
  success: boolean;
  ast?: WorkflowAST;
  errors?: ParseError[];
}

function parse(source: string, filePath: string): ParseResult;
```

### Validator → Scheduler

```typescript
interface ValidationResult {
  valid: boolean;
  ast?: ValidatedAST;  // AST with resolved types
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
}

function validate(ast: WorkflowAST, registry: RuntimeRegistry): ValidationResult;
```

### Scheduler → Executor

```typescript
interface ExecutionPlan {
  waves: Wave[];
  dependencies: DependencyGraph;
  metadata: {
    totalNodes: number;
    maxParallelism: number;
    estimatedDuration?: number;  // if known from history
  };
}

function schedule(ast: ValidatedAST, options: SchedulerOptions): ExecutionPlan;
```

### Executor → Node Runtimes

```typescript
interface ExecutionContext {
  // Identity
  workflowId: string;
  runId: string;
  nodeId: string;

  // Data access
  getInput(): unknown;
  getConfig(): Record<string, unknown>;
  getSecret(name: string): string;
  getNodeOutput(nodeId: string): unknown;

  // State mutation
  setVariable(name: string, value: unknown): void;

  // Logging
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;

  // Control flow
  signal(type: 'break' | 'continue' | 'goto', target?: string): void;
}

interface NodeRuntime {
  execute(context: ExecutionContext): Promise<unknown>;
}
```

### CLI → Engine

```typescript
interface FlowScriptEngine {
  // Core operations
  validate(filePath: string): Promise<ValidationResult>;
  run(filePath: string, options?: RunOptions): Promise<ExecutionResult>;

  // State operations
  getState(runId: string): Promise<ExecutionState | null>;
  resume(runId: string): Promise<ExecutionResult>;
  cancel(runId: string): Promise<void>;

  // Registry
  registerRuntime(runtime: NodeRuntime): void;
}

interface RunOptions {
  input?: Record<string, unknown>;
  config?: Record<string, unknown>;
  dryRun?: boolean;
  verbose?: boolean;
}
```

---

## Sources

Research compiled from:
- [Temporal Workflow Engine Principles](https://temporal.io/blog/workflow-engine-principles)
- [Temporal Internal Architecture](https://medium.com/data-science-collective/system-design-series-a-step-by-step-breakdown-of-temporals-internal-architecture-52340cc36f30)
- [Designing a DAG-Based Workflow Engine](https://bugfree.ai/knowledge-hub/designing-a-dag-based-workflow-engine-from-scratch)
- [Apache Airflow Architecture](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/overview.html)
- [Scheduling Tasks with Topological Sorting](https://brunoscheufler.com/blog/2021-11-27-scheduling-tasks-with-topological-sorting)
- [WorkflowEngine.io Plugin Documentation](https://workflowengine.io/documentation/plugins)
- [Dapr Workflow Architecture](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/)
- [Building a Distributed Workflow Engine](https://dev.to/acoh3n/building-a-distributed-workflow-engine-from-scratch-22kl)

---

*Document created: 2025-02-02*
*For: FlowScript text-native workflow engine*
