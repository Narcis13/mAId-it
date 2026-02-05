# Phase 8: Full CLI - Research

**Researched:** 2026-02-05
**Domain:** CLI implementation for workflow execution with commander.js
**Confidence:** HIGH

## Summary

This phase extends the existing FlowScript CLI with the `run` command and associated options. The codebase already has a solid foundation: `commander` v14.0.3 for CLI structure, `chalk` for colored output, `@babel/code-frame` for error formatting, and a complete execution engine (executor, scheduler, state management, persistence).

The primary work involves wiring the existing execution infrastructure to a new CLI command with proper option parsing, progress display, and error handling. The `validate` command implementation in `/Users/narcisbrindusescu/newme/maidit/src/cli/validate.ts` provides the pattern to follow.

Key decisions:
- Use the existing `commander` library (already installed at v14.0.3)
- Use `ora` for spinner-based progress display (works with Bun)
- Follow the existing CLI patterns established in Phase 1
- Wire together existing `parseFile`, `buildExecutionPlan`, `createExecutionState`, and `execute` functions

**Primary recommendation:** Implement `flowscript run <file>` following the existing validate command pattern, using ora for progress and leveraging the complete execution infrastructure from Phase 7.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI framework | Already used, mature, excellent TypeScript support |
| chalk | 4 | Terminal colors | Already used in format.ts, v4 for CommonJS compat |
| @babel/code-frame | ^7.29.0 | Error formatting | Already used, beautiful error display |

### Supporting (To Add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ora | ^8 | Terminal spinner | Progress indication during workflow execution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ora | cli-spinners + custom | ora provides complete solution; cli-spinners is lower-level |
| ora | listr2 | listr2 for multiple concurrent tasks; ora simpler for sequential waves |
| console.log | winston/pino | Overkill for CLI output; console.log + chalk sufficient |

**Installation:**
```bash
bun install ora
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli/
│   ├── index.ts          # Main CLI entry, command registration
│   ├── validate.ts       # Existing validate command (pattern to follow)
│   ├── run.ts            # NEW: Run command implementation
│   ├── format.ts         # Error formatting (reusable)
│   └── progress.ts       # NEW: Progress display utilities
```

### Pattern 1: Command Module Pattern (from existing codebase)
**What:** Each command is a separate module with clear interfaces
**When to use:** All CLI commands
**Example:**
```typescript
// Source: /Users/narcisbrindusescu/newme/maidit/src/cli/validate.ts pattern
// run.ts
export interface RunOptions {
  dryRun?: boolean;
  config?: string[];    // Array of 'key=value' strings
  input?: string;       // JSON string
  format?: 'text' | 'json';
  noColor?: boolean;
}

export interface RunResult {
  success: boolean;
  output: string;
  executionTime?: number;
}

export async function runWorkflow(
  filePath: string,
  options: RunOptions = {}
): Promise<RunResult> {
  // Implementation
}
```

### Pattern 2: Repeatable Option Collection
**What:** Commander pattern for collecting multiple `--config key=value` arguments
**When to use:** Any option that can be specified multiple times
**Example:**
```typescript
// Source: commander.js documentation
function collectConfig(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command('run')
  .option('-c, --config <key=value>', 'Override config value', collectConfig, [])
  .action((file, options) => {
    // options.config is string[] like ['output_dir=./out', 'timeout=30s']
  });
```

### Pattern 3: JSON Option Parsing
**What:** Parse JSON input from command line
**When to use:** `--input '{"field": "value"}'` option
**Example:**
```typescript
function parseJsonInput(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }
}

program
  .option('--input <json>', 'Workflow input data', parseJsonInput)
```

### Pattern 4: Dry Run Execution Plan Display
**What:** Show what would happen without executing
**When to use:** `--dry-run` flag
**Example:**
```typescript
// Dry run shows execution plan without running
function formatExecutionPlan(plan: ExecutionPlan): string {
  const lines: string[] = [];
  lines.push(`Workflow: ${plan.workflowId}`);
  lines.push(`Total nodes: ${plan.totalNodes}`);
  lines.push(`Waves: ${plan.waves.length}`);
  lines.push('');

  for (const wave of plan.waves) {
    lines.push(`Wave ${wave.waveNumber}:`);
    for (const nodeId of wave.nodeIds) {
      const node = plan.nodes.get(nodeId);
      lines.push(`  - ${nodeId} (${node?.type})`);
    }
  }

  return lines.join('\n');
}
```

