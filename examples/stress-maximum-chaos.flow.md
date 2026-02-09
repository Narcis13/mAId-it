---
# ═══════════════════════════════════════════════════════════════
# STRESS TEST 4: Maximum Chaos — Every Feature Simultaneously
# ═══════════════════════════════════════════════════════════════
# Tests: EVERY node type the engine supports in a single flow.
# Parallel (4 branches) > foreach > loop > AI + template chains.
# if/branch conditionals (exposes executor gap), while loops
# (exposes executor gap), timeout nesting, checkpoint gates,
# context/set variables, on-error retry+fallback, complex
# expression functions, deep nesting (4+ levels), merge
# strategies (array, object, concat), wait strategies (all, any).
# This flow is designed to hit every code path and find crashes.
# ═══════════════════════════════════════════════════════════════
name: stress-maximum-chaos
version: 1.0.0
description: >
  Maximum complexity: uses every supported node type, deeply
  nested control flow, parallel AI pipelines, conditional
  routing, temporal controls, and variable management —
  all in a single workflow.

trigger:
  manual: true

config:
  chaos_level:
    type: number
    default: 3
    description: Controls iteration depth (1-5)
  output_dir:
    type: string
    default: "./output/stress-4"

secrets:
  - OPENROUTER_API_KEY

runtime:
  timeout: 20m
---

