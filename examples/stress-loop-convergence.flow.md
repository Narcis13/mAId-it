---
name: stress-loop-convergence
version: "1.0.0"
description: >
  Stress test: nested loops, while conditions, branch routing, timeout wrapping,
  checkpoint gates, set variable mutation, and complex expression evaluation.
  Tests: loop with break, while with condition, nested if inside loop, timeout
  wrapper, checkpoint with named actions, set variable, context scoping,
  template with complex expressions, on-error with fallback.
trigger:
  manual: true
config:
  max_iterations:
    type: number
    default: 10
    description: "Maximum optimization iterations"
  convergence_threshold:
    type: number
    default: 0.01
    description: "Stop when delta falls below this"
secrets:
  - OPENROUTER_API_KEY
---
<workflow>
  <!-- Initialize optimization state -->
  <context id="opt-config">
    <set key="learning_rate" value="0.1"/>
    <set key="momentum" value="0.9"/>
  </context>

  <source id="load-params" type="file">
    <path>./examples/data/params.json</path>
    <format>json</format>
    <on-error>
      <retry max="3" backoff="linear"/>
      <fallback node="default-params"/>
    </on-error>
  </source>

  <!-- Fallback: provide default parameters if file not found -->
  <transform id="default-params" type="template">
    <template>{"weights": [0.5, 0.3, 0.2], "bias": 0.1, "loss": 1.0}</template>
  </transform>

  <set var="best_loss" value="999"/>
  <set var="iteration" value="0"/>

  <!-- Main optimization loop with break condition -->
  <loop id="optimize" max="10" break="current_loss.output < 0.01" input="load-params">
    <!-- Compute current loss via template (simulated) -->
    <transform id="compute_step" type="template" input="load-params">
      <template>{"weights": {{json_encode(input.weights)}}, "lr": {{$context.learning_rate}}, "step": {{add($context.iteration, 1)}}}</template>
    </transform>

    <transform id="current_loss" type="template" input="compute_step">
      <template>{{divide(1.0, add(input.step, 1))}}</template>
    </transform>

    <!-- Nested conditional: check if loss improved -->
    <if id="check-improvement" condition="current_loss.output < best_loss">
      <then>
        <set id="update-best-loss" var="best_loss" value="{{current_loss.output}}"/>
        <transform id="log-improvement" type="template" input="current_loss">
          <template>{"status": "improved", "loss": {{input}}, "iteration": {{compute_step.output.step}}}</template>
        </transform>
      </then>
      <else>
        <!-- If no improvement, branch on loss magnitude -->
        <branch id="loss-action" input="current_loss">
          <case when="input > 0.5">
            <transform id="big-step" type="template">
              <template>{"action": "increase_lr", "factor": 2.0}</template>
            </transform>
          </case>
          <case when="input > 0.1">
            <transform id="medium-step" type="template">
              <template>{"action": "keep_lr", "factor": 1.0}</template>
            </transform>
          </case>
          <default>
            <transform id="small-step" type="template">
              <template>{"action": "decrease_lr", "factor": 0.5}</template>
            </transform>
          </default>
        </branch>
      </else>
    </if>

    <set id="update-iteration" var="iteration" value="{{add($context.iteration, 1)}}"/>
  </loop>

  <!-- Wrap final validation in a timeout -->
  <timeout id="validation-timeout" duration="30s">
    <transform id="validate-result" type="template" input="optimize">
      <template>{"final_loss": {{$context.best_loss}}, "iterations": {{$context.iteration}}, "converged": {{not($context.best_loss >= $config.convergence_threshold)}}}</template>
    </transform>
  </timeout>

  <!-- Human checkpoint before saving -->
  <checkpoint id="review-results" prompt="Optimization complete. Loss={{$context.best_loss}} after {{$context.iteration}} iterations. Save results?" timeout="300" default="approve">
    <condition>$context.best_loss > 0.1</condition>
    <action id="save" label="Save and continue" goto="save-results"/>
    <action id="retry" label="Re-run optimization" goto="optimize"/>
    <action id="discard" label="Discard results"/>
  </checkpoint>

  <sink id="save-results" type="file" input="validation-timeout">
    <path>./output/stress/convergence-results.json</path>
    <format>json</format>
  </sink>
</workflow>
