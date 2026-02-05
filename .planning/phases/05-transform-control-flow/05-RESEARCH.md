# Phase 5: Transform & Control Flow - Research

**Researched:** 2026-02-05
**Domain:** Data transformation nodes (template, map, filter) and control flow constructs (branch, if, loop, while, foreach, break, goto)
**Confidence:** HIGH

## Summary

Phase 5 implements two interconnected capabilities: data transformation nodes (Template, Map, Filter) and control flow constructs (Branch, If, Loop, While, Foreach with Break and Goto). The core challenge is implementing these features while maintaining security through the existing expression sandbox and integrating cleanly with the existing execution state system.

For **data transformations**, the existing expression engine provides most of the foundation. Template node uses the existing `evaluateTemplate()` function with Handlebars-like `{{expression}}` syntax. Map and Filter require evaluating expressions per-item with iteration context injection. The key design decision is whether to use arrow functions (requires jsep arrow plugin and security analysis) or simple expressions where the current item is injected into context. The safer approach is context injection without arrow functions.

For **control flow**, the patterns are well-established across workflow engines (n8n, Camunda, UiPath). Branch provides pattern matching with multiple cases; If provides simple conditional routing; Loop/While/Foreach provide iteration with max bounds and break conditions. Break exits the current loop; Goto jumps to a named node. The main implementation challenge is managing execution context across iterations and handling Break/Goto as special control flow signals.

**Primary recommendation:** Use context injection pattern for Map/Filter (inject `$item`, `$index` into context), implement control flow nodes as runtime executors that manage their own child node execution, and use exception-based control flow for Break/Goto signals.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jsep` | 1.4.x | Expression parsing (already installed) | Existing foundation, proven secure config |
| `luxon` | 3.7.x | Time operations (already installed) | Existing functions use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@jsep-plugin/arrow` | 1.0.x | Arrow function parsing (OPTIONAL) | Only if arrow function expressions needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Context injection | Arrow functions | Arrow functions more flexible but require security review; context injection proven safe |
| Exception-based break | State flags | Exception provides cleaner call stack unwinding; flags require checking at every level |
| Goto via name lookup | Goto via AST index | Name lookup is O(n) but clearer; index is O(1) but error-prone |

**Installation:**
```bash
# No new dependencies required - existing expression engine suffices
# Optional: bun add @jsep-plugin/arrow  (only if arrow functions needed)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  runtimes/
    transform/
      index.ts           # Exports all transform runtimes
      template.ts        # Template node runtime
      map.ts             # Map node runtime
      filter.ts          # Filter node runtime
      types.ts           # Config types for transform nodes
    control/
      index.ts           # Exports all control flow runtimes
      branch.ts          # Branch node runtime
      if.ts              # If node runtime
      loop.ts            # Loop node runtime
      while.ts           # While node runtime
      foreach.ts         # Foreach node runtime
      types.ts           # Config types and control flow errors
  execution/
    control-flow.ts      # Break/Goto signal classes, control flow utilities
```

### Pattern 1: Context Injection for Map/Filter
**What:** Inject current item and index into evaluation context before evaluating expression
**When to use:** Map and Filter nodes where expression operates on each array item
**Example:**
```typescript
// Source: Custom pattern based on n8n and workflow engine patterns
interface MapNodeConfig {
  /** Expression to evaluate for each item (item available as $item, index as $index) */
  expression: string;
}

async function executeMap(
  items: unknown[],
  expression: string,
  baseContext: EvalContext
): Promise<unknown[]> {
  const results: unknown[] = [];

  for (let i = 0; i < items.length; i++) {
    // Create per-item context with injected variables
    const itemContext: EvalContext = {
      variables: {
        ...baseContext.variables,
        $item: items[i],
        $index: i,
        $items: items,
        $first: i === 0,
        $last: i === items.length - 1,
      },
      functions: baseContext.functions,
    };

    const result = evaluate(expression, itemContext);
    results.push(result);
  }

  return results;
}
```