### Pattern 5: Progress Display with Ora
**What:** Spinner-based progress for long-running operations
**When to use:** Workflow execution
**Example:**
```typescript
// Source: ora GitHub README
import ora from 'ora';

const spinner = ora('Executing workflow...').start();

try {
  // Update during execution
  spinner.text = `Executing wave ${wave.waveNumber}/${totalWaves}...`;

  await execute(plan, state, options);

  spinner.succeed(`Workflow completed in ${duration}ms`);
} catch (error) {
  spinner.fail(`Workflow failed: ${error.message}`);
}
```

### Anti-Patterns to Avoid
- **Mixing sync/async in CLI handler:** Always use async action handlers
- **Swallowing errors:** Always set exit code on failure
- **Hardcoding colors:** Use chalk's color level detection, respect --no-color
- **Direct console.log in library code:** Return formatted strings, let CLI output

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Custom arg parser | commander | Edge cases: quoted strings, =, escaping |
| Terminal colors | ANSI escape codes | chalk | Terminal detection, color levels, --no-color |
| Spinners/progress | Custom animation loop | ora | TTY detection, interruption handling |
| JSON parsing | Custom parser | JSON.parse | Standard, handles edge cases |
| Config merging | Custom deep merge | Simple Object.assign | Config is flat key-value in this use case |

**Key insight:** The CLI layer should be thin. All heavy lifting is already done by the execution engine. The CLI just wires inputs to existing functions and formats outputs.

## Common Pitfalls

### Pitfall 1: Not Validating Before Executing
**What goes wrong:** Run command executes invalid workflows, causing confusing errors
**Why it happens:** Skipping validation step to save time
**How to avoid:** Always parse + validate before building execution plan
**Warning signs:** Errors like "undefined is not a function" instead of clear validation errors

### Pitfall 2: Ignoring Exit Codes
**What goes wrong:** CI/CD pipelines don't detect failures
**Why it happens:** Forgetting to call `process.exit(1)` on error
**How to avoid:** Always set exit code based on result.success
**Warning signs:** `echo $?` returns 0 after failed workflow

### Pitfall 3: Progress Display in Non-TTY
**What goes wrong:** Spinners create garbage output in CI logs, piped output
**Why it happens:** Spinner animation requires TTY; stdout.isTTY may be false
**How to avoid:** Ora handles this automatically, but test in piped mode
**Warning signs:** Logs full of escape codes in CI output

### Pitfall 4: Config Override Syntax Confusion
**What goes wrong:** Users pass `--config key value` instead of `--config key=value`
**Why it happens:** Inconsistent CLI conventions in ecosystem
**How to avoid:** Document clearly, add validation with helpful error messages
**Warning signs:** Config values are undefined or contain next flag as value

### Pitfall 5: JSON Input Escaping Issues
**What goes wrong:** Shell interprets quotes in JSON, breaks input
**Why it happens:** Complex shell escaping rules
**How to avoid:** Document single-quote wrapping: `--input '{"key": "value"}'`
**Warning signs:** JSON.parse errors on valid-looking input

## Code Examples

Verified patterns from the existing codebase:

### Run Command Registration
```typescript
// Source: /Users/narcisbrindusescu/newme/maidit/src/cli/index.ts pattern
import { runWorkflow } from './run';

function collectConfig(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command('run')
  .description('Execute a .flow.md workflow')
  .argument('<file>', 'Workflow file to run')
  .option('--dry-run', 'Show execution plan without running')
  .option('-c, --config <key=value>', 'Override config value (repeatable)', collectConfig, [])
  .option('--input <json>', 'Workflow input data as JSON')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options) => {
    const result = await runWorkflow(file, {
      dryRun: options.dryRun,
      config: options.config,
      input: options.input,
      format: options.format,
      noColor: !options.color,
    });

    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });
```

