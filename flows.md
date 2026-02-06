# FlowScript -- All Supported Workflow Patterns

Every workflow below is a complete, valid `.flow.md` file that the engine can execute today (based on what is actually implemented). Each uses only features confirmed working across the parser, expression engine, runtimes, executor, and validator.

---

## 1. Basic Data Flows

### 1.1 Minimal Source-Only (HTTP GET)

The smallest valid workflow: a single HTTP source node.

**Features exercised:** YAML frontmatter parsing, XML body parsing, HTTP source runtime, scheduler (single-node wave)

```
---
name: minimal-http-get
version: 1.0.0
description: Fetch data from a public API
trigger: manual
---
<workflow>
  <source id="fetch-joke" type="http">
    <request>
      method: GET
      url: https://official-joke-api.appspot.com/random_joke
    </request>
  </source>
</workflow>
```

### 1.2 Source -> Sink (File Read -> File Write)

Read a JSON file and write it to another location.

**Features exercised:** File source runtime, file sink runtime, `input` dependency, 2-wave execution plan

```
---
name: file-copy
version: 1.0.0
description: Read a JSON file and write it elsewhere
trigger: manual
---
<workflow>
  <source id="read-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <sink id="write-data" type="file" input="read-data">
    <path>./output/copy.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 1.3 Source -> Transform -> Sink (HTTP -> Map -> File)

Fetch from an API, transform each item, save to file.

**Features exercised:** HTTP source, map transform with `$item` iteration variable, file sink, 3-wave plan, `now()` time function

```
---
name: fetch-transform-save
version: 1.0.0
description: Fetch a joke, format it, save to file
config:
  output_dir:
    type: string
    default: "./output"
    description: Directory to save output files
---
<workflow>
  <source id="fetch-joke" type="http">
    <request>
      method: GET
      url: https://official-joke-api.appspot.com/random_joke
    </request>
  </source>

  <transform id="format-joke" type="map" input="fetch-joke">
    <expression>merge($item, { fetched_at: now() })</expression>
  </transform>

  <sink id="save-joke" type="file" input="format-joke">
    <path>{{$config.output_dir}}/joke.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 1.4 Source -> Filter -> Sink

Read data, filter by condition, write passing items.

**Features exercised:** File source, filter transform with `$item` variable, file sink, comparison operators in expressions

```
---
name: filter-pipeline
version: 1.0.0
description: Read data, keep items with score above 50, write results
---
<workflow>
  <source id="read-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <transform id="filter-high" type="filter" input="read-data">
    <condition>$item.score > 50</condition>
  </transform>

  <sink id="write-results" type="file" input="filter-high">
    <path>./output/filtered.json</path>
    <format>json</format>
  </sink>
</workflow>
```

---

## 2. Transform Pipelines

### 2.1 Multi-Step Transforms (Source -> Filter -> Map -> Sink)

A 4-node data enrichment pipeline.

**Features exercised:** Chained `input` dependencies across 4 waves, filter + map transforms, ternary expressions, `merge()` function

```
---
name: data-enrichment
version: 1.0.0
description: Read data, filter, enrich with grades, write results
---
<workflow>
  <source id="read-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <transform id="filter-scores" type="filter" input="read-data">
    <condition>$item.score > 50</condition>
  </transform>

  <transform id="add-grades" type="map" input="filter-scores">
    <expression>merge($item, { passed: true, grade: $item.score >= 90 ? "A" : $item.score >= 80 ? "B" : "C" })</expression>
  </transform>

  <sink id="write-results" type="file" input="add-grades">
    <path>./output/enriched.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 2.2 Template Transform (Format Data as Text)

Render structured data into a human-readable text report.

**Features exercised:** Template transform runtime, `{{expression}}` interpolation in templates, `length()`, `now()`, `json_encode()` functions, `input` variable in templates

```
---
name: text-report
version: 1.0.0
description: Read data and generate a text report
---
<workflow>
  <source id="read-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <transform id="report" type="template" input="read-data">
    <template>
      Data Report
      ===========
      Generated: {{now()}}
      Total items: {{length(input)}}
      Data: {{json_encode(input)}}
    </template>
  </transform>

  <sink id="save-report" type="file" input="report">
    <path>./output/report.txt</path>
  </sink>
</workflow>
```

### 2.3 Chained Map Transforms

Multiple map transforms in sequence, each refining the data.

**Features exercised:** Multiple map transforms chaining, `upper()` string function, `$item`/`$index`/`$first`/`$last` iteration variables

```
---
name: chained-maps
version: 1.0.0
description: Multiple map transforms in sequence
---
<workflow>
  <source id="data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <transform id="extract-names" type="map" input="data">
    <expression>$item.name</expression>
  </transform>

  <transform id="uppercase" type="map" input="extract-names">
    <expression>upper($item)</expression>
  </transform>

  <transform id="add-index" type="map" input="uppercase">
    <expression>to_string($index + 1) + ". " + $item</expression>
  </transform>

  <sink id="save" type="file" input="add-index">
    <path>./output/names.json</path>
    <format>json</format>
  </sink>
