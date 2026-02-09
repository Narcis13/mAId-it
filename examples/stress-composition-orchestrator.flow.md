---
name: stress-composition-orchestrator
version: "1.0.0"
description: >
  Stress test: workflow composition (include/call), AI transforms with schema DSL,
  parallel with wait=any and merge=concat, while polling loop, checkpoint with
  multiple named actions, delay sequences, timeout wrappers, deeply nested
  control flow, and complex expression evaluation.
  Tests: include, call, AI transform, output-schema DSL, parallel wait=any,
  parallel merge=concat, while loop, checkpoint actions, delay, timeout,
  loop > if > parallel nesting, set/context, template with 10+ functions,
  on-error with fallback, phase grouping, diamond dependencies.
trigger:
  manual: true
config:
  model:
    type: string
    default: "anthropic/claude-sonnet-4"
    description: "AI model to use"
  quality_threshold:
    type: number
    default: 7
    description: "Minimum quality score (1-10)"
  max_revisions:
    type: number
    default: 3
    description: "Maximum revision attempts"
secrets:
  - OPENROUTER_API_KEY
  - SENDGRID_API_KEY
evolution:
  generation: 1
  fitness: 0.65
  learnings:
    - "First-pass AI quality averages 6/10, needs 1-2 revisions"
    - "Parallel review is faster than sequential"
---
<workflow>
  <!-- Phase 1: Load input and prepare context -->
  <phase name="preparation">
    <context id="workflow-vars">
      <set key="start_time" value="{{now()}}"/>
      <set key="revision_count" value="0"/>
    </context>

    <source id="load_brief" type="file">
      <path>./examples/data/topic.json</path>
      <format>json</format>
    </source>

    <!-- Call a sub-workflow to validate the brief -->
    <call id="validate_brief" workflow="./examples/validate_brief.flow.md" brief="{{json_encode(load_brief.output)}}" strict="true"/>

    <set var="brief_valid" value="{{validate_brief.output.valid}}"/>
  </phase>

  <!-- Phase 2: AI content generation with timeout -->
  <phase name="generate">
    <timeout id="generation-timeout" duration="120s" on-timeout="timeout-fallback">
      <!-- Generate initial draft -->
      <transform id="draft" type="ai" input="load_brief">
        <model>{{$config.model}}</model>
        <system>You are an expert content writer. Follow the brief precisely.</system>
        <user>Write a comprehensive article based on this brief: {{json_encode(input)}}</user>
        <on-error>
          <retry when="status >= 429" max="3" backoff="exponential"/>
          <fallback node="draft-fallback"/>
        </on-error>
      </transform>
    </timeout>

    <!-- Fallback if generation times out -->
    <transform id="timeout-fallback" type="template">
      <template>{"error": "Generation timed out", "fallback": true, "content": "Draft generation exceeded time limit."}</template>
    </transform>

    <!-- Fallback if AI fails -->
    <transform id="draft-fallback" type="template" input="load_brief">
      <template>Based on the topic "{{input.title}}": This is a placeholder draft that needs manual completion.</template>
    </transform>
  </phase>

  <!-- Phase 3: Iterative quality improvement loop -->
  <phase name="improve">
    <loop id="revision-loop" max="3" break="quality_score.output.score >= $config.quality_threshold" input="draft">
      <!-- Parallel review: two AI reviewers score independently -->
      <parallel id="dual-review" input="draft" wait="all" merge="array">
        <branch>
          <transform id="reviewer_1" type="ai" input="draft">
            <model>{{$config.model}}</model>
            <system>You are a strict content reviewer. Score 1-10 and give specific feedback.</system>
            <user>Review this article for accuracy, clarity, and completeness: {{json_encode(input)}}</user>
            <output-schema>{score: number, feedback: string, strengths: string[], weaknesses: string[]}</output-schema>
          </transform>
        </branch>
        <branch>
          <transform id="reviewer_2" type="ai" input="draft">
            <model>{{$config.model}}</model>
            <system>You are an editor focused on style, readability, and engagement. Score 1-10.</system>
            <user>Review this article for style and readability: {{json_encode(input)}}</user>
            <output-schema>{score: number, feedback: string, suggestions: string[]}</output-schema>
          </transform>
        </branch>
      </parallel>

      <!-- Aggregate review scores -->
      <transform id="quality_score" type="template" input="dual-review">
        <template>{"score": {{divide(add(reviewer_1.output.score, reviewer_2.output.score), 2)}}, "feedback_1": "{{reviewer_1.output.feedback}}", "feedback_2": "{{reviewer_2.output.feedback}}"}</template>
      </transform>

      <!-- Conditional revision based on score -->
      <if id="needs-revision" condition="quality_score.output.score < $config.quality_threshold">
        <then>
          <transform id="revise" type="ai" input="draft">
            <model>{{$config.model}}</model>
            <system>Revise the article incorporating all feedback. Maintain the original structure.</system>
            <user>Original: {{json_encode(input)}}

Reviewer 1 feedback: {{quality_score.output.feedback_1}}
Reviewer 2 feedback: {{quality_score.output.feedback_2}}

Please revise to address all feedback.</user>
          </transform>
          <set var="revision_count" value="{{add($context.revision_count, 1)}}"/>
        </then>
        <else>
          <transform id="approved" type="template" input="draft">
            <template>{{json_encode(input)}}</template>
          </transform>
        </else>
      </if>
    </loop>
  </phase>

  <!-- Phase 4: Post-processing and multi-output -->
  <phase name="finalize">
    <!-- Human checkpoint for final review -->
    <checkpoint id="final-review" prompt="Article scored {{quality_score.output.score}}/10 after {{$context.revision_count}} revisions. Approve for publication?" timeout="600" default="approve">
      <action id="publish" label="Publish now" goto="prepare-output"/>
      <action id="edit" label="Manual edit needed"/>
      <action id="reject" label="Reject and discard"/>
    </checkpoint>

    <!-- Delay before output (rate limiting) -->
    <delay id="rate-limit" duration="500ms" input="revision-loop"/>

    <!-- Prepare final output with metadata -->
    <transform id="prepare-output" type="template" input="revision-loop">
      <template>{"title": "{{load_brief.output.title}}", "content": {{json_encode(input)}}, "metadata": {"model": "{{$config.model}}", "revisions": {{$context.revision_count}}, "final_score": {{quality_score.output.score}}, "reviewers": 2, "generation_time": "{{$context.start_time}}", "pipeline_version": "1.0.0"}}</template>
    </transform>

    <!-- Parallel output: save file + include notification sub-workflow -->
    <parallel id="output-fanout" input="prepare-output" wait="all">
      <branch>
        <sink id="save-article" type="file" input="prepare-output">
          <path>./output/stress/article-final.json</path>
          <format>json</format>
        </sink>
      </branch>
      <branch>
        <!-- Include a notification sub-workflow -->
        <include id="notify" workflow="./examples/notify.flow.md" input="prepare-output">
          <bind key="title" value="{{load_brief.output.title}}"/>
          <bind key="score" value="{{quality_score.output.score}}"/>
        </include>
      </branch>
    </parallel>
  </phase>
</workflow>
