# Sprint Batches: A Coding Strategy for AI Agents

**Version:** 1.0.0
**Context:** Post-MVP extension of established codebases
**Optimized for:** Claude Code (Opus) operating in session-bounded context windows

---

## 1. When to Use This Strategy

Sprint Batches is the right strategy when:

- The codebase architecture is **settled** (patterns exist, modules have clear boundaries)
- A **gap analysis or backlog** already exists (the "what" is known)
- Most work items are **independent** (low coupling between batches)
- Items follow **established patterns** (e.g., adding a new runtime mirrors existing ones)
- The work is **extension**, not greenfield

Do NOT use this for:

- Greenfield projects (use phased planning like GSD/LPL)
- Deep architectural redesigns (use EnterPlanMode per change)
- Exploratory research with unknown outcomes (use research agents)

---

## 2. Core Principles

### 2.1 One Session = One Batch = One Commit

Every coding session has a clear scope, produces a testable result, and ends with a commit. No half-finished branches, no "I'll fix the tests next time."

### 2.2 Context Is Finite — Spend It on Code

The agent's context window is the bottleneck. Every token spent on ceremony (plans, research docs, verification reports) is a token not spent on implementation. When the pattern is known, skip to code.

### 2.3 Tests Are the Spec

If it doesn't have a test, it doesn't exist. Write the test first when adding features. Run the full suite before committing. Tests replace heavyweight verification passes.

### 2.4 Patterns Over Plans

When the codebase has established patterns (e.g., "every runtime has a `runtime.ts` that implements `NodeRuntime` and registers via `runtimeRegistry.register()`"), following the pattern IS the plan. No separate planning document needed.

### 2.5 Batch by File Proximity

Group items that touch the same files. This minimizes the number of files loaded into context per session and maximizes coherence. A batch touching `parser/body.ts` + `parser/body.test.ts` is better than one touching `parser/body.ts` + `execution/executor.ts` + `cli/run.ts`.

---

## 3. Batch Structure

### 3.1 Batch Definition

Each batch is defined in `BACKLOG.md` with:

```markdown
## BATCH N: <Name> [<Tier>]

**Scope:** <1-line description of what this batch accomplishes>
**Files:** <primary files touched>
**Depends on:** <batch numbers that must be done first, or "none">
**Estimated effort:** S / M / L
**Items:**
- [ ] Item 1 (complexity: low/medium/high)
- [ ] Item 2
- [ ] ...
```

### 3.2 Batch Sizing Rules

- **2-5 items per batch** (fewer = underutilizing the session; more = context overflow risk)
- **Items must be related** (same module, same pattern, same subsystem)
- **Total batch should fit in <60% context** (leave room for debugging and iteration)
- **Each item must be independently testable** (if one fails, others still work)

### 3.3 Batch Ordering

Batches are ordered by:
1. **Dependencies** — If Batch B needs parser changes from Batch A, A comes first
2. **Foundation first** — Bug fixes before new features (clean foundation)
3. **Unlock value** — Parser expansion unlocks many downstream batches
4. **Independence** — After dependencies are met, order by value/complexity ratio

---

## 4. Session Protocol

Every session follows this exact sequence. No skipping steps.

### Step 1: ORIENT (2 min)

```
1. Read MEMORY.md (persistent learnings)
2. Read BACKLOG.md (find current batch)
3. Read session log (if continuing from prior session)
4. Confirm the batch is still the right next thing
```

**Decision point:** If the batch feels wrong (dependencies not met, scope changed), re-prioritize before coding.

### Step 2: LOAD (5 min)

```
1. Read ONLY the files this batch touches
2. Read 1-2 existing implementations as pattern templates
3. Read existing tests for the module (these are the spec)
4. Note any surprises or discrepancies
```

**Rule:** Do NOT read files "just in case." Every file loaded costs context tokens. Be surgical.

### Step 3: IMPLEMENT (20-40 min)

```
1. Write tests first (for new features)
2. Write code following established patterns
3. Run tests after each significant change (bun test <specific-file>)
4. Keep changes minimal — no drive-by refactors
5. If stuck after 3 attempts, stop and reassess
```

**Rules:**
- No changes to files outside the batch scope
- No "improvements" to adjacent code
- No new abstractions unless the batch specifically calls for one
- Copy-paste from existing patterns is GOOD (consistency > cleverness)

### Step 4: VERIFY (5 min)