</workflow>
```

---

## 3. HTTP Integration

### 3.1 HTTP GET with Headers

Fetch from an API with custom headers and authentication.

**Features exercised:** HTTP source with headers, `$secrets` resolution from environment, bearer auth, JMESPath extraction

```
---
name: http-with-headers
version: 1.0.0
description: Fetch API data with auth headers and extract fields
secrets:
  - API_KEY
---
<workflow>
  <source id="fetch-users" type="http">
    <request>
      method: GET
      url: https://api.example.com/users
      headers:
        Authorization: Bearer {{$secrets.API_KEY}}
        Accept: application/json
    </request>
    <response>
      extract: $.data[*]
    </response>
  </source>
</workflow>
```

### 3.2 HTTP POST Sink with JSON Body

Send processed data to an external webhook.

**Features exercised:** HTTP sink with POST method, JSON body serialization, file source to HTTP sink pipeline

```
---
name: post-to-webhook
version: 1.0.0
description: Read data and POST it to a webhook
---
<workflow>
  <source id="data" type="file">
    <path>./data/payload.json</path>
    <format>json</format>
  </source>

  <sink id="send" type="http" input="data">
    <request>
      method: POST
      url: https://hooks.example.com/ingest
    </request>
  </sink>
</workflow>
```

### 3.3 HTTP -> Transform -> HTTP (API-to-API Pipeline)

Fetch from one API, transform, send to another.

**Features exercised:** HTTP source + HTTP sink in same workflow, map transform between them, template expression in URL

```
---
name: api-to-api
version: 1.0.0
description: Fetch from source API, transform, send to destination API
secrets:
  - SOURCE_API_KEY
  - DEST_API_KEY
config:
  dest_url:
    type: string
    default: "https://dest-api.example.com/ingest"
---
<workflow>
  <source id="fetch" type="http">
    <request>
      method: GET
      url: https://source-api.example.com/data
      headers:
        Authorization: Bearer {{$secrets.SOURCE_API_KEY}}
    </request>
  </source>

  <transform id="reshape" type="map" input="fetch">
    <expression>pick($item, ["id", "name", "value"])</expression>
  </transform>

  <sink id="send" type="http" input="reshape">
    <request>
      method: POST
      url: {{$config.dest_url}}
      headers:
        Authorization: Bearer {{$secrets.DEST_API_KEY}}
    </request>
  </sink>
</workflow>
```

---

## 4. AI Integration

### 4.1 Simple AI Prompt

A basic AI transform with a user prompt.

**Features exercised:** AI runtime via OpenRouter API, `OPENROUTER_API_KEY` secret, template expressions in prompts

```
---
name: simple-ai
version: 1.0.0
description: Send a prompt to an AI model
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="topic" type="file">
    <path>./data/topic.json</path>
    <format>json</format>
  </source>

  <transform id="generate" type="ai" input="topic">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <user>Write a short paragraph about: {{json_encode(input)}}</user>
  </transform>

  <sink id="save" type="file" input="generate">
    <path>./output/generated.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 4.2 AI with Structured Output (Schema DSL)

Force the AI to return structured JSON matching a schema.

**Features exercised:** Schema DSL parsing (`{field: type}` syntax), Zod validation, tool calling for structured output, retry on validation failure

```
---
name: ai-structured-output
version: 1.0.0
description: AI analysis with structured JSON output
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="article" type="file">
    <path>./data/article.json</path>
    <format>json</format>
  </source>

  <transform id="analyze" type="ai" input="article">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <system>You are a content analyst. Always provide thorough analysis.</system>
    <user>Analyze this article and provide a structured assessment: {{json_encode(input)}}</user>
    <output-schema>{summary: string, sentiment: string, score: number, tags: string[], key_points: {point: string, importance: number}[]}</output-schema>
  </transform>

  <sink id="save" type="file" input="analyze">
    <path>./output/analysis.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 4.3 AI with System Prompt and Max Tokens

Configure AI behavior with system prompt and token limits.

**Features exercised:** AI `system` and `user` prompts, `max-tokens` config, `$config` variable in prompts

```
---
name: ai-configured
version: 1.0.0
description: AI transform with full configuration
secrets:
  - OPENROUTER_API_KEY
config:
  style:
    type: string
    default: "professional"
    description: Writing style
