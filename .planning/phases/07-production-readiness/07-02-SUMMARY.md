---
phase: 07-production-readiness
plan: 02
subsystem: checkpoint
tags: [human-in-the-loop, terminal-prompts, TTY, timeout, readline]

dependency_graph:
  requires: [07-01]
  provides: [checkpoint-runtime]
  affects: [07-03, 07-04]

tech_stack:
  added: []
  patterns:
    - node:readline for terminal input
    - TTY detection with process.stdin.isTTY
    - Timeout-based default action

key_files:
  created:
    - src/runtimes/checkpoint/types.ts
    - src/runtimes/checkpoint/runtime.ts
    - src/runtimes/checkpoint/runtime.test.ts
    - src/runtimes/checkpoint/index.ts
  modified:
    - src/runtimes/index.ts

decisions:
  - id: checkpoint-non-tty
    choice: Use default action immediately in non-TTY environments
    rationale: CI/CD pipelines and automated tests should not block waiting for input
  - id: checkpoint-max-attempts
    choice: Maximum 3 invalid input attempts before using default action
    rationale: Prevent infinite loops from typos while giving users multiple chances
  - id: checkpoint-sigint
    choice: SIGINT (Ctrl+C) during prompt returns reject action
    rationale: Graceful cancellation should be treated as explicit rejection

metrics:
  duration: 2 min
  completed: 2026-02-05
---

# Phase 7 Plan 2: Checkpoint Runtime Summary

Checkpoint runtime for human-in-the-loop workflow pauses using node:readline with TTY detection and timeout support.

## What Was Built

### Types (src/runtimes/checkpoint/types.ts)
- **CheckpointAction**: Union type for 'approve' | 'reject' | 'input'
- **CheckpointConfig**: message, timeout, defaultAction, allowInput
- **CheckpointResult**: action, input?, timedOut, respondedAt

### Runtime (src/runtimes/checkpoint/runtime.ts)
- **CheckpointRuntime**: Implements NodeRuntime interface
- **TTY detection**: Checks process.stdin.isTTY before prompting
- **Terminal prompts**: Displays message with [A]pprove / [R]eject / [I]nput options
- **Timeout support**: Configurable timeout with default action fallback
- **Input parsing**: Accepts 'a', 'approve', 'r', 'reject', 'i', 'input'
- **SIGINT handling**: Graceful cancellation returns reject action
- **Retry logic**: Max 3 attempts for invalid input

### Registration (src/runtimes/checkpoint/index.ts)
- Auto-registers checkpoint runtime with global registry
- Exports types and runtime singleton

## Key Implementation Details

```typescript
// Non-TTY environments skip prompt immediately
if (!process.stdin.isTTY) {
  return {
    action: defaultAction,
    timedOut: false,
    respondedAt: Date.now(),
  };
}

// TTY environment: prompt with readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
```

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Non-TTY behavior | Default action immediately | CI/CD should not block |
| Max attempts | 3 | Balance between tolerance and security |
| SIGINT handling | Return reject | Explicit cancellation = rejection |

## Deviations from Plan

None - plan executed exactly as written.

## Test Coverage

12 tests covering:
- Type identifier verification
- Non-TTY environment behavior with approve/reject defaults
- Timeout bypassing in non-TTY
- Result structure validation
- Configuration option acceptance

## Commits

| Hash | Description |
|------|-------------|
| 183c281 | Add checkpoint runtime types |
| dd8fec7 | Implement checkpoint runtime with TTY detection |
| 757f851 | Register checkpoint runtime and export types |

## Next Phase Readiness

The checkpoint runtime is fully implemented and ready for integration with:
- Plan 07-03 (Structured Logging) for logging checkpoint events
- Plan 07-04 (Error Boundaries) for checkpoint failure handling