### Pattern 2: Control Flow via Exception Signals
**What:** Use typed exceptions to signal Break and Goto, caught by enclosing control flow nodes
**When to use:** Break exits loop early, Goto jumps to named node
**Example:**
```typescript
// Source: Custom pattern based on workflow engine patterns
class BreakSignal extends Error {
  constructor(public readonly loopId?: string) {
    super('Break signal');
    this.name = 'BreakSignal';
    Object.setPrototypeOf(this, BreakSignal.prototype);
  }
}

class GotoSignal extends Error {
  constructor(public readonly targetNodeId: string) {
    super(`Goto: ${targetNodeId}`);
    this.name = 'GotoSignal';
    Object.setPrototypeOf(this, GotoSignal.prototype);
  }
}

// Loop runtime catches BreakSignal
async function executeLoop(
  body: NodeAST[],
  maxIterations: number,
  breakCondition: string | undefined,
  state: ExecutionState
): Promise<unknown> {
  let result: unknown;

  for (let i = 0; i < maxIterations; i++) {
    // Check break condition if specified
    if (breakCondition) {
      const shouldBreak = evaluate(breakCondition, buildEvaluationContext(state));
      if (shouldBreak) break;
    }

    try {
      result = await executeNodes(body, state);
    } catch (error) {
      if (error instanceof BreakSignal) {
        // If specific loop ID, check if this is the target
        if (!error.loopId || error.loopId === currentNodeId) {
          break;
        }
        throw error; // Re-throw for outer loop
      }
      throw error;
    }
  }

  return result;
}
```

### Pattern 3: Branch Node with Pattern Matching
**What:** Evaluate conditions in order, execute first matching case
**When to use:** When routing based on complex conditions or data patterns
**Example:**
```typescript
// Source: Custom pattern based on Camunda exclusive gateway
interface BranchCase {
  condition: string;  // Expression that evaluates to boolean
  nodes: NodeAST[];   // Nodes to execute if condition matches
}

async function executeBranch(
  input: unknown,
  cases: BranchCase[],
  defaultNodes: NodeAST[] | undefined,
  state: ExecutionState
): Promise<unknown> {
  const context = buildEvaluationContext(state);

  // Evaluate cases in order (first match wins)
  for (const branchCase of cases) {
    const matches = evaluate(branchCase.condition, context);
    if (matches) {
      return executeNodes(branchCase.nodes, state);
    }
  }

  // Execute default if no case matched
  if (defaultNodes) {
    return executeNodes(defaultNodes, state);
  }

  // No match and no default - return input unchanged
  return input;
}
```

### Pattern 4: Foreach with Concurrency Control
**What:** Iterate over collection items with optional parallelism
**When to use:** Processing each item in a collection
**Example:**
```typescript
// Source: Custom pattern based on n8n Loop Over Items
interface ForeachConfig {
  collection: string;   // Expression evaluating to array
  itemVar: string;      // Variable name for current item (default: 'item')
  maxConcurrency?: number; // Max parallel executions (default: 1 = sequential)
}

async function executeForeach(
  collection: unknown[],
  body: NodeAST[],
  itemVar: string,
  maxConcurrency: number,
  state: ExecutionState
): Promise<unknown[]> {
  const results: unknown[] = new Array(collection.length);

  if (maxConcurrency === 1) {
    // Sequential execution
    for (let i = 0; i < collection.length; i++) {
      setNodeContext(state, {
        [itemVar]: collection[i],
        [`${itemVar}_index`]: i,
      });

      try {
        results[i] = await executeNodes(body, state);
      } catch (error) {
        if (error instanceof BreakSignal) break;
        throw error;
      }
    }
  } else {
    // Parallel execution with concurrency limit
    const semaphore = new Semaphore(maxConcurrency);
    const promises = collection.map(async (item, index) => {
      await semaphore.acquire();
      try {
        // Each parallel execution needs isolated node context
        const itemState = cloneStateForIteration(state, {
          [itemVar]: item,
          [`${itemVar}_index`]: index,
        });
        results[index] = await executeNodes(body, itemState);
      } finally {
        semaphore.release();
      }
    });
    await Promise.all(promises);
  }

  return results;
}
```

### Pattern 5: Template Node (Handlebars-like)
**What:** Render string template with embedded expressions
**When to use:** Generating text output with dynamic values
**Example:**
```typescript
// Source: Existing evaluateTemplate() function
interface TemplateConfig {
  template: string;  // Template string with {{expression}} placeholders
}

async function executeTemplate(
  input: unknown,
  config: TemplateConfig,
  state: ExecutionState
): Promise<string> {
  // Add input to node context for template resolution
  setNodeContext(state, { input });

  const context = buildEvaluationContext(state);
  return evaluateTemplate(config.template, context);
}
```