---
<workflow>
  <source id="data" type="file">
    <path>./data/content.json</path>
    <format>json</format>
  </source>

  <transform id="rewrite" type="ai" input="data">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <system>You are an editor. Write in a {{$config.style}} style. Be concise.</system>
    <user>Rewrite this content: {{json_encode(input)}}</user>
    <max-tokens>2048</max-tokens>
  </transform>

  <sink id="save" type="file" input="rewrite">
    <path>./output/rewritten.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 4.4 Source -> AI -> Sink Pipeline

Full pipeline: fetch API data, analyze with AI, save results.

**Features exercised:** HTTP source + AI transform + file sink, cross-node data flow, structured output

```
---
name: ai-pipeline
version: 1.0.0
description: Fetch data, analyze with AI, save analysis
secrets:
  - OPENROUTER_API_KEY
  - DATA_API_KEY
---
<workflow>
  <source id="fetch-data" type="http">
    <request>
      method: GET
      url: https://api.example.com/latest
      headers:
        Authorization: Bearer {{$secrets.DATA_API_KEY}}
    </request>
  </source>

  <transform id="analyze" type="ai" input="fetch-data">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <user>Analyze trends in this data: {{json_encode(input)}}</user>
    <output-schema>{trends: string[], risk_level: string, recommendation: string}</output-schema>
  </transform>

  <sink id="save-analysis" type="file" input="analyze">
    <path>./output/trends-{{date("yyyy-MM-dd")}}.json</path>
    <format>json</format>
  </sink>
</workflow>
```

---

## 5. Control Flow - Conditionals

### 5.1 If/Then/Else

Route data down different paths based on a condition.

**Features exercised:** If runtime, condition evaluation with JavaScript truthiness, then/else branches with nested nodes, template transforms

```
---
name: conditional-routing
version: 1.0.0
description: Route data based on score threshold
---
<workflow>
  <source id="data" type="file">
    <path>./data/scores.json</path>
    <format>json</format>
  </source>

  <if id="check-score" condition="data.output.average > 75" input="data">
    <then>
      <transform id="pass-message" type="template" input="data">
        <template>PASSED: Average score {{data.output.average}} exceeds threshold</template>
      </transform>
      <sink id="save-pass" type="file" input="pass-message">
        <path>./output/result-pass.txt</path>
      </sink>
    </then>
    <else>
      <transform id="fail-message" type="template" input="data">
        <template>FAILED: Average score {{data.output.average}} below threshold</template>
      </transform>
      <sink id="save-fail" type="file" input="fail-message">
        <path>./output/result-fail.txt</path>
      </sink>
    </else>
  </if>
</workflow>
```

### 5.2 Branch with Multiple Cases + Default

Pattern matching across multiple conditions with fallback.

**Features exercised:** Branch runtime, ordered case evaluation, `when` condition expressions, default case, nested AI and template transforms

```
---
name: event-router
version: 1.0.0
description: Route events to different handlers by type
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="event" type="file">
    <path>./data/event.json</path>
    <format>json</format>
  </source>

  <branch id="route-event" input="event">
    <case when="event.output.type == 'urgent'">
      <transform id="handle-urgent" type="ai" input="event">
        <model>anthropic/claude-sonnet-4-20250514</model>
        <user>Handle this urgent event: {{json_encode(input)}}</user>
        <output-schema>{action: string, priority: number}</output-schema>
      </transform>
    </case>

    <case when="event.output.type == 'info'">
      <transform id="handle-info" type="template" input="event">
        <template>INFO logged at {{now()}}: {{json_encode(input)}}</template>
      </transform>
    </case>

    <case when="event.output.type == 'error'">
      <transform id="handle-error" type="template" input="event">
        <template>ERROR at {{now()}}: {{input.message}}</template>
      </transform>
    </case>

    <default>
      <transform id="handle-unknown" type="template" input="event">
        <template>Unknown event type: {{input.type}}</template>
      </transform>
    </default>
  </branch>
</workflow>
```

---

## 6. Control Flow - Loops

### 6.1 Fixed Loop with Max Iterations

Repeat a transform a fixed number of times.

**Features exercised:** Loop runtime, `max` attribute, body node execution per iteration

```
---
name: fixed-loop
version: 1.0.0
description: Run an AI transform 3 times for iterative improvement
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="draft" type="file">
    <path>./data/draft.json</path>
    <format>json</format>
  </source>

  <loop id="improve" max="3" input="draft">
    <transform id="refine" type="ai" input="draft">
      <model>anthropic/claude-sonnet-4-20250514</model>
      <user>Improve this text: {{json_encode(input)}}</user>
    </transform>
  </loop>

  <sink id="save" type="file" input="improve">
    <path>./output/refined.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 6.2 While Loop with Condition

Loop until a condition is no longer true.

**Features exercised:** While runtime, condition expression evaluation each iteration, safety bound (default 1000)

```
---
name: while-poll
version: 1.0.0
description: Poll an API until status is ready
---
<workflow>
  <while id="poll-status" condition="status != 'complete'">
    <source id="check" type="http">
      <request>
        method: GET
        url: https://api.example.com/job/123/status
      </request>
    </source>
  </while>
