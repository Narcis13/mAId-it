# Research Summary: FlowScript

> Synthesized from Stack, Features, Architecture, and Pitfalls research

---

## Key Findings

### Recommended Stack

**Only 4 external dependencies needed:**

| Category | Choice | Rationale |
|----------|--------|-----------|
| **YAML** | `Bun.YAML` (built-in) | Native Zig parser, zero deps |
| **XML** | `fast-xml-parser` v5.3.x | 43M weekly downloads, fastest |
| **Expression** | `expression-sandbox` | Sandboxed, secure |
| **Schema** | `zod` v3.x | TypeScript-first, excellent DX |
| **CLI** | `commander` v12.x | Battle-tested, Bun-compatible |
| **HTTP** | Native `fetch` | Built-in, 3x faster than Node |
| **Persistence** | `bun:sqlite` | Native, 3-6x faster than better-sqlite3 |

**Build custom:** DAG scheduler (200-300 lines, Kahn's algorithm)

### Table Stakes Features

Must have or users leave:
- Trigger nodes (webhook, schedule, manual)
- HTTP/file source and sink nodes
- AI nodes with structured output
- Conditional branching (if/else, switch)
- Loops (foreach, while)
- Retry with exponential backoff
- Error fallback paths
- Execution logging

### Differentiators

What makes FlowScript unique:
1. **Git-native** — meaningful diffs, branch/merge, CI/CD
2. **AI-first** — not bolt-on, woven into control flow
3. **Text = portability** — LLMs can read/write workflows
4. **Progressive complexity** — start simple, add as needed
5. **Lightweight runtime** — no database required for simple cases

### Architecture Pattern

```
Parser → Validator → Scheduler → Executor
                                    ↓
                              Node Runtimes
                          (HTTP, AI, File, Control)
```

**Build order:**
1. Parser (YAML + XML sections)
2. Validator (structural → references → types)
3. Basic CLI (`flowscript validate`)
4. Expression evaluator
5. Executor framework (sequential first)
6. HTTP runtime (proves the pattern)
7. File runtime
8. AI runtime (OpenRouter)
9. Schema validation
10. Scheduler (waves, parallelism)
11. Control flow (branch, loop, foreach)
12. Error handling (retry, fallback)
13. State persistence
14. Execution logging
15. Full CLI (`flowscript run`)

### Critical Pitfalls to Avoid

**Security-critical (Phase 1):**
- XXE injection — disable DTD processing in XML parser
- YAML deserialization attacks — use safe parsing
- Expression injection — sandbox evaluation, never concat user input

**Execution (Phase 3-4):**
- Race conditions in parallel completion — use optimistic locking
- Memory leaks — proper cleanup on workflow completion
- Token limits — calculate before sending to AI
- Rate limit cascades — client-side rate limiting with jitter

**State (Phase 2):**
- Partial state corruption — use transactions/WAL
- Lost state on crash — persist at each step
- Recovery to wrong state — idempotent task design

---

## Implications for v1

### Must Include
- Safe parsing (no XXE, no YAML object instantiation)
- Sandboxed expression evaluation
- Structured AI output with schema validation
- Retry with backoff (exponential, jitter)
- Token budget awareness for AI calls
- File-based state with atomic writes

### Can Defer
- Distributed scheduling (single-process is fine for v1)
- Checkpoint pruning (manual cleanup acceptable)
- Multi-provider AI failover
- Complex state migration

### Design Decisions Locked

| Decision | Rationale |
|----------|-----------|
| Bun runtime | Fast, native TypeScript, built-in YAML/SQLite |
| fast-xml-parser | Dominant, fast, well-maintained |
| Custom DAG scheduler | No good libraries, simple to build |
| zod for schemas | TypeScript-first, excellent inference |
| OpenRouter for AI | Model-agnostic, single integration |
| File-based state v1 | Simple, sufficient, no infra needed |

---

*Research completed: 2025-02-02*