```
1. Run full test suite (bun test)
2. Quick smoke test if runtime behavior changed
3. git diff — review all changes for accidental mutations
4. Check for regressions in unrelated tests
```

**Gate:** ALL tests must pass. No "I'll fix that later." If something broke, fix it now or revert the breaking change.

### Step 5: CLOSE (3 min)

```
1. Commit with descriptive message: "feat(batch-N): <what was done>"
2. Update BACKLOG.md — check off completed items
3. Update MEMORY.md if a new learning was discovered
4. Note any follow-up items discovered during implementation
```

---

## 5. Escalation Rules

Not everything fits a sprint batch. Know when to escalate:

| Situation | Action |
|-----------|--------|
| Item requires architectural decision | Use EnterPlanMode for that item alone |
| Discovered a cross-cutting concern | Pause, write it up, ask user for direction |
| Batch exceeds 60% context | Split the batch, defer the rest |
| Tests fail after 3 fix attempts | Stop, describe the situation clearly, ask for help |
| Spec feature is ambiguous | Ask a specific question with options, don't guess |
| Item is much larger than estimated | Promote it to its own batch or split it |
| Bug found in unrelated code | Log it as a new backlog item, don't fix it now |

---

## 6. Session Continuity

Between sessions, state lives in three places:

### 6.1 MEMORY.md (Persistent Learnings)

Captures things that would bite future sessions:
- Unusual API behaviors (e.g., "Zod _def.type not _def.typeName")
- Registration patterns that must match exactly
- Non-obvious codebase conventions

### 6.2 BACKLOG.md (Batch State)

The source of truth for what's done, what's next, what's blocked. Updated at the end of every session.

### 6.3 Git History (Implementation Record)

The code and commit messages tell the story. Commit messages reference batch numbers for traceability.

**What we DON'T maintain:**
- No RESEARCH.md per batch (the gap analysis is the research)
- No PLAN.md per batch (the pattern is the plan)
- No VERIFICATION.md per batch (the tests are the verification)

---

## 7. Quality Gates

### Per-Item Gates
- [ ] Tests pass for the specific item
- [ ] No TypeScript errors (`bun build` clean)
- [ ] Follows existing codebase patterns

### Per-Batch Gates
- [ ] Full test suite passes (`bun test`)
- [ ] `git diff` reviewed — no accidental changes
- [ ] BACKLOG.md updated
- [ ] Commit message references batch

### Per-Milestone Gates (every 3-5 batches)
- [ ] Run all example workflows end-to-end
- [ ] Check spec coverage delta (update gaps.md summary stats)
- [ ] Review MEMORY.md for accuracy
- [ ] Consider if batch ordering needs adjustment

---

## 8. Anti-Patterns to Avoid

### The Rabbit Hole
"While fixing the concat bug, I noticed the function registry could be improved, and that led me to refactor the expression evaluator..." — NO. Fix the concat bug. Commit. Move on.

### The Gold Plate
"The delay runtime works, but I should also add support for human-readable durations, ISO durations, cron expressions, and relative time strings." — NO. Implement what the batch specifies. Log the rest as future items.

### The Context Hog
"Let me read every file in the expression/ directory to understand the full picture before making this one-line fix." — NO. Read the file you're changing and the test file. That's it.

### The Ceremony Tax
"Before implementing this runtime, let me write a RESEARCH.md about different approaches, then a PLAN.md with the chosen approach, then get approval..." — NO. The pattern exists. The spec exists. Just implement it.

### The Phantom Dependency
"I can't implement the delay runtime until the timeout runtime is also done." — Really? Or can each work independently? Challenge every dependency claim.

---

## 9. Adapting This Strategy

### For Larger Items (complexity: high)
Promote to a dedicated batch with only 1-2 items. Allow a full session. Consider using EnterPlanMode if the approach is unclear.

### For Truly Independent Items
Run multiple batches in parallel sessions if tooling supports it. The independence guarantee means no merge conflicts.

### For Items That Outgrow Their Batch
Split mid-session if needed. Commit what's done, update BACKLOG.md with the remainder as a new batch.

### For New Categories of Work
Create new batches dynamically. The backlog is a living document, not a fixed roadmap.

---

## 10. Metrics (Optional)

Track if you want to optimize the process:

- **Items per session** (target: 2-5)
- **Session duration** (target: 30-60 min)
- **Test pass rate on first run** (target: >80%)
- **Batches per milestone** (tracks velocity)
- **Escalation frequency** (if >20%, batches are too ambitious)