</workflow>
```

### 6.3 Loop with Break Condition

Loop up to a max but break early when a quality threshold is met.

**Features exercised:** Loop `max` + `break` attributes, break condition evaluation, AI with structured output inside loop

```
---
name: loop-with-break
version: 1.0.0
description: Iteratively refine until quality threshold met or max reached
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="initial" type="file">
    <path>./data/draft.json</path>
    <format>json</format>
  </source>

  <loop id="refine-loop" max="5" break="critique.output.score >= 8" input="initial">
    <transform id="improve" type="ai" input="initial">
      <model>anthropic/claude-sonnet-4-20250514</model>
      <user>Improve this content: {{json_encode(input)}}</user>
    </transform>

    <transform id="critique" type="ai" input="improve">
      <model>anthropic/claude-sonnet-4-20250514</model>
      <user>Rate this content 1-10 and explain: {{json_encode(input)}}</user>
      <output-schema>{score: number, feedback: string}</output-schema>
    </transform>
  </loop>

  <sink id="save-final" type="file" input="refine-loop">
    <path>./output/final-draft.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 6.4 Foreach Over Collection (Sequential)

Iterate over array items one at a time.

**Features exercised:** Foreach runtime, `collection` expression evaluation, `item` variable injection, sequential iteration (default `concurrency=1`)

```
---
name: foreach-sequential
version: 1.0.0
description: Process each item in a list sequentially
---
<workflow>
  <source id="items" type="file">
    <path>./data/items.json</path>
    <format>json</format>
  </source>

  <foreach id="process-each" collection="items.output" item="current" input="items">
    <transform id="enrich" type="map">
      <expression>merge(current, { processed: true, timestamp: now() })</expression>
    </transform>
  </foreach>

  <sink id="save" type="file" input="process-each">
    <path>./output/processed-items.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 6.5 Foreach with Concurrency

Process collection items in parallel with a concurrency limit.

**Features exercised:** Foreach `concurrency` attribute, semaphore-based parallel iteration, HTTP source inside foreach

```
---
name: foreach-concurrent
version: 1.0.0
description: Fetch multiple URLs concurrently with limit of 3
---
<workflow>
  <source id="url-list" type="file">
    <path>./data/urls.json</path>
    <format>json</format>
  </source>

  <foreach id="fetch-all" collection="url-list.output" item="url" concurrency="3" input="url-list">
    <source id="fetch-one" type="http">
      <request>
        method: GET
        url: {{url}}
      </request>
    </source>
  </foreach>

  <transform id="summary" type="template" input="fetch-all">
    <template>Successfully fetched {{length(input)}} URLs at {{now()}}</template>
  </transform>

  <sink id="save-summary" type="file" input="summary">
    <path>./output/fetch-summary.txt</path>
  </sink>
</workflow>
```

---

## 7. Parallel Execution

### 7.1 Parallel Branches

Run independent tasks concurrently. Each `<branch>` runs in its own execution context.

**Features exercised:** Parallel runtime, concurrent branch execution, semaphore-based concurrency control, results collected as ordered array

```
---
name: parallel-fetch
version: 1.0.0
description: Fetch from three APIs concurrently
---
<workflow>
  <parallel id="fetch-all">
    <branch>
      <source id="users" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/users
        </request>
      </source>
    </branch>
    <branch>
      <source id="posts" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts
        </request>
      </source>
    </branch>
    <branch>
      <source id="comments" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/comments
        </request>
      </source>
    </branch>
  </parallel>

  <transform id="counts" type="template" input="fetch-all">
    <template>Users: {{length(input[0])}}, Posts: {{length(input[1])}}, Comments: {{length(input[2])}}</template>
  </transform>

  <sink id="save" type="file" input="counts">
    <path>./output/api-counts.txt</path>
  </sink>
