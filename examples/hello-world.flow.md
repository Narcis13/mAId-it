---
# ═══════════════════════════════════════════════════════════════
# IDENTITY
# ═══════════════════════════════════════════════════════════════
name: hello-world
version: 1.0.0
description: A simple example workflow that fetches a joke and saves it

# ═══════════════════════════════════════════════════════════════
# TRIGGERS
# ═══════════════════════════════════════════════════════════════
trigger:
  manual: true

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════
config:
  output_dir:
    type: string
    default: "./output"
    description: Directory to save output files

# ═══════════════════════════════════════════════════════════════
# RUNTIME SETTINGS
# ═══════════════════════════════════════════════════════════════
runtime:
  timeout: 5m
---

<workflow>
  <!-- Fetch a random joke from a public API -->
  <source id="fetch-joke" type="http">
    <request>
      method: GET
      url: https://official-joke-api.appspot.com/random_joke
    </request>
  </source>

  <!-- Format the joke nicely -->
  <transform id="format-joke" type="template" input="fetch-joke">
    <template>{"setup": "{{input.setup}}", "punchline": "{{input.punchline}}", "formatted": "{{input.setup}} ... {{input.punchline}}", "fetched_at": "{{now()}}"}</template>
  </transform>

  <!-- Save to a file -->
  <sink id="save-joke" type="file" input="format-joke">
    <path>{{$config.output_dir}}/joke.json</path>
    <format>json</format>
  </sink>
</workflow>

---

## Execution Log

**Run ID:** `62b8b17f-40fe-430a-b699-83036d676802`
**Workflow:** hello-world
**Timestamp:** 2026-02-07T13:47:17.573Z
**Duration:** 0.35s
**Status:** completed
**Waves:** 3

### Node Results

| Node | Status | Duration | Output |
|------|--------|----------|--------|
| fetch-joke | success | 0.32s | {"type":"general","setup":"A grocery store cash... |
| format-joke | success | 0.03s | "{\"setup\": \"A grocery store cashier asked if... |
| save-joke | success | 0.00s | {"path":"./output/joke.json","bytes":337} |
