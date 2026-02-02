---
phase: 03-source-sink-runtimes
plan: 02
subsystem: runtime-http
tags: [http, fetch, jmespath, authentication, api-integration]

dependency-graph:
  requires: [03-01]
  provides: [http:source runtime, http:sink runtime, JMESPath extraction]
  affects: [04-transform-control]

tech-stack:
  added:
    - "@jmespath-community/jmespath@1.3.0"
  patterns:
    - Runtime auto-registration via side-effect imports
    - Separate registry module to avoid circular dependencies
    - Template expression resolution via evaluateTemplateInContext

key-files:
  created:
    - src/runtimes/http/source.ts
    - src/runtimes/http/sink.ts
    - src/runtimes/http/index.ts
    - src/runtimes/registry.ts
  modified:
    - src/runtimes/index.ts
    - package.json
    - bun.lock

decisions:
  - id: 03-02-01
    decision: JMESPath extraction at source level via config.extract
    rationale: Allows selective data extraction before passing to downstream nodes
  - id: 03-02-02
    decision: Separate registry.ts file to avoid circular imports
    rationale: HTTP module imports registry, and index imports HTTP module
  - id: 03-02-03
    decision: Default timeout 30 seconds for all HTTP operations
    rationale: Balance between allowing slow APIs and preventing hangs
  - id: 03-02-04
    decision: Sink returns status/headers metadata, not response body
    rationale: Sinks are endpoints, not data sources; metadata is useful for logging

metrics:
  duration: 2 min
  completed: 2026-02-02
---

# Phase 3 Plan 2: HTTP Runtimes Summary

HTTP source and sink runtimes with bearer/basic auth, JMESPath extraction, and configurable timeouts.

## What Was Built

### HTTP Source Runtime (src/runtimes/http/source.ts)
- GET and POST methods with template expression resolution in URL, headers, params
- Bearer and basic authentication via auth config
- Query parameter building with URLSearchParams
- JMESPath response extraction via config.extract
- 30-second default timeout using AbortSignal.timeout()
- HttpError thrown with status code and response body

### HTTP Sink Runtime (src/runtimes/http/sink.ts)
- POST, PUT, PATCH methods (default POST)
- Sends input from previous node as JSON body
- Bearer and basic authentication support
- Returns metadata: status, statusText, headers
- Same timeout and error handling as source

### Registry Separation (src/runtimes/registry.ts)
- Moved RuntimeRegistry class to separate file
- Prevents circular dependency: index -> http -> registry -> types
- Main index re-exports from registry.ts

### Auto-Registration (src/runtimes/http/index.ts)
- Registers http:source and http:sink on module import
- Side-effect import in main index ensures registration

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-02-01 | JMESPath extraction at source level | Selective data extraction before downstream nodes |
| 03-02-02 | Separate registry.ts file | Avoid circular import between index and http modules |
| 03-02-03 | 30s default timeout | Balance slow APIs vs preventing hangs |
| 03-02-04 | Sink returns metadata only | Sinks are endpoints; metadata useful for logging |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Circular import dependency**
- **Found during:** Task 3
- **Issue:** HTTP module imported runtimeRegistry from index.ts, but index.ts imported http module, causing "Cannot access before initialization" error
- **Fix:** Created separate registry.ts file; HTTP module imports from registry.ts instead
- **Files modified:** src/runtimes/registry.ts (new), src/runtimes/http/index.ts, src/runtimes/index.ts
- **Commit:** bb5388f

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 5d4c415 | feat | Install JMESPath and create HTTP source runtime |
| 798c301 | feat | Create HTTP sink runtime |
| bb5388f | feat | Create HTTP module exports and register runtimes |

## Test Results

```
172 pass, 0 fail
356 expect() calls
Ran 172 tests across 5 files. [34.00ms]
```

## Key Code Examples

### HTTP Source with JMESPath Extraction
```typescript
const httpSourceRuntime = runtimeRegistry.get('http:source');
await httpSourceRuntime.execute({
  node,
  input: undefined,
  config: {
    url: 'https://api.example.com/users',
    method: 'GET',
    auth: { type: 'bearer', token: '{{$secrets.API_TOKEN}}' },
    extract: 'data.users[*].{id: id, name: name}'
  },
  state
});
```

### HTTP Sink Posting Data
```typescript
const httpSinkRuntime = runtimeRegistry.get('http:sink');
await httpSinkRuntime.execute({
  node,
  input: { name: 'John', email: 'john@example.com' },
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',
    auth: { type: 'bearer', token: '{{$secrets.WEBHOOK_TOKEN}}' }
  },
  state
});
// Returns: { status: 200, statusText: 'OK', headers: {...} }
```

## Next Phase Readiness

**Ready for:**
- Plan 03-03 (File Runtimes) - same pattern, different I/O
- Phase 04 (Transform/Control) - runtimes provide data to transform

**No blockers identified.**