</workflow>
```

### 7.2 Parallel with Nested Transforms

Each branch can contain multi-step pipelines.

**Features exercised:** Parallel branches with sequential internal steps, filter and map inside branches, post-merge processing

```
---
name: parallel-pipelines
version: 1.0.0
description: Run independent data pipelines in parallel then merge
---
<workflow>
  <parallel id="pipelines">
    <branch>
      <source id="sales-data" type="http">
        <request>
          method: GET
          url: https://api.example.com/sales
        </request>
      </source>
      <transform id="high-sales" type="filter" input="sales-data">
        <condition>$item.amount > 1000</condition>
      </transform>
    </branch>

    <branch>
      <source id="user-data" type="http">
        <request>
          method: GET
          url: https://api.example.com/users
        </request>
      </source>
      <transform id="active-users" type="filter" input="user-data">
        <condition>$item.active == true</condition>
      </transform>
    </branch>
  </parallel>

  <transform id="dashboard" type="template" input="pipelines">
    <template>
      Dashboard Report ({{now()}})
      High-value sales: {{length(input[0])}}
      Active users: {{length(input[1])}}
    </template>
  </transform>

  <sink id="save-dashboard" type="file" input="dashboard">
    <path>./output/dashboard.txt</path>
  </sink>
</workflow>
```

---

## 8. Human-in-the-Loop

### 8.1 Checkpoint with Approval Prompt

Pause workflow execution for human review.

**Features exercised:** Checkpoint runtime, TTY interactive prompt (`[A]pprove / [R]eject`), non-TTY default action, workflow pauses at checkpoint node

```
---
name: checkpoint-approval
version: 1.0.0
description: Process data then wait for human approval before saving
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="data" type="file">
    <path>./data/content.json</path>
    <format>json</format>
  </source>

  <transform id="process" type="ai" input="data">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <user>Summarize: {{json_encode(input)}}</user>
  </transform>

  <checkpoint id="human-review" prompt="Review the AI summary before publishing. Approve to continue." input="process" />

  <sink id="publish" type="file" input="process">
    <path>./output/approved-summary.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 8.2 Checkpoint with Timeout and Default Action

Auto-approve after timeout if no human responds.

**Features exercised:** Checkpoint `timeout` attribute, `default` action attribute, auto-resolution with `timedOut: true` in result

```
---
name: checkpoint-timeout
version: 1.0.0
description: Checkpoint that auto-approves after 1 hour
---
<workflow>
  <source id="report" type="file">
    <path>./data/report.json</path>
    <format>json</format>
  </source>

  <checkpoint id="timed-review" prompt="Review the report. Will auto-approve in 1 hour." timeout="3600000" default="approve" input="report" />

  <sink id="archive" type="file" input="report">
    <path>./output/archived-report.json</path>
    <format>json</format>
  </sink>
</workflow>
```

---

## 9. Error Handling & Resilience

### 9.1 Retry with Exponential Backoff

Retries are configured programmatically via `ExecutionOptions.defaultRetryConfig`. This is set when calling `execute()` from code, not from the `.flow.md` file itself.

**Features exercised:** `executeWithRetry()` wrapper, `isRetryableError()` classification, exponential backoff with full jitter (capped at 32s), HTTP 429/5xx auto-retry, AI rate limit/timeout retry

```typescript
// Usage from code (not .flow.md syntax):
import { execute } from './src/execution';
import { buildExecutionPlan } from './src/scheduler';

const plan = buildExecutionPlan(ast);
const state = createExecutionState({ workflowId: 'my-workflow' });

await execute(plan, state, {
  defaultRetryConfig: {
    maxRetries: 3,
    backoffBase: 1000,   // 1s base, exponential: 1s, 2s, 4s...
    timeout: 30000,      // 30s per attempt
  }
});
```

Workflow that benefits from retry (HTTP sources that may rate-limit):

```
---
name: retryable-http
version: 1.0.0
description: Fetch from APIs that may rate-limit (retry handled by executor)
secrets:
  - API_KEY
---
<workflow>
  <source id="fetch" type="http">
    <request>
      method: GET
      url: https://api.example.com/data
      headers:
        Authorization: Bearer {{$secrets.API_KEY}}
    </request>
  </source>

  <sink id="save" type="file" input="fetch">
    <path>./output/data.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 9.2 Retry with Fallback Node

When all retries are exhausted, execute an alternative node.

**Features exercised:** `fallbackNodeId` in retry config, `$primaryError` and `$primaryInput` injected into fallback context

```typescript
// Usage from code:
await execute(plan, state, {
  defaultRetryConfig: {
    maxRetries: 2,
    backoffBase: 500,
    timeout: 10000,
    fallbackNodeId: 'use-cache'  // must be a node ID in the workflow
  }
});
```

Workflow with a fallback source node:

```
---
name: fetch-with-fallback
version: 1.0.0
description: Fetch from API with local cache fallback
---
<workflow>
  <source id="fetch-live" type="http">
    <request>
      method: GET
      url: https://api.example.com/data
    </request>
  </source>

  <source id="use-cache" type="file">
    <path>./cache/data.json</path>
    <format>json</format>
  </source>

  <sink id="save" type="file" input="fetch-live">
    <path>./output/result.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 9.3 Global Error Handler