### Anti-Patterns to Avoid
- **Using eval() for map/filter expressions:** Security risk - use jsep + evaluator
- **Arrow functions without security review:** jse-eval explicitly warns arrow functions are "potentially unsafe"
- **Unbounded loops without max iterations:** Always require maxIterations to prevent infinite loops
- **Goto to arbitrary code locations:** Only allow goto to named nodes within the same workflow
- **Modifying shared state during parallel foreach:** Use cloned state for each iteration
- **Catching all errors in control flow nodes:** Only catch BreakSignal/GotoSignal, let other errors propagate

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template expression evaluation | Custom string interpolation | Existing `evaluateTemplate()` | Already handles escaping, nesting, null rendering |
| Expression evaluation | Custom parser | Existing `evaluate()` + jsep | Proven secure, handles all operators |
| Concurrency limiting | Manual promise tracking | Semaphore pattern | Race conditions, error handling |
| Deep cloning state | JSON.parse/stringify | Structured clone or explicit copy | Handles Maps, maintains types |

**Key insight:** The existing expression engine handles 90% of what transform nodes need. Focus implementation on control flow management and context injection, not expression evaluation.

## Common Pitfalls

### Pitfall 1: Infinite Loops Without Bounds
**What goes wrong:** While loop with always-true condition runs forever
**Why it happens:** No maximum iteration limit enforced
**How to avoid:** Always require maxIterations with reasonable default (1000); emit warning when reaching limit
**Warning signs:** Workflow execution never completes, memory usage grows unbounded
```typescript
// CORRECT: Always enforce maximum
const DEFAULT_MAX_ITERATIONS = 1000;
const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

for (let i = 0; i < maxIterations; i++) {
  if (!evaluateCondition(condition, context)) break;
  // ...
}
```

### Pitfall 2: Break Signal Escaping Intended Scope
**What goes wrong:** Break from inner loop exits outer loop
**Why it happens:** BreakSignal caught by wrong loop
**How to avoid:** Support optional loop ID in Break, match in catch handler
**Warning signs:** Outer loop terminates unexpectedly
```typescript
// Break can target specific loop
<break loop="outer-loop" />

// In loop runtime, check if signal is for this loop
if (error instanceof BreakSignal) {
  if (!error.loopId || error.loopId === this.nodeId) {
    break;  // This break is for us
  }
  throw error;  // Re-throw for outer loop
}
```

### Pitfall 3: Goto Creating Unreachable Code
**What goes wrong:** Goto jumps backward creating potential infinite loop
**Why it happens:** No validation of goto targets
**How to avoid:** Validate goto targets exist in AST; consider disallowing backward jumps or requiring max-goto counter
**Warning signs:** Execution jumps around unexpectedly, infinite execution
```typescript
// Validate goto target exists
function validateGoto(gotoNodeId: string, allNodes: NodeAST[]): ValidationError | null {
  const targetExists = allNodes.some(n => n.id === gotoNodeId);
  if (!targetExists) {
    return {
      code: 'CTRL_INVALID_GOTO_TARGET',
      message: `Goto target '${gotoNodeId}' does not exist`,
    };
  }
  return null;
}
```

### Pitfall 4: Context Pollution in Foreach Iterations
**What goes wrong:** Later iterations see variables from earlier iterations
**Why it happens:** Reusing same node context across iterations
**How to avoid:** Reset or clone node context for each iteration
**Warning signs:** Unpredictable results that depend on execution order
```typescript
// CORRECT: Fresh context per iteration
for (const item of collection) {
  setNodeContext(state, {
    [itemVar]: item,  // Only iteration-specific vars
  });
  // Previous iteration vars are replaced, not accumulated
}
```

### Pitfall 5: Filter Returns Wrong Type
**What goes wrong:** Filter returns original items instead of boolean results
**Why it happens:** Confusion between map (transform) and filter (select)
**How to avoid:** Filter expression MUST return boolean; return items where expression is truthy
**Warning signs:** Filter returns boolean array instead of filtered items
```typescript
// CORRECT: Filter uses expression result to decide inclusion
const results: unknown[] = [];
for (const item of items) {
  const context = { ...baseContext.variables, $item: item };
  const include = evaluate(expression, context);  // Should be boolean
  if (include) {
    results.push(item);  // Push original item, not the boolean
  }
}
```

### Pitfall 6: Goto Bypassing Node Output Recording
**What goes wrong:** Node outputs not recorded when execution jumps via Goto
**Why it happens:** Goto skips normal execution flow including output recording
**How to avoid:** Record node outputs before any control flow decision
**Warning signs:** Expressions referencing skipped nodes return undefined

## Code Examples

Verified patterns aligned with existing codebase:

