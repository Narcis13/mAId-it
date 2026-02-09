---
name: stress-data-pipeline
version: "1.0.0"
description: >
  Stress test: multi-source ingestion, CSV/YAML/JSON format transforms,
  database operations, foreach with nested parallel, while polling loop,
  HTTP sink, complex expression chains, and evolution tracking.
  Tests: database source/sink, file source (CSV/YAML/JSON), HTTP sink,
  foreach + nested parallel, while loop, map/filter chaining,
  template expressions with built-in functions, on-error retry,
  diamond dependencies, multi-wave scheduling.
trigger:
  manual: true
config:
  db_path:
    type: string
    default: ":memory:"
    description: "SQLite database path"
  api_endpoint:
    type: string
    default: "https://httpbin.org/post"
    description: "Target API endpoint"
  poll_interval:
    type: number
    default: 1000
    description: "Polling interval in ms"
secrets:
  - DB_URL
  - API_KEY
evolution:
  generation: 2
  parent: "1.0.0"
  fitness: 0.78
  learnings:
    - "CSV sources need explicit delimiter handling"
    - "Database batch inserts are 3x faster than individual"
    - "Polling loops should have exponential backoff"
---
<workflow>
  <!-- Phase 1: Multi-source data ingestion -->
  <phase name="ingest">
    <!-- Source A: JSON file -->
    <source id="json_source" type="file">
      <path>./examples/data/input.json</path>
      <format>json</format>
    </source>

    <!-- Source B: CSV file -->
    <source id="csv_source" type="file">
      <path>./examples/data/records.csv</path>
      <format>csv</format>
      <on-error>
        <retry max="2" backoff="fixed"/>
      </on-error>
    </source>

    <!-- Source C: Database query -->
    <source id="db_source" type="database">
      <connection>{{$secrets.DB_URL}}</connection>
      <query>SELECT id, name, score, category FROM items WHERE active = ?</query>
      <params>[1]</params>
    </source>
  </phase>

  <!-- Phase 2: Transform and normalize each source -->
  <phase name="normalize">
    <!-- Normalize JSON data -->
    <transform id="normalize_json" type="map" input="json_source">
      <expression>merge($item, {source: "json", normalized_score: divide($item.score, 100), imported_at: now()})</expression>
    </transform>

    <!-- Normalize CSV data -->
    <transform id="normalize_csv" type="map" input="csv_source">
      <expression>merge($item, {source: "csv", normalized_score: divide(to_number($item.score), 100), imported_at: now()})</expression>
    </transform>

    <!-- Normalize DB data -->
    <transform id="normalize_db" type="map" input="db_source">
      <expression>merge($item, {source: "database", normalized_score: divide($item.score, 100), imported_at: now()})</expression>
    </transform>

    <!-- Merge all normalized datasets -->
    <transform id="merge_all" type="template" input="normalize_json">
      <template>{{json_encode(concat(normalize_json.output, normalize_csv.output, normalize_db.output))}}</template>
    </transform>
  </phase>

  <!-- Phase 3: Filter and classify -->
  <phase name="classify">
    <!-- Filter valid records -->
    <transform id="filter_valid" type="filter" input="merge_all">
      <condition>$item.normalized_score >= 0</condition>
    </transform>

    <!-- Process each record: parallel classification -->
    <foreach id="classify_records" collection="filter_valid.output" item="record" concurrency="5">
      <parallel id="dual_classify">
        <branch>
          <!-- Classify by score tier -->
          <if id="tier_check" condition="record.normalized_score >= 0.8">
            <then>
              <transform id="tier_high" type="template">
                <template>{"id": "{{record.id}}", "tier": "gold", "priority": 1}</template>
              </transform>
            </then>
            <else>
              <if id="tier_mid_check" condition="record.normalized_score >= 0.5">
                <then>
                  <transform id="tier_mid" type="template">
                    <template>{"id": "{{record.id}}", "tier": "silver", "priority": 2}</template>
                  </transform>
                </then>
                <else>
                  <transform id="tier_low" type="template">
                    <template>{"id": "{{record.id}}", "tier": "bronze", "priority": 3}</template>
                  </transform>
                </else>
              </if>
            </else>
          </if>
        </branch>
        <branch>
          <!-- Classify by source -->
          <transform id="source_tag" type="template">
            <template>{"id": "{{record.id}}", "source": "{{record.source}}", "flagged": {{record.source == "csv"}}}</template>
          </transform>
        </branch>
      </parallel>
    </foreach>
  </phase>

  <!-- Phase 4: Aggregation and output -->
  <phase name="output">
    <!-- Build summary report -->
    <transform id="summary" type="template" input="classify_records">
      <template>{"total_records": {{length(filter_valid.output)}}, "sources": {"json": {{length(normalize_json.output)}}, "csv": {{length(normalize_csv.output)}}, "db": {{length(normalize_db.output)}}}, "pipeline": "stress-data-pipeline", "generation": 2, "timestamp": "{{now()}}"}</template>
    </transform>

    <!-- Save classified data to database -->
    <sink id="db_sink" type="database" input="classify_records">
      <connection>{{$secrets.DB_URL}}</connection>
      <table>classified_records</table>
      <operation>upsert</operation>
      <conflictColumns>["id"]</conflictColumns>
      <batch>50</batch>
      <on-error>
        <retry max="3" backoff="exponential"/>
      </on-error>
    </sink>

    <!-- POST summary to API -->
    <sink id="api_sink" type="http" input="summary">
      <request>
        method: POST
        url: "{{$config.api_endpoint}}"
        headers:
          Content-Type: application/json
          Authorization: "Bearer {{$secrets.API_KEY}}"
      </request>
      <on-error>
        <retry when="status >= 500" max="5" backoff="exponential"/>
      </on-error>
    </sink>

    <!-- Save report to JSON file -->
    <sink id="file_sink" type="file" input="summary">
      <path>./output/stress/data-pipeline-report.json</path>
      <format>json</format>
    </sink>
  </phase>
</workflow>