A callback invoked when the workflow fails.

**Features exercised:** `errorHandler` callback in `ExecutionOptions`, state persisted on failure, original error preserved and re-thrown

```typescript
// Usage from code:
await execute(plan, state, {
  errorHandler: async (error, failedState) => {
    console.error(`Workflow ${failedState.workflowId} failed at wave ${failedState.currentWave}`);
    console.error(`Error: ${error.message}`);
    // Send alert, write to monitoring, etc.
  }
});
```

---

## 10. State & Persistence

### 10.1 Workflow with Persistence Path

Save execution state after each wave for crash recovery.

**Features exercised:** `persistencePath` in execution options, state saved as JSON after each wave, `toPersistedState()` Map-to-array conversion, automatic directory creation

```typescript
// Usage from code:
await execute(plan, state, {
  persistencePath: './.maidit-state'
});
// State saved to: .maidit-state/{workflowId}/{runId}.json
```

Any workflow can use persistence; it is an execution option not a file-level feature:

```
---
name: persistent-pipeline
version: 1.0.0
description: Data pipeline with state persistence for crash recovery
---
<workflow>
  <source id="fetch" type="http">
    <request>
      method: GET
      url: https://api.example.com/large-dataset
    </request>
  </source>

  <transform id="process" type="map" input="fetch">
    <expression>merge($item, { processed: true })</expression>
  </transform>

  <sink id="save" type="file" input="process">
    <path>./output/dataset.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 10.2 Resume from Checkpoint

Resume a failed or cancelled workflow from where it left off.

**Features exercised:** `canResume()` check, `loadState()` with Map restoration, `resumeWorkflow()` wave filtering (`waveNumber > state.currentWave`), config/secrets override on resume

```typescript
// Usage from code:
import { canResume, resumeWorkflow } from './src/execution/resume';
import { parseFile } from './src/parser';

const statePath = '.maidit-state/my-workflow/run-abc.json';

if (await canResume(statePath)) {
  const result = await parseFile('./workflow.flow.md');
  if (result.success) {
    const finalState = await resumeWorkflow(
      result.data,       // original AST
      statePath,         // persisted state path
      {
        config: { api_url: 'https://new-api.example.com' },  // override
        secrets: { API_KEY: process.env.API_KEY },            // override
      }
    );
    console.log('Resumed workflow status:', finalState.status);
  }
}
```

---

## 11. Complex Compositions

### 11.1 Multi-Source Merge (Parallel Sources -> Transforms -> Sink)

Gather data from multiple APIs concurrently, combine into a single report.

**Features exercised:** Parallel branches, HTTP sources, filter transforms inside branches, template transform merging results, `length()` and `json_encode()` functions, `input[N]` array access

```
---
name: multi-source-dashboard
version: 1.0.0
description: Fetch from multiple APIs in parallel and create a dashboard report
---
<workflow>
  <parallel id="gather">
    <branch>
      <source id="users-api" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/users
        </request>
      </source>
      <transform id="active-users" type="filter" input="users-api">
        <condition>$item.id <= 5</condition>
      </transform>
    </branch>

    <branch>
      <source id="posts-api" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts
        </request>
      </source>
      <transform id="recent-posts" type="filter" input="posts-api">
        <condition>$item.id <= 10</condition>
      </transform>
    </branch>

    <branch>
      <source id="todos-api" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/todos
        </request>
      </source>
      <transform id="pending-todos" type="filter" input="todos-api">
        <condition>$item.completed == false</condition>
      </transform>
    </branch>
  </parallel>

  <transform id="report" type="template" input="gather">
    <template>
      Dashboard Report - {{now()}}
      ===========================
      Active Users: {{length(input[0])}}
      Recent Posts: {{length(input[1])}}
      Pending Todos: {{length(input[2])}}
    </template>
  </transform>

  <sink id="save-report" type="file" input="report">
    <path>./output/dashboard-{{date("yyyy-MM-dd")}}.txt</path>
  </sink>
</workflow>
```

### 11.2 ETL Pipeline (Extract -> Filter -> Enrich -> Load)

Classic extract-transform-load pattern with multiple transform stages.

**Features exercised:** 4-wave execution plan, file source/sink, filter + map transforms, ternary expressions, `merge()`, `upper()`, `now()` functions, `$item` iteration variables, `$config` access

```
---
name: etl-pipeline
version: 1.0.0
description: Extract data, filter high-quality items, enrich with metadata, load to output
config:
  min_score:
    type: number
    default: 60
    description: Minimum score threshold
  output_path:
    type: string
    default: "./output/enriched.json"
