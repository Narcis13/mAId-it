---
name: iterative-refinement
version: 1.0.0
description: AI writes, AI critiques, loop until quality >= 8 or 5 iterations
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <source id="topic" type="file">
    <path>./examples/data/topic.json</path>
    <format>json</format>
  </source>

  <transform id="first-draft" type="ai" input="topic">
    <model>anthropic/claude-sonnet-4</model>
    <user>Write a detailed article about: {{json_encode(input)}}</user>
  </transform>

  <loop id="improve-loop" max="5" break="evaluate.output.score >= 8" input="first-draft">
    <transform id="evaluate" type="ai" input="first-draft">
      <model>anthropic/claude-sonnet-4</model>
      <user>Rate this article 1-10 and give specific feedback: {{json_encode(input)}}</user>
      <output-schema>{score: number, feedback: string}</output-schema>
    </transform>

    <transform id="revise" type="ai" input="first-draft">
      <model>anthropic/claude-sonnet-4</model>
      <user>Revise this article based on feedback. Original: {{json_encode(input)}}. Feedback: {{evaluate.output.feedback}}</user>
    </transform>
  </loop>

  <sink id="save-final" type="file" input="improve-loop">
    <path>./output/final-article.json</path>
    <format>json</format>
  </sink>
</workflow>

---

## Execution Log

**Run ID:** `fd06c9e0-14cf-406a-afbe-85d0c7d5588c`
**Workflow:** iterative-refinement
**Timestamp:** 2026-02-07T14:59:05.431Z
**Duration:** 67.04s
**Status:** completed
**Waves:** 4

### Node Results

| Node | Status | Duration | Output |
|------|--------|----------|--------|
| topic | success | 0.00s | {"title":"The Future of WebAssembly","keywords"... |
| first-draft | success | 27.68s | "# The Future of WebAssembly: Revolutionizing B... |
| improve-loop | success | 39.36s | "# The Future of WebAssembly: Revolutionizing B... |
| evaluate | success | 7.57s | {"score":8,"feedback":"This is a well-structure... |
| revise | success | 31.79s | "# The Future of WebAssembly: Revolutionizing B... |
| save-final | success | 0.00s | {"path":"./output/final-article.json","bytes":9... |