### Transform Node Runtime Interface
```typescript
// Source: Aligned with existing NodeRuntime pattern from src/runtimes/types.ts
import type { ExecutionParams, NodeRuntime } from '../types';
import type { ExecutionState } from '../../execution/types';
import { buildEvaluationContext, evaluate, evaluateTemplate } from '../../expression';

export interface TemplateConfig {
  template: string;
}

export interface MapConfig {
  expression: string;
}

export interface FilterConfig {
  condition: string;
}

// Template runtime - uses existing evaluateTemplate
export const templateRuntime: NodeRuntime<TemplateConfig, unknown, string> = {
  type: 'transform:template',

  async execute({ input, config, state }: ExecutionParams<TemplateConfig, unknown>) {
    // Inject input into context for template resolution
    state.nodeContext = { ...state.nodeContext, input };
    const context = buildEvaluationContext(state);
    return evaluateTemplate(config.template, context);
  },
};
```

### Map Runtime Implementation
```typescript
// Source: Custom implementation using existing expression engine
export const mapRuntime: NodeRuntime<MapConfig, unknown[], unknown[]> = {
  type: 'transform:map',

  async execute({ input, config, state }: ExecutionParams<MapConfig, unknown[]>) {
    const items = Array.isArray(input) ? input : [input];
    const baseContext = buildEvaluationContext(state);
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i++) {
      const itemContext: EvalContext = {
        variables: {
          ...baseContext.variables,
          $item: items[i],
          $index: i,
          $first: i === 0,
          $last: i === items.length - 1,
        },
        functions: baseContext.functions,
      };

      results.push(evaluate(config.expression, itemContext));
    }

    return results;
  },
};
```

### Filter Runtime Implementation
```typescript
// Source: Custom implementation using existing expression engine
export const filterRuntime: NodeRuntime<FilterConfig, unknown[], unknown[]> = {
  type: 'transform:filter',

  async execute({ input, config, state }: ExecutionParams<FilterConfig, unknown[]>) {
    const items = Array.isArray(input) ? input : [input];
    const baseContext = buildEvaluationContext(state);
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i++) {
      const itemContext: EvalContext = {
        variables: {
          ...baseContext.variables,
          $item: items[i],
          $index: i,
        },
        functions: baseContext.functions,
      };

      const include = evaluate(config.condition, itemContext);
      if (include) {
        results.push(items[i]);
      }
    }

    return results;
  },
};
```

### Control Flow Error Classes
```typescript
// Source: Custom pattern following existing error patterns in src/types/errors.ts
export class ControlFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly nodeId?: string
  ) {
    super(message);
    this.name = 'ControlFlowError';
    Object.setPrototypeOf(this, ControlFlowError.prototype);
  }
}

export class BreakSignal extends Error {
  constructor(public readonly targetLoopId?: string) {
    super(targetLoopId ? `Break to loop: ${targetLoopId}` : 'Break');
    this.name = 'BreakSignal';
    Object.setPrototypeOf(this, BreakSignal.prototype);
  }
}

export class GotoSignal extends Error {
  constructor(public readonly targetNodeId: string) {
    super(`Goto: ${targetNodeId}`);
    this.name = 'GotoSignal';
    Object.setPrototypeOf(this, GotoSignal.prototype);
  }
}
```

### Loop Runtime with Break Support
```typescript
// Source: Custom implementation with control flow handling
export interface LoopConfig {
  maxIterations?: number;
  breakCondition?: string;
}

export const loopRuntime: NodeRuntime<LoopConfig, unknown, unknown> = {
  type: 'control:loop',

  async execute({ node, input, config, state }: ExecutionParams<LoopConfig, unknown>) {
    const maxIterations = config.maxIterations ?? 1000;
    const loopNode = node as LoopNode;
    let lastResult: unknown = input;
    let iteration = 0;

    for (iteration = 0; iteration < maxIterations; iteration++) {
      // Set iteration context
      state.nodeContext = {
        ...state.nodeContext,
        $iteration: iteration,
        $first: iteration === 0,
      };

      // Check break condition if specified
      if (config.breakCondition) {
        const context = buildEvaluationContext(state);
        const shouldBreak = evaluate(config.breakCondition, context);
        if (shouldBreak) break;
      }

      try {
        // Execute loop body (would call executeNodes for body)
        lastResult = await executeBody(loopNode.body, state);
      } catch (error) {
        if (error instanceof BreakSignal) {
          // Check if this break is for us
          if (!error.targetLoopId || error.targetLoopId === node.id) {
            break;
          }
          // Re-throw for outer loop
          throw error;
        }
        throw error;
      }
    }

    // Warn if hit max iterations
    if (iteration === maxIterations) {
      console.warn(`Loop '${node.id}' reached max iterations (${maxIterations})`);
    }

    return lastResult;
  },
};
```

