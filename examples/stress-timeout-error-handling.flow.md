---
# ═══════════════════════════════════════════════════════════════
# STRESS TEST 3: Timeout, Error Handling & Resilience Patterns
# ═══════════════════════════════════════════════════════════════
# Tests: timeout wrappers with fallback routing, on-error retry
# with exponential backoff, on-error fallback nodes, parallel
# with wait="any" (race) and wait="n(2)" strategies, loop with
# error-prone operations, template chains, nested timeouts,
# complex expression functions (string, math, array, time)
# ═══════════════════════════════════════════════════════════════
name: stress-timeout-error-handling
version: 1.0.0
description: >
  Resilience stress test: wraps unreliable operations in timeouts,
  uses retry+fallback patterns, races parallel branches, and
  chains error recovery through nested control flow.

trigger:
  manual: true

config:
  api_timeout_ms:
    type: number
    default: 5000
  output_dir:
    type: string
    default: "./output/stress-3"

secrets:
  - OPENROUTER_API_KEY

runtime:
  timeout: 8m
---

<workflow>

  <!-- ============================================================ -->
  <!-- PHASE 1: Timeout-wrapped HTTP ingestion with fallback        -->
  <!-- Tests: timeout node, on-timeout fallback, nested source      -->
  <!-- ============================================================ -->
  <timeout id="safe-fetch" duration="10s" on-timeout="fallback-data">
    <source id="primary-api" type="http">
      <request>
        method: GET
        url: https://jsonplaceholder.typicode.com/users
      </request>
    </source>
  </timeout>

  <!-- Fallback data if timeout fires -->
  <source id="fallback-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <!-- ============================================================ -->
  <!-- PHASE 2: Parallel race — first API to respond wins           -->
  <!-- Tests: parallel wait="any", racing 3 endpoints               -->
  <!-- ============================================================ -->
  <parallel id="api-race" wait="any" merge="array">
    <branch>
      <source id="race-api-1" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts/1
        </request>
      </source>
    </branch>
    <branch>
      <source id="race-api-2" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts/2
        </request>
      </source>
    </branch>
    <branch>
      <source id="race-api-3" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts/3
        </request>
      </source>
    </branch>
  </parallel>

  <!-- ============================================================ -->
  <!-- PHASE 3: Parallel with n(2) — first 2 of 4 to complete      -->
  <!-- Tests: parallel wait="n(2)", partial completion strategy     -->
  <!-- ============================================================ -->
  <parallel id="partial-complete" wait="n(2)" merge="array">
    <branch>
      <source id="batch-a" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/comments/1
        </request>
      </source>
    </branch>
    <branch>
      <source id="batch-b" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/comments/2
        </request>
      </source>
    </branch>
    <branch>
      <source id="batch-c" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/comments/3
        </request>
      </source>
    </branch>
    <branch>
      <source id="batch-d" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/comments/4
        </request>
      </source>
    </branch>
  </parallel>

  <!-- ============================================================ -->
  <!-- PHASE 4: Error-prone loop with retry and fallback            -->
  <!-- Tests: loop with on-error retry+fallback, AI with schema     -->
  <!--        validation that may fail, exponential backoff          -->
  <!-- ============================================================ -->
  <loop id="resilient-scoring" max="3" break="scorer.output.confidence > 0.9" input="safe-fetch">

    <transform id="scorer" type="ai" input="safe-fetch">
      <model>openai/gpt-4o-mini</model>
      <system>Score this data batch for completeness. Be precise with numbers.</system>
      <user>Evaluate data quality of: {{json_encode(safe-fetch)}}. First item: {{json_encode(safe-fetch[0])}}.</user>
      <output-schema>{score: number, confidence: number, issues: string}</output-schema>
      <on-error>
        <retry when="retryable" max="2" backoff="exponential" />
        <fallback node="fallback-score" />
      </on-error>
    </transform>

  </loop>

  <!-- Fallback scorer returns safe default -->
  <transform id="fallback-score" type="template" input="safe-fetch">
    <template>{"score": 5, "confidence": 0.5, "issues": "Fallback: primary scorer failed"}</template>
  </transform>

  <!-- ============================================================ -->
  <!-- PHASE 5: Complex expression stress test                      -->
  <!-- Tests: 15+ built-in functions across categories, nested      -->
  <!--        expression evaluation, ternary operators, null        -->
  <!--        coalescing, array/string/math/time functions          -->
  <!-- ============================================================ -->
  <transform id="expression-gauntlet" type="template" input="safe-fetch">
    <template>{
  "string_ops": {
    "upper": "{{upper('hello world')}}",
    "trim_pad": "{{pad_start(trim('  test  '), 10, '0')}}",
    "replace": "{{replace('foo-bar-baz', '-', '_')}}",
    "split_join": "{{join(split('a,b,c,d', ','), ' | ')}}",
    "substr": "{{substring('FlowScript', 0, 4)}}"
  },
  "math_ops": {
    "sum": {{1 + 2 + 3 + 4 + 5}},
    "abs_neg": {{abs(-42)}},
    "min_max": [{{min(3, 1, 4, 1, 5)}}, {{max(3, 1, 4, 1, 5)}}],
    "round": {{round(3.14159, 2)}},
    "power": {{pow(2, 10)}}
  },
  "array_ops": {
    "length": {{length(safe-fetch)}},
    "first_last": "{{json_encode(first(safe-fetch))}} ... {{json_encode(last(safe-fetch))}}",
    "flat_mapped": "mapped {{length(safe-fetch)}} items"
  },
  "time_ops": {
    "now": "{{now()}}",
    "formatted": "{{format_date(now(), 'yyyy-MM-dd')}}"
  },
  "logic_ops": {
    "ternary": "{{length(safe-fetch) > 5 ? 'large' : 'small'}}",
    "nullish": "{{safe-fetch ?? 'default_value'}}"
  }
}</template>
  </transform>

  <!-- ============================================================ -->
  <!-- PHASE 6: Foreach processing with nested parallel per item    -->
  <!-- Tests: foreach > parallel nesting, template variable scope   -->
  <!-- ============================================================ -->
  <foreach id="enrich-each" collection="safe-fetch" item="person" concurrency="3" input="safe-fetch">

    <parallel id="enrich-parallel" wait="all" merge="object" input="safe-fetch">
      <branch>
        <transform id="compute-label" type="template" input="safe-fetch">
          <template>{"label": "{{upper(person.name ?? 'Unknown')}}"}</template>
        </transform>
      </branch>
      <branch>
        <transform id="compute-meta" type="template" input="safe-fetch">
          <template>{"processed_at": "{{now()}}", "index": {{index}}}</template>
        </transform>
      </branch>
    </parallel>

  </foreach>

  <!-- ============================================================ -->
  <!-- PHASE 7: Aggregate and persist everything                    -->
  <!-- ============================================================ -->
  <transform id="final-report" type="template" input="expression-gauntlet">
    <template>{
  "workflow": "stress-timeout-error-handling",
  "completed_at": "{{now()}}",
  "race_winner": {{json_encode(api-race)}},
  "partial_results": {{json_encode(partial-complete)}},
  "scoring": {{json_encode(resilient-scoring)}},
  "expression_test": {{json_encode(expression-gauntlet)}},
  "enriched_count": {{length(enrich-each)}}
}</template>
  </transform>

  <sink id="save-report" type="file" input="final-report">
    <path>{{$config.output_dir}}/resilience-report.json</path>
    <format>json</format>
  </sink>

  <sink id="save-enriched" type="file" input="enrich-each">
    <path>{{$config.output_dir}}/enriched-data.json</path>
    <format>json</format>
  </sink>

</workflow>