---
<workflow>
  <source id="extract" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <transform id="filter-quality" type="filter" input="extract">
    <condition>$item.score >= $config.min_score</condition>
  </transform>

  <transform id="enrich" type="map" input="filter-quality">
    <expression>merge($item, { grade: $item.score >= 90 ? "A" : $item.score >= 80 ? "B" : $item.score >= 70 ? "C" : "D", processed_by: "etl-pipeline", processed_at: now(), name_upper: upper($item.name) })</expression>
  </transform>

  <sink id="load" type="file" input="enrich">
    <path>{{$config.output_path}}</path>
    <format>json</format>
  </sink>
</workflow>
```

### 11.3 AI-Powered Content Pipeline (Source -> AI Analyze -> Branch on Score -> Multiple Sinks)

Fetch content, analyze with AI, route to different outputs based on quality score.

**Features exercised:** HTTP source, AI with structured output, branch with condition evaluation, multiple sinks, template expressions, `$secrets` access, `$config` access, cross-node output references

```
---
name: ai-content-pipeline
version: 1.0.0
description: Fetch articles, AI-analyze quality, route high/low quality to different outputs
secrets:
  - OPENROUTER_API_KEY
  - CONTENT_API_KEY
config:
  quality_threshold:
    type: number
    default: 7
---
<workflow>
  <source id="fetch-article" type="http">
    <request>
      method: GET
      url: https://api.example.com/articles/latest
      headers:
        Authorization: Bearer {{$secrets.CONTENT_API_KEY}}
    </request>
  </source>

  <transform id="analyze" type="ai" input="fetch-article">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <system>You are a content quality assessor. Be strict but fair.</system>
    <user>Assess the quality of this article: {{json_encode(input)}}. Score 1-10.</user>
    <output-schema>{score: number, summary: string, strengths: string[], weaknesses: string[]}</output-schema>
  </transform>

  <branch id="quality-route" input="analyze">
    <case when="analyze.output.score >= $config.quality_threshold">
      <transform id="format-featured" type="template" input="analyze">
        <template>FEATURED: {{analyze.output.summary}} (Score: {{analyze.output.score}})</template>
      </transform>
      <sink id="save-featured" type="file" input="format-featured">
        <path>./output/featured/article-{{date("yyyy-MM-dd")}}.txt</path>
      </sink>
    </case>

    <default>
      <transform id="format-review" type="template" input="analyze">
        <template>NEEDS REVIEW (Score: {{analyze.output.score}}): {{json_encode(analyze.output.weaknesses)}}</template>
      </transform>
      <sink id="save-review" type="file" input="format-review">
        <path>./output/review/article-{{date("yyyy-MM-dd")}}.txt</path>
      </sink>
    </default>
  </branch>
</workflow>
```

### 11.4 Iterative Refinement Loop (AI Improve -> AI Evaluate -> Break When Good)

An AI self-improvement loop that continues until quality is sufficient.

**Features exercised:** Loop with `max` + `break`, multiple AI transforms per iteration, structured output for scoring, break condition referencing nested node output, file source/sink

**Note: This pushes the boundary of current implementation.** The `break` condition references `evaluate.output.score` which is a node inside the loop body. Whether this resolves correctly depends on how the executor exposes loop-body node outputs to the break condition evaluator.

```
---
name: iterative-refinement
version: 1.0.0
description: AI writes, AI critiques, loop until quality >= 8 or 5 iterations
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="topic" type="file">
    <path>./data/topic.json</path>
    <format>json</format>
  </source>

  <transform id="first-draft" type="ai" input="topic">
    <model>anthropic/claude-sonnet-4-20250514</model>
    <user>Write a detailed article about: {{json_encode(input)}}</user>
  </transform>

  <loop id="improve-loop" max="5" break="evaluate.output.score >= 8" input="first-draft">
    <transform id="evaluate" type="ai" input="first-draft">
      <model>anthropic/claude-sonnet-4-20250514</model>
      <user>Rate this article 1-10 and give specific feedback: {{json_encode(input)}}</user>
      <output-schema>{score: number, feedback: string, specific_fixes: string[]}</output-schema>
    </transform>

    <transform id="revise" type="ai" input="first-draft">
      <model>anthropic/claude-sonnet-4-20250514</model>
      <user>Revise this article based on feedback. Original: {{json_encode(input)}}. Feedback: {{evaluate.output.feedback}}. Fixes needed: {{json_encode(evaluate.output.specific_fixes)}}</user>
    </transform>
  </loop>

  <sink id="save-final" type="file" input="improve-loop">
    <path>./output/final-article.json</path>
    <format>json</format>
  </sink>