### Branch Runtime Implementation
```typescript
// Source: Custom implementation based on Camunda exclusive gateway pattern
export interface BranchConfig {
  // Cases are in AST node structure, not config
}

export const branchRuntime: NodeRuntime<BranchConfig, unknown, unknown> = {
  type: 'control:branch',

  async execute({ node, input, state }: ExecutionParams<BranchConfig, unknown>) {
    const branchNode = node as BranchNode;
    const context = buildEvaluationContext(state);

    // Evaluate cases in order - first match wins
    for (const branchCase of branchNode.cases) {
      const matches = evaluate(branchCase.condition, context);
      if (matches) {
        return executeBody(branchCase.nodes, state);
      }
    }

    // Execute default if no case matched
    if (branchNode.default) {
      return executeBody(branchNode.default, state);
    }

    // No match and no default - pass through input
    return input;
  },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom template syntax | Handlebars-like `{{}}` | Stable | Industry standard, familiar to users |
| eval() for expressions | AST-walking evaluator | 2023+ | Security best practice |
| Hardcoded control flow | Runtime-based execution | Stable | Extensible, testable |
| Global break/continue | Scoped signals with IDs | Stable | Nested loop support |

**Deprecated/outdated:**
- **eval() or new Function():** Security risk - use jsep + custom evaluator
- **vm2 for sandboxing:** Critical vulnerabilities - use AST-walking instead
- **Unbounded loops:** Always require max iterations

## Open Questions

Things that couldn't be fully resolved:

1. **Arrow Functions in Map/Filter Expressions**
   - What we know: jsep has @jsep-plugin/arrow for parsing arrow functions; jse-eval warns they are "potentially unsafe"
   - What's unclear: Whether arrow functions provide sufficient value to justify security review
   - Recommendation: Start without arrow functions; use context injection ($item, $index). If user feedback strongly demands arrow syntax, add as Phase 8+ with thorough security review.

2. **Parallel Foreach Isolation**
   - What we know: Parallel execution needs isolated state per iteration
   - What's unclear: Exact cloning strategy for ExecutionState with Map<string, NodeResult>
   - Recommendation: For now, use sequential foreach (maxConcurrency: 1) by default. Add parallel support with explicit state isolation in same phase or defer to later.

3. **Goto Validation Strictness**
   - What we know: Goto to non-existent node should be validation error
   - What's unclear: Whether backward gotos should be allowed (creates potential loops)
   - Recommendation: Allow any goto during implementation; add validator warning for backward jumps. Stricter validation can be added later based on usage patterns.

4. **Break from Nested Callbacks**
   - What we know: Break signal works for direct loop nesting
   - What's unclear: Behavior if Break is in an async callback inside loop body
   - Recommendation: Break only works synchronously within loop body. Document this limitation. Users can use loop break condition for async termination.

## Sources

### Primary (HIGH confidence)
- [jsep GitHub](https://github.com/EricSmekens/jsep) - Expression parser, plugin architecture
- [jsep Arrow Plugin](https://github.com/EricSmekens/jsep/tree/master/packages/arrow) - Arrow function parsing
- [Handlebars Guide](https://handlebarsjs.com/guide/) - Template syntax patterns
- [Workflow Patterns](http://www.workflowpatterns.com/patterns/control/) - Control flow pattern definitions
- [Camunda Workflow Patterns](https://docs.camunda.io/docs/components/concepts/workflow-patterns/) - Structured loop, exclusive gateway

### Secondary (MEDIUM confidence)
- [n8n Looping](https://docs.n8n.io/flow-logic/looping/) - Loop Over Items, batch processing
- [n8n Expressions](https://n8narena.com/guides/n8n-expression-cheatsheet/) - Expression patterns, array operations
- [jse-eval GitHub](https://github.com/6utt3rfly/jse-eval) - jsep evaluator security notes
- [UiPath Break Activity](https://docs.uipath.com/activities/other/latest/workflow/break) - Break statement pattern

### Tertiary (LOW confidence)
- [expression-sandbox GitHub](https://github.com/JoshuaWise/expression-sandbox) - Sandboxing patterns (not verified for current use)
- WebSearch results for "workflow engine control flow patterns 2026"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing jsep + evaluator, no new dependencies
- Transform architecture: HIGH - Extends existing NodeRuntime pattern, uses evaluateTemplate()
- Control flow architecture: HIGH - Based on established workflow patterns (Camunda, n8n)
- Pitfalls: MEDIUM - Based on general workflow engine patterns, some specific to this implementation

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable domain)
