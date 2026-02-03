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
  <transform id="format-joke" type="map" input="fetch-joke">
    <expression>
      joke => ({
        setup: joke.setup,
        punchline: joke.punchline,
        formatted: joke.setup + " ... " + joke.punchline,
        fetched_at: now()
      })
    </expression>
  </transform>

  <!-- Save to a file -->
  <sink id="save-joke" type="file" input="format-joke">
    <path>{{config.output_dir}}/joke.json</path>
    <format>json</format>
  </sink>
</workflow>

<!--
## Execution Log

_No executions yet._
-->
