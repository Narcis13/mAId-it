/**
 * Cycle Detection for Workflow Composition
 *
 * Module-level set tracking active workflow file paths.
 * Used by include and call runtimes to prevent recursive cycles.
 */

export const activeWorkflowPaths = new Set<string>();
