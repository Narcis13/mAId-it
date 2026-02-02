# FlowScript

## What This Is

A text-native workflow engine that executes `.flow.md` files as programs. Unlike visual workflow tools (n8n, Zapier), FlowScript uses markdown files with YAML frontmatter, XML execution logic, and auto-populated execution logs. Built on Bun with AI as a first-class citizen — not just "call AI" but AI reasoning embedded in control flow.

## Core Value

**Execute living markdown files as powerful, type-safe workflow programs with AI woven into every layer.**

If this doesn't work — parsing, validating, and running `.flow.md` files with AI nodes — nothing else matters.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Parse `.flow.md` files (YAML frontmatter + XML body + Markdown footer)
- [ ] Validate workflows against type system and schemas
- [ ] Execute nodes sequentially with data flowing between them
- [ ] Execute nodes in parallel (wave-based DAG scheduler)
- [ ] Full control flow: `<branch>`, `<match>`, `<if>`, `<loop>`, `<while>`, `<foreach>`, `<break>`
- [ ] Core source nodes: `http`, `file`
- [ ] Core transform nodes: `ai`, `template`, `map`, `filter`
- [ ] Core sink nodes: `http`, `file`
- [ ] AI integration via OpenRouter (model-agnostic: Claude, GPT, etc.)
- [ ] Structured AI output with schema validation
- [ ] Expression language with variable references and built-in functions
- [ ] Error handling: retry with backoff, fallback
- [ ] File-based state persistence
- [ ] Context hierarchy (global → phase → node)
- [ ] CLI interface: `flowscript run`, `flowscript validate`
- [ ] CLI-based checkpoints for human approval
- [ ] Execution logging in markdown footer

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

Design documents exist in this directory:
- `WORKFLOW-ENGINE-BRAINSTORM.md` — Core concepts, node architecture, runtime design
- `WORKFLOW-ENGINE-PARADIGM-SHIFTS.md` — 10 revolutionary concepts
- `WORKFLOW-ENGINE-SPEC.md` — Formal syntax specification

The design is comprehensive. v1 implements Phases 1-2 from the brainstorm (Core Engine + AI Integration) with full control flow and parallel execution.

**Key architectural decisions from spec:**
- Three-part file format: YAML → XML → Markdown
- Typed data flow between nodes
- Expression language for templating (`{{node.output}}`, `$config.key`)
- Pattern matching for branch conditions
- Wave-based parallel execution

## Constraints

- **Runtime**: Bun — fast, TypeScript-native, modern
- **Language**: TypeScript — type safety matches the typed workflow design
- **AI Provider**: OpenRouter — single API abstracting multiple models (Claude, GPT, etc.)
- **Output Location**: `/src` folder at repository root
- **Design Docs**: Existing `.md` files are the source of truth for syntax/semantics

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bun over Node | Faster startup, native TypeScript, modern APIs | — Pending |
| OpenRouter for AI | Model-agnostic, single API for Claude/GPT/etc. | — Pending |
| File-based state for v1 | Simplicity over flexibility, pluggable backends in v2 | — Pending |
| XML for execution logic | Self-documenting, easy to parse, readable in PRs | — Pending |
| Wave-based parallelism | Proven pattern from design, enables `<parallel>` and `<foreach>` | — Pending |

---
*Last updated: 2025-02-02 after initialization*
