---
phase: 01-foundation
plan: 04
subsystem: validation
tags: [validator, secrets, references, gap-closure]

dependency-graph:
  requires: [01-03]
  provides: [secret-validation]
  affects: []

tech-stack:
  added: []
  patterns: [source-scanning, regex-extraction]

key-files:
  created:
    - src/validator/references.test.ts
  modified:
    - src/validator/references.ts

decisions:
  - id: secret-pattern
    choice: "{{$secrets.NAME}} pattern (dollar sign inside braces)"
    rationale: "Matches actual usage in workflow files"
  - id: source-scanning
    choice: "Scan raw source string instead of node.config"
    rationale: "Catches secrets in XML child elements, not just attributes"
  - id: deduplication
    choice: "Report each undeclared secret only once"
    rationale: "Avoid duplicate errors for same secret referenced multiple times"

metrics:
  duration: 2 min
  completed: 2026-02-02
---

# Phase 1 Plan 4: Secret Reference Validation Fix Summary

**One-liner:** Fixed secret reference detection by correcting regex pattern and scanning raw source to catch secrets in XML child elements.

## What Was Done

### Task 1-2: Fix Secret Reference Validation

**Problem:** The validator was not detecting undeclared secrets because:
1. The regex pattern expected `${{secrets.NAME}}` but actual usage is `{{$secrets.NAME}}`
2. The code only checked `node.config` (XML attributes), missing secrets in child elements like `<headers>`, `<url>`, `<body>`

**Solution:**
- Changed regex from `/\$?\{\{secrets\.(\w+)\}\}/g` to `/\{\{\$secrets\.(\w+)\}\}/g`
- Changed `validateSecretReferences` to scan raw source string instead of iterating nodes
- Added deduplication to avoid reporting the same undeclared secret multiple times
- Added approximate line number tracking for error location

### Task 3: Test Coverage

Added 6 test cases covering:
- Undeclared secret in HTTP headers detected
- Declared secret passes validation
- Multiple undeclared secrets all reported
- Secret in transform template detected
- Same secret referenced multiple times only reported once
- Error hints include how to declare the secret

## Verification Results

```
$ bun src/cli/index.ts validate /tmp/undeclared-secret.flow.md
error[VALID_UNDEFINED_SECRET_REF]: Undeclared secret "UNDECLARED" referenced in workflow
  --> /tmp/undeclared-secret.flow.md:8:0
hint: Declare the secret in frontmatter: secrets: [UNDECLARED]

$ bun src/cli/index.ts validate /tmp/declared-secret.flow.md
Valid /tmp/declared-secret.flow.md (1 node)

$ bun test src/validator/references.test.ts
6 pass, 0 fail
```

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

**Before (broken):**
```typescript
// Only checked node.config attributes
for (const [key, value] of Object.entries(config)) {
  if (typeof value === 'string') {
    errors.push(...checkSecretRefs(value, node, declaredSecrets));
  }
}
// Wrong pattern: ${{secrets.NAME}} instead of {{$secrets.NAME}}
const secretPattern = /\$?\{\{secrets\.(\w+)\}\}/g;
```

**After (fixed):**
```typescript
// Scan entire raw source for secret patterns
const secretPattern = /\{\{\$secrets\.(\w+)\}\}/g;
while ((match = secretPattern.exec(source)) !== null) {
  // Extract secret name and validate against declared secrets
}
```

## Next Phase Readiness

Phase 1 gap closure complete. The verification gap identified in 01-VERIFICATION.md is now addressed:
- Secret references in XML child elements are detected
- Correct `{{$secrets.NAME}}` pattern is matched
- CLI reports clear errors with hints for fixing

## Files Modified

| File | Changes |
|------|---------|
| `src/validator/references.ts` | Fixed regex, changed to source scanning, removed unused helpers |
| `src/validator/references.test.ts` | Created with 6 test cases |