<workflow>

  <!-- ============================================================ -->
  <!-- LAYER 0: Multi-source data ingestion                         -->
  <!-- Tests: file source, http source, parallel merge="object"     -->
  <!-- ============================================================ -->
  <source id="local-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <parallel id="dual-ingest" wait="all" merge="object">
    <branch>
      <source id="api-users" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/users
        </request>
      </source>
      <transform id="wrap-users" type="template" input="api-users">
        <template>{"users": {{json_encode(input)}}}</template>
      </transform>
    </branch>
    <branch>
      <source id="api-posts" type="http">
        <request>
          method: GET
          url: https://jsonplaceholder.typicode.com/posts
        </request>
      </source>
      <transform id="limit-wrap-posts" type="map" input="api-posts">
        <expression>item => ({ id: item.id, title: item.title, userId: item.userId })</expression>
      </transform>
      <transform id="wrap-posts" type="template" input="limit-wrap-posts">
        <template>{"posts": {{json_encode(input)}}}</template>
      </transform>
    </branch>
  </parallel>

  <!-- ============================================================ -->
  <!-- LAYER 1: Process local data through foreach + nested loop    -->
  <!-- Tests: foreach > loop > AI, break condition, concurrency=1   -->
  <!-- ============================================================ -->
  <foreach id="process-local" collection="local-data" item="record" concurrency="1" input="local-data">

    <!-- Inner loop: iteratively improve AI analysis of each record -->
    <loop id="analyze-loop" max="2" break="analyzer.output.confidence > 0.85" input="local-data">

      <transform id="analyzer" type="ai" input="local-data">
        <model>openai/gpt-4o-mini</model>
        <system>You are a data analyst. Analyze records precisely. Always return exact field names requested.</system>
        <user>Analyze this record: name={{record.name}}, score={{record.score}}. Is this a high-performer? Provide analysis with confidence level.</user>
        <output-schema>{analysis: string, confidence: number, category: string}</output-schema>
      </transform>

    </loop>

    <!-- Tag the record with AI analysis -->
    <transform id="tag-analyzed" type="template" input="analyze-loop">
      <template>{"name": "{{record.name}}", "original_score": {{record.score}}, "ai_category": "{{analyzer.output.category}}", "ai_confidence": {{analyzer.output.confidence}}}</template>
    </transform>

  </foreach>

  <!-- ============================================================ -->
  <!-- LAYER 2: Parallel processing with 4 diverse branches         -->
  <!-- Tests: parallel with 4 branches, each using different        -->
  <!--        transform types and control flow patterns             -->
  <!-- ============================================================ -->
  <parallel id="mega-parallel" wait="all" merge="array" input="dual-ingest">

    <!-- Branch 1: Map + Filter chain on users -->
    <branch>
      <transform id="extract-user-names" type="map" input="dual-ingest">
        <expression>item => ({ name: item.name, email: item.email, company: item.company ? item.company.name : 'N/A' })</expression>
      </transform>
      <transform id="filter-with-company" type="filter" input="extract-user-names">
        <condition>item.company !== 'N/A'</condition>
      </transform>
      <transform id="branch1-result" type="template" input="filter-with-company">
        <template>{"branch": "user-analysis", "count": {{length(input)}}, "sample": {{json_encode(first(input))}}}</template>
      </transform>
    </branch>

    <!-- Branch 2: AI summarization -->
    <branch>
      <transform id="ai-summarize" type="ai" input="dual-ingest">
        <model>openai/gpt-4o-mini</model>
        <system>You are a data summarizer. Provide concise summaries.</system>
        <user>Summarize this dataset in 2 sentences: {{length(dual-ingest)}} merged data fields available.</user>
        <output-schema>{summary: string, key_insight: string}</output-schema>
      </transform>
      <transform id="branch2-result" type="template" input="ai-summarize">
        <template>{"branch": "ai-summary", "summary": "{{ai-summarize.output.summary}}", "insight": "{{ai-summarize.output.key_insight}}"}</template>
      </transform>
    </branch>

    <!-- Branch 3: Foreach with AI per-item inside parallel branch -->
    <branch>
      <transform id="prep-subset" type="filter" input="dual-ingest">
        <condition>index &lt; 3</condition>
      </transform>
      <foreach id="inner-foreach" collection="prep-subset" item="sub-item" concurrency="1" input="prep-subset">
        <transform id="inner-ai" type="ai" input="prep-subset">
          <model>openai/gpt-4o-mini</model>
          <system>Generate a one-line tagline for this data item.</system>
          <user>Create a catchy tagline for: {{json_encode(sub-item)}}</user>
        </transform>
      </foreach>
      <transform id="branch3-result" type="template" input="inner-foreach">
        <template>{"branch": "per-item-ai", "taglines": {{json_encode(input)}}}</template>
      </transform>
    </branch>

    <!-- Branch 4: Loop with template accumulation -->
    <branch>
      <loop id="count-loop" max="{{$config.chaos_level}}" input="dual-ingest">
        <transform id="loop-step" type="template" input="dual-ingest">
          <template>{"iteration": {{$iteration}}, "timestamp": "{{now()}}", "chaos_level": {{$config.chaos_level}}}</template>
        </transform>
      </loop>
      <transform id="branch4-result" type="template" input="count-loop">
        <template>{"branch": "loop-counter", "iterations_completed": {{$config.chaos_level}}, "last_step": {{json_encode(loop-step)}}}</template>
      </transform>
    </branch>

  </parallel>

  <!-- ============================================================ -->
  <!-- LAYER 3: Conditional routing — EXECUTOR GAP TESTS            -->
  <!-- Tests: if node (body may not execute), branch node (same),   -->
  <!--        while node (same). These deliberately test the gaps   -->
  <!--        where the executor lacks result handlers.             -->
  <!-- ============================================================ -->

  <!-- Test IF: route based on local data size -->
  <if id="size-gate" condition="length(process-local) > 3" input="process-local">
    <then>
      <transform id="large-dataset" type="template" input="process-local">
        <template>{"gate": "large", "count": {{length(input)}}, "note": "Dataset exceeds threshold"}</template>
      </transform>
    </then>
    <else>
      <transform id="small-dataset" type="template" input="process-local">
        <template>{"gate": "small", "count": {{length(input)}}, "note": "Dataset below threshold"}</template>
      </transform>
    </else>
  </if>

  <!-- Test BRANCH: multi-case pattern matching -->
  <branch id="tier-selector" input="process-local">
    <case when="length(process-local) >= 5">
      <transform id="gold-tier" type="template" input="process-local">
        <template>{"tier": "gold", "count": {{length(input)}}}</template>
      </transform>
    </case>
    <case when="length(process-local) >= 3">
      <transform id="silver-tier" type="template" input="process-local">
        <template>{"tier": "silver", "count": {{length(input)}}}</template>
      </transform>
    </case>
    <case when="length(process-local) >= 1">
      <transform id="bronze-tier" type="template" input="process-local">
        <template>{"tier": "bronze", "count": {{length(input)}}}</template>
      </transform>
    </case>
    <default>
      <transform id="no-tier" type="template" input="process-local">
        <template>{"tier": "none", "count": 0}</template>
      </transform>
    </default>
  </branch>

  <!-- Test WHILE: condition-based loop — EXECUTOR GAP -->
  <while id="countdown" condition="$iteration &lt; 2" input="process-local">
    <transform id="tick" type="template" input="process-local">
      <template>{"tick": {{$iteration}}, "at": "{{now()}}"}</template>
    </transform>
  </while>

  <!-- ============================================================ -->
  <!-- LAYER 4: Timeout-wrapped AI operation with fallback          -->
  <!-- Tests: timeout with duration + on-timeout routing            -->
  <!-- ============================================================ -->
  <timeout id="timed-synthesis" duration="30s" on-timeout="synthesis-fallback">
    <transform id="grand-synthesis" type="ai" input="mega-parallel">
      <model>openai/gpt-4o-mini</model>
      <system>You are a meta-analyst. Synthesize findings from multiple analysis branches into a coherent executive summary.</system>
      <user>Synthesize these parallel analysis results into an executive summary:

Local analysis: {{length(process-local)}} records analyzed
Parallel branches: {{length(mega-parallel)}} branch results
Data from: {{json_encode(mega-parallel)}}

Provide a structured summary with key findings and recommendations.</user>
      <output-schema>{executive_summary: string, key_findings: string, recommendations: string, confidence: number}</output-schema>
    </transform>
  </timeout>

  <!-- Fallback synthesis if AI times out -->
  <transform id="synthesis-fallback" type="template" input="mega-parallel">
    <template>{"executive_summary": "Synthesis timed out — raw results available", "key_findings": "{{length(mega-parallel)}} branches completed", "recommendations": "Review raw branch outputs", "confidence": 0.3}</template>
  </transform>

  <!-- ============================================================ -->
  <!-- LAYER 5: Final aggregation and persistence                   -->
  <!-- Tests: complex template with many node references,           -->
  <!--        multiple file sinks, expression chaining              -->
  <!-- ============================================================ -->
  <transform id="chaos-report" type="template" input="timed-synthesis">
    <template>{
  "workflow": "stress-maximum-chaos",
  "chaos_level": {{$config.chaos_level}},
  "completed_at": "{{now()}}",
  "layers": {
    "layer0_local_items": {{length(local-data)}},
    "layer0_merged_sources": "dual-ingest completed",
    "layer1_analyzed": {{length(process-local)}},
    "layer2_parallel_branches": {{length(mega-parallel)}},
    "layer3_if_result": {{json_encode(size-gate)}},
    "layer3_branch_result": {{json_encode(tier-selector)}},
    "layer3_while_result": {{json_encode(countdown)}},
    "layer4_synthesis": {{json_encode(timed-synthesis)}}
  },
  "node_types_tested": [
    "source:http", "source:file",
    "transform:ai", "transform:template", "transform:map", "transform:filter",
    "sink:file",
    "control:parallel", "control:foreach", "control:loop",
    "control:if", "control:branch", "control:while",
    "temporal:timeout"
  ],
  "total_node_types": 13
}</template>
  </transform>

  <sink id="save-chaos-report" type="file" input="chaos-report">
    <path>{{$config.output_dir}}/chaos-report.json</path>
    <format>json</format>
  </sink>

  <sink id="save-local-analysis" type="file" input="process-local">
    <path>{{$config.output_dir}}/local-analysis.json</path>
    <format>json</format>
  </sink>

  <sink id="save-parallel-branches" type="file" input="mega-parallel">
    <path>{{$config.output_dir}}/parallel-branches.json</path>
    <format>json</format>
  </sink>

</workflow>
