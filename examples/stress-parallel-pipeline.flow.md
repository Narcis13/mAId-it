---
name: stress-parallel-pipeline
version: "1.0.0"
description: >
  Stress test: parallel fan_out with diamond dependencies, foreach iteration,
  conditional branching, template chaining, delay, and file sink.
  Tests: parallel (wait=all, merge=object), foreach, if/else, delay, phase,
  context/set, on-error retry, diamond dependency, template expressions,
  multi-wave execution.
trigger:
  manual: true
config:
  batch_size:
    type: number
    default: 5
    required: true
    description: "Number of items per batch"
  output_dir:
    type: string
    default: "./output/stress"
    description: "Output directory"
secrets:
  - API_KEY
---
<workflow>
  <!-- Phase 1: Setup variables and load data -->
  <phase name="setup">
    <context id="globals">
      <set key="run_label" value="stress-run-{{now()}}"/>
      <set key="threshold" value="50"/>
    </context>

    <source id="load_data" type="file">
      <path>./examples/data/input.json</path>
      <format>json</format>
    </source>

    <set var="item_count" value="{{length(load_data.output)}}"/>
  </phase>

  <!-- Phase 2: Parallel fan_out — process data three ways simultaneously -->
  <phase name="process">
    <parallel id="fan_out" input="load_data" wait="all" merge="object">
      <branch>
        <!-- Branch A: Filter high scores, map to enriched objects -->
        <transform id="filter_high" type="filter" input="load_data">
          <condition>$item.score > 50</condition>
        </transform>
        <transform id="enrich_high" type="map" input="filter_high">
          <expression>merge($item, {tier: "high", processed: true})</expression>
        </transform>
      </branch>
      <branch>
        <!-- Branch B: Filter low scores, map differently -->
        <transform id="filter_low" type="filter" input="load_data">
          <condition>not($item.score > 50)</condition>
        </transform>
        <transform id="enrich_low" type="map" input="filter_low">
          <expression>merge($item, {tier: "low", flagged: true})</expression>
        </transform>
      </branch>
      <branch>
        <!-- Branch C: Compute summary statistics via templates -->
        <transform id="count_items" type="template" input="load_data">
          <template>{"total": {{length(input)}}, "label": "{{$context.run_label}}"}</template>
        </transform>
      </branch>
    </parallel>

    <!-- Diamond dependency: merge results from parallel branches -->
    <transform id="merge_report" type="template" input="fan_out">
      <template>{"high_tier": {{json_encode(fan_out.output)}}, "timestamp": "{{now()}}"}</template>
    </transform>
  </phase>

  <!-- Phase 3: Iterate over high-tier items with conditions -->
  <phase name="classify">
    <foreach id="classify_items" collection="filter_high.output" item="record" concurrency="3">
      <if id="grade-check" condition="record.score >= 90">
        <then>
          <transform id="grade-a" type="template">
            <template>{"name": "{{record.name}}", "grade": "A", "score": {{record.score}}}</template>
          </transform>
        </then>
        <else>
          <if id="grade-b-check" condition="record.score >= 70">
            <then>
              <transform id="grade-b" type="template">
                <template>{"name": "{{record.name}}", "grade": "B", "score": {{record.score}}}</template>
              </transform>
            </then>
            <else>
              <transform id="grade-c" type="template">
                <template>{"name": "{{record.name}}", "grade": "C", "score": {{record.score}}}</template>
              </transform>
            </else>
          </if>
        </else>
      </if>
    </foreach>
  </phase>

  <!-- Phase 4: Output with delay and error handling -->
  <phase name="output">
    <delay id="cooldown" duration="100ms" input="merge_report"/>

    <transform id="final-report" type="template" input="merge_report">
      <template>{"report": {{json_encode(merge_report.output)}}, "classifications": {{json_encode(classify_items.output)}}, "generated_at": "{{now()}}"}</template>
    </transform>

    <sink id="save-report" type="file" input="final-report">
      <path>{{$config.output_dir}}/parallel-report.json</path>
      <format>json</format>
      <on-error>
        <retry max="2" backoff="exponential"/>
      </on-error>
    </sink>
  </phase>
</workflow>