### Complete Run Implementation
```typescript
// Source: Combines existing codebase patterns
import { parseFile } from '../parser';
import { validate } from '../validator';
import { buildExecutionPlan } from '../scheduler';
import { createExecutionState, execute } from '../execution';
import ora from 'ora';
import chalk from 'chalk';

export async function runWorkflow(
  filePath: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const startTime = Date.now();
  const c = options.noColor ? new chalk.Instance({ level: 0 }) : chalk;

  // Step 1: Parse
  const parseResult = await parseFile(filePath);
  if (!parseResult.success) {
    return {
      success: false,
      output: formatParseErrors(parseResult.errors, ...),
    };
  }

  // Step 2: Validate
  const validationResult = validate(parseResult.data);
  if (!validationResult.valid) {
    return {
      success: false,
      output: formatValidationResult(validationResult, ...),
    };
  }

  // Step 3: Build execution plan
  const plan = buildExecutionPlan(parseResult.data);

  // Step 4: Handle dry-run
  if (options.dryRun) {
    return {
      success: true,
      output: formatExecutionPlan(plan, c),
    };
  }

  // Step 5: Create state with config overrides and input
  const config = mergeConfig(parseResult.data.metadata.config, options.config);
  const state = createExecutionState({
    workflowId: parseResult.data.metadata.name,
    config,
    globalContext: options.input ? { input: options.input } : {},
  });

  // Step 6: Execute with progress
  const spinner = ora('Starting workflow...').start();

  try {
    await execute(plan, state, {
      // Update spinner during execution (would need callback)
    });

    const duration = Date.now() - startTime;
    spinner.succeed(`Workflow completed in ${duration}ms`);

    return {
      success: true,
      output: formatExecutionResult(state, c),
      executionTime: duration,
    };
  } catch (error) {
    spinner.fail(`Workflow failed: ${error.message}`);
    return {
      success: false,
      output: formatExecutionError(error, state, c),
    };
  }
}
```

### Config Override Parsing
```typescript
// Parse 'key=value' into object, handle nested keys like 'output.dir'
function parseConfigOverrides(overrides: string[]): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const override of overrides) {
    const eqIndex = override.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid config format: ${override}. Expected key=value`);
    }

    const key = override.slice(0, eqIndex);
    const value = override.slice(eqIndex + 1);

    // Handle simple values, try to parse as JSON for complex types
    try {
      config[key] = JSON.parse(value);
    } catch {
      config[key] = value; // Keep as string if not valid JSON
    }
  }

  return config;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Node.js + npm | Bun runtime | 2024+ | Faster startup, built-in TypeScript |
| yargs | commander | Always was standard | commander more widely used |
| console.log everywhere | Structured output | Always best practice | Enables --format json |
| Blocking spinners | Ora async spinners | ora v5+ | Non-blocking, better DX |

**Deprecated/outdated:**
- Direct terminal escape codes: Use chalk
- Manual TTY detection: Ora handles automatically
- Synchronous file operations: Use Bun.file() async API

## Open Questions

Things that couldn't be fully resolved:

1. **Progress callback integration with executor**
   - What we know: Executor runs waves sequentially, could emit events
   - What's unclear: Whether to add callback to ExecutionOptions or use different pattern
   - Recommendation: Simple approach - update spinner between waves, not during

2. **Input validation before execution**
   - What we know: `--input` provides initial data to workflow
   - What's unclear: Should input be validated against workflow's expected schema?
   - Recommendation: Basic JSON validation; schema validation can be future enhancement

## Sources

### Primary (HIGH confidence)
- Existing codebase: `/Users/narcisbrindusescu/newme/maidit/src/cli/` - CLI patterns
- Existing codebase: `/Users/narcisbrindusescu/newme/maidit/src/execution/` - Execution engine
- Existing codebase: `/Users/narcisbrindusescu/newme/maidit/src/scheduler/` - Execution planning
- [commander.js GitHub README](https://github.com/tj/commander.js) - CLI option patterns
- [ora GitHub README](https://github.com/sindresorhus/ora) - Spinner API

### Secondary (MEDIUM confidence)
- [Better Stack Guide to Commander.js](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/) - Advanced patterns
- [CLI Dry Run Best Practices](https://nickjanetakis.com/blog/cli-tools-that-support-previews-dry-runs-or-non-destructive-actions)

### Tertiary (LOW confidence)
- Bun + ora compatibility: WebSearch indicates works but needs testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed or well-documented
- Architecture: HIGH - Following existing codebase patterns
- Pitfalls: HIGH - Based on existing CLI implementation experience

**Research date:** 2026-02-05
**Valid until:** 60 days (stable domain, established patterns)
