# FlowScript

## What This Is

A text-native workflow engine that executes `.flow.md` files as programs. Unlike visual workflow tools (n8n, Zapier), FlowScript uses markdown files with YAML frontmatter, XML execution logic, and auto-populated execution logs. Built on Bun with AI as a first-class citizen — not just "call AI" but AI reasoning embedded in control flow.

## Core Value

**Execute living markdown files as powerful, type-safe workflow programs with AI woven into every layer.**

If this doesn't work — parsing, validating, and running `.flow.md` files with AI nodes — nothing else matters.

## Requirements

### Validated

- ✓ Parse `.flow.md` files (YAML frontmatter + XML body + Markdown footer) — v1.0
- ✓ Validate workflows against type system and schemas — v1.0
- ✓ Execute nodes sequentially with data flowing between them — v1.0
- ✓ Execute nodes in parallel (wave-based DAG scheduler) — v1.0
- ✓ Full control flow: `<branch>`, `<match>`, `<if>`, `<loop>`, `<while>`, `<foreach>`, `<break>` — v1.0
- ✓ Core source nodes: `http`, `file` — v1.0
- ✓ Core transform nodes: `ai`, `template`, `map`, `filter` — v1.0
- ✓ Core sink nodes: `http`, `file` — v1.0
- ✓ AI integration via OpenRouter (model-agnostic: Claude, GPT, etc.) — v1.0
- ✓ Structured AI output with schema validation — v1.0
- ✓ Expression language with variable references and built-in functions — v1.0
- ✓ Error handling: retry with backoff, fallback — v1.0
- ✓ File-based state persistence — v1.0
- ✓ Context hierarchy (global → phase → node) — v1.0
- ✓ CLI interface: `flowscript run`, `flowscript validate` — v1.0
- ✓ CLI-based checkpoints for human approval — v1.0
- ✓ Execution logging in markdown footer — v1.0

### Active

(None yet — define for next milestone)

### Out of Scope

- Self-evolution / automatic prompt improvement — complexity deferred to v2
- Circuit breaker / DLQ patterns — basic retry/fallback sufficient for v1
- Database, email, queue, slack nodes — http/file proves the architecture
- Workflow marketplace / sharing — ecosystem feature for later
- Workflow genetics / breeding — advanced paradigm for future
- Adversarial verification — v2+ feature
- Visual preview — text-native is the point
- Watch mode / file triggers — manual + schedule sufficient for v1

## Context

**Current State (v1.0 shipped):**
- 17,726 lines of TypeScript across 95 files
- Tech stack: Bun, TypeScript, jsep (expressions), Luxon (dates), zod (schemas)
- 386+ tests passing
- Full CLI: `flowscript validate` and `flowscript run`

**Design Documents:**
- `WORKFLOW-ENGINE-BRAINSTORM.md` — Core concepts, node architecture, runtime design
- `WORKFLOW-ENGINE-PARADIGM-SHIFTS.md` — 10 revolutionary concepts
- `WORKFLOW-ENGINE-SPEC.md` — Formal syntax specification

**Key Architectural Patterns:**
- Three-part file format: YAML → XML → Markdown
- Typed data flow between nodes with schema validation
- Expression language for templating (`{{node.output}}`, `$config.key`)
- Pattern matching for branch conditions
- Wave-based parallel execution with DAG scheduling
- Semaphore-based concurrency control

## Constraints

- **Runtime**: Bun — fast, TypeScript-native, modern
- **Language**: TypeScript — type safety matches the typed workflow design
- **AI Provider**: OpenRouter — single API abstracting multiple models (Claude, GPT, etc.)
- **Output Location**: `/src` folder at repository root
- **Design Docs**: Existing `.md` files are the source of truth for syntax/semantics

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bun over Node | Faster startup, native TypeScript, modern APIs | ✓ Good — 17k LOC works great |
| OpenRouter for AI | Model-agnostic, single API for Claude/GPT/etc. | ✓ Good — tool calling works |
| File-based state for v1 | Simplicity over flexibility, pluggable backends in v2 | ✓ Good — resume works |
| XML for execution logic | Self-documenting, easy to parse, readable in PRs | ✓ Good — clean AST |
| Wave-based parallelism | Proven pattern from design, enables `<parallel>` and `<foreach>` | ✓ Good — clean DAG scheduling |
| jsep for expressions | Lightweight, extensible, no eval() | ✓ Good — sandboxed |
| Luxon for dates | ESM-native, robust timezone handling | ✓ Good — 115 functions |
| Tool calling for AI output | Forces structured JSON, better than prompt-only | ✓ Good — schema validation works |
| Semaphore for concurrency | Simple, battle-tested pattern | ✓ Good — parallel execution works |

---
*Last updated: 2026-02-05 after v1.0 milestone*
