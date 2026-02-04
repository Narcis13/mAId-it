# Phase 4: AI Integration - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Call AI models via OpenRouter API with structured output validation. Users can define AI nodes that send prompts to models (Claude, GPT, etc.), validate responses against schemas, and handle retries automatically. Fallback models, cost guardrails, and multi-turn conversations are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Prompt design
- Prompts structured as separate child elements: `<system>...</system>` and `<user>...</user>`
- Both system and user prompts support full template expressions `{{node.output.field}}`
- Single turn only — each AI node is one request-response; chain nodes for conversations
- Input data via `input="{{upstream.output}}"` attribute, accessible as `$input` in templates

### Schema & validation
- Output schemas declared inline with zod-like DSL: `output-schema="{name: string, tags: string[]}"`
- Auto-retry with feedback on validation failure — include validation error in retry prompt for self-correction
- 3 retries default before giving up
- Strict JSON rejection — if JSON parsing fails, treat as validation failure and retry

### Model configuration
- Full OpenRouter model ID: `model="anthropic/claude-3.5-sonnet"` (explicit, no aliases)
- Token budget via `max-tokens="4096"` attribute (output tokens)
- Sensible defaults for temperature/params — no per-node knobs exposed
- API key via secrets reference: `$secrets.OPENROUTER_API_KEY`

### Error & rate limiting
- Exponential backoff on 429 rate limits (1s, 2s, 4s, 8s... with jitter)
- 60 second default timeout for AI calls
- No fallback models in this phase — one model per node
- No cost guardrails in this phase — trust the user

### Claude's Discretion
- Exact retry prompt format when including validation errors
- Jitter implementation for backoff
- How to structure the OpenRouter request body
- Error message formatting for AI failures

</decisions>

<specifics>
## Specific Ideas

- Schema syntax should feel like writing TypeScript types inline, not verbose zod calls
- Validation error feedback should be clear enough that the model can understand what it got wrong

</specifics>

<deferred>
## Deferred Ideas

- Fallback models when primary fails — future phase
- Cost guardrails / max spend per run — production features
- Multi-turn conversations within single node — keep it simple for now
- Model aliases (claude-sonnet → anthropic/claude-3.5-sonnet) — nice to have later

</deferred>

---

*Phase: 04-ai-integration*
*Context gathered: 2026-02-04*