</workflow>
```

### 11.5 Full Content Processing Pipeline

The most complex supported workflow: fetch, filter, AI-analyze in parallel, checkpoint, save.

**Features exercised:** Nearly every engine feature: HTTP source, filter transform, foreach with concurrency, AI structured output, filter on AI scores, checkpoint with timeout/default, file sink with template path, `$config`/`$secrets` access, `date()` function, multiple expression functions

```
---
name: content-processing-pipeline
version: 1.0.0
description: Full pipeline - fetch content, filter, analyze with AI, approve, publish
secrets:
  - OPENROUTER_API_KEY
  - CONTENT_API_KEY
config:
  model:
    type: string
    default: "anthropic/claude-sonnet-4-20250514"
  min_relevance:
    type: number
    default: 6
  output_dir:
    type: string
    default: "./output/published"
---
<workflow>
  <!-- Phase 1: Fetch content -->
  <source id="fetch-content" type="http">
    <request>
      method: GET
      url: https://api.example.com/content/feed
      headers:
        Authorization: Bearer {{$secrets.CONTENT_API_KEY}}
    </request>
  </source>

  <!-- Phase 2: Filter to new items only -->
  <transform id="filter-new" type="filter" input="fetch-content">
    <condition>$item.status == "new"</condition>
  </transform>

  <!-- Phase 3: AI-analyze each item (3 concurrent) -->
  <foreach id="analyze-batch" collection="filter-new.output" item="article" concurrency="3" input="filter-new">
    <transform id="ai-analyze" type="ai">
      <model>{{$config.model}}</model>
      <system>You are a content analyst. Assess relevance and quality.</system>
      <user>Analyze this content item: {{json_encode(article)}}</user>
      <output-schema>{relevance: number, quality: number, summary: string, category: string}</output-schema>
    </transform>
  </foreach>

  <!-- Phase 4: Filter to high-relevance items -->
  <transform id="filter-relevant" type="filter" input="analyze-batch">
    <condition>$item.relevance >= $config.min_relevance</condition>
  </transform>

  <!-- Phase 5: Human approval -->
  <checkpoint id="editorial-review" prompt="Review filtered content before publishing. Auto-approves in 1 hour." timeout="3600000" default="approve" input="filter-relevant" />

  <!-- Phase 6: Save results -->
  <sink id="publish" type="file" input="filter-relevant">
    <path>{{$config.output_dir}}/batch-{{date("yyyy-MM-dd-HH-mm")}}.json</path>
    <format>json</format>
  </sink>
</workflow>
```

---

## Appendix: Feature Coverage Matrix

| Feature | Section(s) Demonstrated |
|---------|------------------------|
| YAML frontmatter (name, version) | All workflows |
| Config with defaults | 1.3, 4.3, 11.2, 11.3, 11.5 |
| Secrets from env | 3.1, 3.3, 4.x, 5.2, 11.3, 11.5 |
| Trigger config | 1.1, 1.2, 1.3 |
| HTTP source (GET) | 1.1, 3.1, 7.1, 11.1 |
| HTTP source (POST) | 3.2 |
| HTTP sink (POST) | 3.2, 3.3 |
| HTTP auth headers | 3.1, 3.3 |
| JMESPath extraction | 3.1 |
| File source (json) | 1.2, 1.4, 2.x, 4.x, 6.x |
| File sink (json/text) | 1.2, 2.x, 7.x, 11.x |
| Template file paths | 4.4, 11.1, 11.5 |
| Map transform | 1.3, 2.1, 2.3, 6.4, 11.2 |
| Filter transform | 1.4, 2.1, 7.2, 11.1, 11.2, 11.5 |
| Template transform | 2.2, 5.1, 7.1, 7.2, 11.1, 11.3 |
| AI transform (basic) | 4.1, 4.3, 6.1, 8.1 |
| AI structured output | 4.2, 4.4, 6.3, 11.3, 11.4, 11.5 |
| AI system prompt | 4.2, 4.3, 11.3, 11.5 |
| If/then/else | 5.1 |
| Branch/case/default | 5.2, 11.3 |
| Loop (max) | 6.1 |
| Loop (break) | 6.3, 11.4 |
| While loop | 6.2 |
| Foreach (sequential) | 6.4 |
| Foreach (concurrent) | 6.5, 11.5 |
| Parallel branches | 7.1, 7.2, 11.1 |
| Checkpoint | 8.1, 8.2, 11.5 |
| Checkpoint timeout | 8.2, 11.5 |
| Retry/backoff | 9.1 (programmatic) |
| Fallback node | 9.2 (programmatic) |
| Error handler | 9.3 (programmatic) |
| State persistence | 10.1 (programmatic) |
| Resume | 10.2 (programmatic) |
| Expression functions | All transform workflows |
| Wave scheduling | All multi-node workflows |
| Concurrent wave execution | 7.x, 11.1 |
