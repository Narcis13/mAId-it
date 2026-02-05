---
name: test-workflow
version: 1.0.0
config:
  output_dir: ./default
  timeout: 30
---

<workflow>
  <source id="data" type="http">
    <url>https://api.example.com/data</url>
  </source>

  <transform id="process" type="template" input="data">
    <template>Result: {{input.value}}</template>
  </transform>
</workflow>
