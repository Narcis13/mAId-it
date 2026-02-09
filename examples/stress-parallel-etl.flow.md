---
# ═══════════════════════════════════════════════════════════════
# STRESS TEST 1: Multi-Source Parallel ETL Pipeline
# ═══════════════════════════════════════════════════════════════
# Tests: parallel branches with wait/merge strategies, foreach
# with concurrency, nested loops with AI break conditions,
# map/filter transform chains, template expressions, file I/O,
# timeout wrappers, error handling with retry+fallback
# ═══════════════════════════════════════════════════════════════
name: stress-parallel-etl
version: 1.0.0
description: >
  Multi-source parallel ETL: fetches from 3 APIs concurrently,
  merges results, iterates each item through AI scoring loop,
  filters by threshold, aggregates, and persists.

trigger:
  manual: true

config:
  score_threshold:
    type: number
    default: 7
    description: Minimum AI score to keep an item
  output_dir:
    type: string
    default: "./output/stress-1"
  max_ai_retries:
    type: number
    default: 3

secrets:
  - OPENROUTER_API_KEY

runtime:
  timeout: 10m
---

<workflow>

  <!-- ============================================================ -->
  <!-- PHASE 1: Parallel data ingestion from 3 independent APIs     -->
  <!-- Tests: parallel node with 3 branches, wait="all", merge="concat" -->
  <!-- ============================================================ -->
  <parallel id="ingest" wait="all" merge="concat">
    <branch>
      <!-- Branch A: Fetch users from JSONPlaceholder -->
      <source id="fetch-users" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/users
        </request>
      </source>
      <transform id="tag-users" type="map" input="fetch-users">
        <expression>item => ({ ...item, _source: "users", _type: "person", score: 0 })</expression>
      </transform>
    </branch>

    <branch>
      <!-- Branch B: Fetch posts -->
      <source id="fetch-posts" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts
        </request>
      </source>
      <!-- Only take first 10 posts to keep things manageable -->
      <transform id="limit-posts" type="filter" input="fetch-posts">
        <condition>index &lt; 10</condition>
      </transform>
      <transform id="tag-posts" type="map" input="limit-posts">
        <expression>item => ({ id: item.id, name: item.title, _source: "posts", _type: "content", score: 0 })</expression>
      </transform>
    </branch>

    <branch>
      <!-- Branch C: Fetch todos -->
      <source id="fetch-todos" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/todos
        </request>
      </source>
      <transform id="filter-incomplete" type="filter" input="fetch-todos">
        <condition>item.completed === false</condition>
      </transform>
      <transform id="limit-todos" type="filter" input="filter-incomplete">
        <condition>index &lt; 5</condition>
      </transform>
      <transform id="tag-todos" type="map" input="limit-todos">
        <expression>item => ({ id: item.id, name: item.title, _source: "todos", _type: "task", score: 0 })</expression>
      </transform>
    </branch>
  </parallel>

  <!-- ============================================================ -->
  <!-- PHASE 2: Process each item through AI scoring loop           -->
  <!-- Tests: foreach with concurrency=2, nested loop with AI,     -->
  <!--        break condition on score threshold, template chains   -->
  <!-- ============================================================ -->
  <foreach id="score-items" collection="ingest" item="record" concurrency="2" input="ingest">

    <!-- AI scoring loop: ask AI to score, retry if score is ambiguous -->
    <loop id="ai-score-loop" max="3" break="ai-evaluate.output.confidence > 0.8" input="ingest">

      <transform id="ai-evaluate" type="ai" input="ingest">
        <model>openai/gpt-4o-mini</model>
        <system>You are a data quality evaluator. Score items on relevance and completeness from 1-10. Be decisive.</system>
        <user>Evaluate this record for data quality. Record: {{json_encode(record)}}. Source: {{record._source}}. Type: {{record._type}}. Give a score 1-10 and confidence 0-1.</user>
        <output-schema>{score: number, confidence: number, reasoning: string}</output-schema>
      </transform>

    </loop>

    <!-- Stamp the AI score onto the record -->
    <transform id="stamp-score" type="template" input="ai-score-loop">
      <template>{"id": {{record.id}}, "name": "{{record.name}}", "source": "{{record._source}}", "type": "{{record._type}}", "ai_score": {{ai-evaluate.output.score}}, "confidence": {{ai-evaluate.output.confidence}}, "reasoning": "{{ai-evaluate.output.reasoning}}"}</template>
    </transform>

  </foreach>

  <!-- ============================================================ -->
  <!-- PHASE 3: Filter by score threshold + aggregate               -->
  <!-- Tests: filter with config reference, template with math      -->
  <!-- ============================================================ -->
  <transform id="parse-scored" type="map" input="score-items">
    <expression>item => (typeof item === 'string' ? JSON.parse(item) : item)</expression>
  </transform>

  <transform id="filter-high-quality" type="filter" input="parse-scored">
    <condition>item.ai_score >= $config.score_threshold</condition>
  </transform>

  <transform id="build-report" type="template" input="filter-high-quality">
    <template>{"total_ingested": {{length(ingest)}}, "total_scored": {{length(score-items)}}, "passed_threshold": {{length(filter-high-quality)}}, "threshold": {{$config.score_threshold}}, "items": {{json_encode(input)}}, "generated_at": "{{now()}}"}</template>
  </transform>

  <!-- ============================================================ -->
  <!-- PHASE 4: Persist results                                     -->
  <!-- Tests: multiple file sinks, template paths with config refs  -->
  <!-- ============================================================ -->
  <sink id="save-report" type="file" input="build-report">
    <path>{{$config.output_dir}}/quality-report.json</path>
    <format>json</format>
  </sink>

  <sink id="save-raw" type="file" input="score-items">
    <path>{{$config.output_dir}}/all-scored-items.json</path>
    <format>json</format>
  </sink>

</workflow>
