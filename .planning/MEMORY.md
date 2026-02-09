# FlowScript (maidit) - Key Learnings

## Development Strategy
- **Sprint Batches** methodology: see `.planning/STRATEGY.md`
- Backlog with 10 ordered batches: see `.planning/BACKLOG.md`
- Session protocol: ORIENT → LOAD → IMPLEMENT → VERIFY → CLOSE
- One session = one batch = one commit
- Batch 1 (bugfixes) done, Batch 2 (parser) is next and unlocks 4/7/9

## Zod Internals (installed version)
The Zod version in this project uses a different internal API than standard:
- `_def.type` = `"object"`, `"string"`, `"number"`, `"boolean"`, `"array"` (NOT `_def.typeName` = `"ZodObject"` etc.)
- `_def.shape` = plain object (NOT a function)
- `_def.element` = array element type (NOT `_def.type` for inner schema)
- Always check both patterns when writing code that introspects Zod schemas

## Runtime Registration
- Executor generates runtime keys as `{category}:{transformType}` (e.g., `transform:ai`)
- Runtime `type` field must match this pattern exactly
- The scheduler only maps top-level nodes to `plan.nodes` — nested body nodes (loop, foreach) must be passed directly via result objects

## Loop Execution
- `LoopResult` carries `bodyNodes: NodeAST[]` directly since nested nodes aren't in `plan.nodes`
- Executor handles `LoopResult` like `ParallelResult`/`ForeachResult` — intercepts and iterates

## AI Runtime
- Returns `result.output` directly (not the full `AIResult` wrapper) for downstream data flow
- `remapKeysToSchema` handles model using synonyms (e.g., `rating` → `score`) by matching value types
- System prompt field-name hints help but proper tool schema via `zodToJsonSchema` is essential

## Execution Logging
- `logPath` must be passed to `execute()` in `run.ts` for logging to work
- `appendExecutionLog` handles HTML comment wrappers `<!-- -->` around existing log sections

## Batch 1 Learnings (2026-02-09)
- Items 1.3 (nodeContext mutation) and 1.5 (fallback retrying) shared the same code path (`executeFallbackNode`) — fixed together
- `concat` name collision: spread order matters — later spreads overwrite earlier keys
- Trigger parser fix was in `frontmatter.ts` not `structural.ts` despite backlog listing validator
