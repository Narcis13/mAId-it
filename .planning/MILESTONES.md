# Project Milestones: FlowScript

## v1.0 MVP (Shipped: 2026-02-05)

**Delivered:** A text-native workflow engine that executes .flow.md files as programs with AI, control flow, parallel execution, and production-ready error handling.

**Phases completed:** 1-8 (30 plans total)

**Key accomplishments:**

- Parser & Validator — Parse .flow.md files (YAML + XML) with XXE protection and comprehensive validation
- Expression Language — Sandboxed evaluator with 115 built-in functions and context hierarchy
- HTTP & File Runtimes — Full source/sink with auth, JMESPath extraction, and path security
- AI Integration — OpenRouter client with structured output, schema DSL, retry with backoff
- Control Flow & Transforms — Branch, if, loop, foreach, parallel; template, map, filter
- Production Readiness — Retry with jitter, fallback, checkpoints, state persistence, resume, logging
- Complete CLI — validate, run with --dry-run, --config, --input options

**Stats:**

- 95 files created
- 17,726 lines of TypeScript
- 8 phases, 30 plans
- 4 days from start to ship (2026-02-02 → 2026-02-05)
- 386+ tests passing

**Git range:** `feat(01-01)` → `feat(08-02)`

**What's next:** v1.1 or v2.0 — additional runtimes (database, email, queue), self-evolution, advanced error handling

---
