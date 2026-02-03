---
# ═══════════════════════════════════════════════════════════════
# IDENTITY
# ═══════════════════════════════════════════════════════════════
name: file-transform
version: 1.0.0
description: Read a JSON file, filter and transform it, then write to another file

# ═══════════════════════════════════════════════════════════════
# TRIGGERS
# ═══════════════════════════════════════════════════════════════
trigger:
  manual: true
---

<workflow>
  <!-- Read input data -->
  <source id="read-data" type="file">
    <path>./examples/data/input.json</path>
    <format>json</format>
  </source>

  <!-- Filter items with score > 50 -->
  <transform id="filter-high-scores" type="filter" input="read-data">
    <condition>item.score > 50</condition>
  </transform>

  <!-- Add a processed flag to each item -->
  <transform id="enrich-data" type="map" input="filter-high-scores">
    <expression>
      item => ({
        ...item,
        passed: true,
        grade: item.score >= 90 ? "A" : item.score >= 80 ? "B" : "C"
      })
    </expression>
  </transform>

  <!-- Write results -->
  <sink id="write-results" type="file" input="enrich-data">
    <path>./examples/data/output.json</path>
    <format>json</format>
  </sink>
</workflow>

<!--
## Execution Log

_No executions yet._
-->
