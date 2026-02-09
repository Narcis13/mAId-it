---
# ═══════════════════════════════════════════════════════════════
# STRESS TEST 2: AI Content Factory with Iterative Refinement
# ═══════════════════════════════════════════════════════════════
# Tests: file source, parallel AI branches with different models,
# loops with AI-driven break conditions, foreach over topics,
# if/branch conditional routing (tests executor gap!), nested
# control flow (parallel > foreach > loop), complex expressions,
# template chaining, multiple output schemas
# ═══════════════════════════════════════════════════════════════
name: stress-ai-content-factory
version: 1.0.0
description: >
  AI content pipeline: reads topic list, generates articles in
  parallel with different models, iteratively refines each until
  quality threshold met, routes based on quality tier, persists
  all outputs with metadata.

trigger:
  manual: true

config:
  quality_threshold:
    type: number
    default: 8
    description: Minimum score (1-10) for content to be published
  max_refinement_rounds:
    type: number
    default: 3
  output_dir:
    type: string
    default: "./output/stress-2"

secrets:
  - OPENROUTER_API_KEY

runtime:
  timeout: 15m
---

<workflow>

  <!-- ============================================================ -->
  <!-- PHASE 1: Load topics and configuration                       -->
  <!-- ============================================================ -->
  <source id="load-topics" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <!-- ============================================================ -->
  <!-- PHASE 2: For each person/record, generate content in parallel -->
  <!-- Tests: foreach with concurrency, parallel inside foreach,    -->
  <!--        multiple AI models competing                          -->
  <!-- ============================================================ -->
  <foreach id="process-topics" collection="load-topics" item="topic" concurrency="1" input="load-topics">

    <!-- Generate content from two models in parallel -->
    <parallel id="multi-model-gen" wait="all" merge="array" input="load-topics">
      <branch>
        <transform id="draft-model-a" type="ai" input="load-topics">
          <model>openai/gpt-4o-mini</model>
          <system>You are a professional content writer. Write engaging, well-structured content.</system>
          <user>Write a detailed 200-word profile about: {{json_encode(topic)}}. Focus on their strengths (score: {{topic.score}}).</user>
        </transform>
      </branch>
      <branch>
        <transform id="draft-model-b" type="ai" input="load-topics">
          <model>openai/gpt-4o-mini</model>
          <system>You are a creative storyteller. Write vivid, narrative-driven content.</system>
          <user>Write a compelling 200-word narrative about: {{json_encode(topic)}}. Make it memorable. Their score is {{topic.score}}.</user>
        </transform>
      </branch>
    </parallel>

    <!-- AI judge picks the better draft -->
    <transform id="judge-drafts" type="ai" input="multi-model-gen">
      <model>openai/gpt-4o-mini</model>
      <system>You are a content quality judge. Compare two drafts and pick the better one. Be decisive.</system>
      <user>Compare these two drafts about {{topic.name}} and pick the better one.

Draft A: {{json_encode(multi-model-gen.output[0])}}

Draft B: {{json_encode(multi-model-gen.output[1])}}

Return the winning draft text and your quality score.</user>
      <output-schema>{winner: string, draft: string, quality_score: number, reasoning: string}</output-schema>
    </transform>

    <!-- Iterative refinement loop until quality threshold met -->
    <loop id="refine-loop" max="{{$config.max_refinement_rounds}}" break="critic.output.score >= $config.quality_threshold" input="judge-drafts">

      <!-- Critic evaluates current draft -->
      <transform id="critic" type="ai" input="judge-drafts">
        <model>openai/gpt-4o-mini</model>
        <system>You are a strict content critic. Evaluate on: clarity, engagement, accuracy, structure. Score 1-10.</system>
        <user>Rate this content about {{topic.name}} (1-10) and provide specific, actionable feedback:

{{judge-drafts.output.draft}}</user>
        <output-schema>{score: number, feedback: string, strengths: string, weaknesses: string}</output-schema>
      </transform>

      <!-- Revise based on feedback -->
      <transform id="revise" type="ai" input="critic">
        <model>openai/gpt-4o-mini</model>
        <system>You are a skilled editor. Improve the content based on specific feedback. Keep the same length (~200 words).</system>
        <user>Revise this content about {{topic.name}} based on the feedback.

Current draft: {{judge-drafts.output.draft}}

Feedback: {{critic.output.feedback}}
Weaknesses to fix: {{critic.output.weaknesses}}
Strengths to keep: {{critic.output.strengths}}</user>
      </transform>

    </loop>

    <!-- Build final content metadata -->
    <transform id="build-metadata" type="template" input="refine-loop">
      <template>{"topic": "{{topic.name}}", "final_score": {{critic.output.score}}, "refinement_rounds": {{$iteration}}, "winning_model": "{{judge-drafts.output.winner}}", "content": {{json_encode(refine-loop)}}, "topic_score": {{topic.score}}}</template>
    </transform>

  </foreach>

  <!-- ============================================================ -->
  <!-- PHASE 3: Conditional routing based on quality                -->
  <!-- Tests: if/branch conditional — WILL EXPOSE EXECUTOR GAP     -->
  <!--        if body nodes aren't executed, output will be the     -->
  <!--        IfResult metadata object instead of transformed data  -->
  <!-- ============================================================ -->
  <if id="has-content" condition="length(process-topics) > 0" input="process-topics">
    <then>
      <transform id="format-published" type="template" input="process-topics">
        <template>{"status": "published", "count": {{length(input)}}, "items": {{json_encode(input)}}, "published_at": "{{now()}}"}</template>
      </transform>
    </then>
    <else>
      <transform id="format-empty" type="template" input="process-topics">
        <template>{"status": "empty", "count": 0, "items": [], "note": "No content met quality threshold"}</template>
      </transform>
    </else>
  </if>

  <!-- Branch by quality tier — ALSO TESTS EXECUTOR GAP -->
  <branch id="quality-router" input="process-topics">
    <case when="length(process-topics) >= 3">
      <transform id="tier-premium" type="template" input="process-topics">
        <template>{"tier": "premium", "message": "{{length(process-topics)}} items in premium tier"}</template>
      </transform>
    </case>
    <case when="length(process-topics) >= 1">
      <transform id="tier-standard" type="template" input="process-topics">
        <template>{"tier": "standard", "message": "{{length(process-topics)}} items in standard tier"}</template>
      </transform>
    </case>
    <default>
      <transform id="tier-none" type="template" input="process-topics">
        <template>{"tier": "none", "message": "No publishable content generated"}</template>
      </transform>
    </default>
  </branch>

  <!-- ============================================================ -->
  <!-- PHASE 4: Persist all outputs                                 -->
  <!-- ============================================================ -->
  <sink id="save-all-content" type="file" input="process-topics">
    <path>{{$config.output_dir}}/all-content.json</path>
    <format>json</format>
  </sink>

  <sink id="save-routing" type="file" input="has-content">
    <path>{{$config.output_dir}}/routing-result.json</path>
    <format>json</format>
  </sink>

  <sink id="save-tier" type="file" input="quality-router">
    <path>{{$config.output_dir}}/tier-result.json</path>
    <format>json</format>
  </sink>

</workflow>
