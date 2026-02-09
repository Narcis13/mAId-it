/**
 * AST Type Definitions for FlowScript
 *
 * Defines the complete Abstract Syntax Tree structure for .flow.md workflow files.
 * Includes source location tracking for error messages.
 */

// ============================================================================
// Source Location Types
// ============================================================================

/**
 * Represents a position in the source file.
 */
export interface Position {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
  /** Byte offset in source */
  offset: number;
}

/**
 * Represents a range in the source file.
 */
export interface SourceLocation {
  start: Position;
  end: Position;
}

// ============================================================================
// Workflow Metadata Types (from YAML frontmatter)
// ============================================================================

/**
 * Trigger configuration for workflow execution.
 */
export interface TriggerConfig {
  type: 'manual' | 'webhook' | 'schedule';
  config?: Record<string, unknown>;
}

/**
 * Configuration field definition.
 */
export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default?: unknown;
  required?: boolean;
  description?: string;
}

/**
 * Workflow metadata extracted from YAML frontmatter.
 */
export interface WorkflowMetadata {
  name: string;
  version: string;
  description?: string;
  trigger?: TriggerConfig;
  config?: Record<string, ConfigField>;
  secrets?: string[];
  schemas?: Record<string, unknown>;
}

// ============================================================================
// AST Node Types
// ============================================================================

/**
 * All possible node types in a workflow.
 */
export type NodeType =
  | 'source'
  | 'transform'
  | 'sink'
  | 'branch'
  | 'if'
  | 'loop'
  | 'while'
  | 'foreach'
  | 'parallel'
  | 'checkpoint'
  | 'phase'
  | 'context'
  | 'set'
  | 'delay'
  | 'timeout'
  | 'include'
  | 'call';

/**
 * Per-node error handling configuration from <on-error> child element.
 */
export interface ErrorConfig {
  retry?: {
    when?: string;
    max?: number;
    backoff?: 'linear' | 'exponential' | 'fixed';
  };
  fallback?: string;
}

/**
 * Base interface for all AST nodes.
 */
export interface BaseNode {
  type: NodeType;
  id: string;
  loc: SourceLocation;
  /** Reference to another node's output */
  input?: string;
  /** Per-node error handling from <on-error> child */
  errorConfig?: ErrorConfig;
}

// ============================================================================
// Data Flow Nodes
// ============================================================================

/**
 * Source node - fetches data from external sources.
 */
export interface SourceNode extends BaseNode {
  type: 'source';
  sourceType: 'http' | 'file' | 'database';
  config: Record<string, unknown>;
}

/**
 * Transform node - transforms data.
 */
export interface TransformNode extends BaseNode {
  type: 'transform';
  transformType: 'ai' | 'template' | 'map' | 'filter';
  config: Record<string, unknown>;
}

/**
 * Sink node - sends data to external destinations.
 */
export interface SinkNode extends BaseNode {
  type: 'sink';
  sinkType: 'http' | 'file' | 'database';
  config: Record<string, unknown>;
}

// ============================================================================
// Control Flow Nodes
// ============================================================================

/**
 * A single case in a branch node.
 */
export interface BranchCase {
  condition: string;
  nodes: NodeAST[];
  loc: SourceLocation;
}

/**
 * Branch node - pattern matching with multiple cases.
 */
export interface BranchNode extends BaseNode {
  type: 'branch';
  cases: BranchCase[];
  default?: NodeAST[];
}

/**
 * If node - conditional execution.
 */
export interface IfNode extends BaseNode {
  type: 'if';
  condition: string;
  then: NodeAST[];
  else?: NodeAST[];
}

/**
 * Loop node - fixed iteration loop.
 */
export interface LoopNode extends BaseNode {
  type: 'loop';
  maxIterations?: number;
  breakCondition?: string;
  body: NodeAST[];
}

/**
 * While node - condition-based loop.
 */
export interface WhileNode extends BaseNode {
  type: 'while';
  condition: string;
  body: NodeAST[];
}

/**
 * Foreach node - iterate over collection.
 */
export interface ForeachNode extends BaseNode {
  type: 'foreach';
  collection: string;
  itemVar: string;
  maxConcurrency?: number;
  body: NodeAST[];
}

/**
 * Parallel node - execute branches concurrently.
 */
export interface ParallelNode extends BaseNode {
  type: 'parallel';
  branches: NodeAST[][];
  /** Wait strategy: 'all' (default), 'any', or 'n(N)' for first N */
  wait?: string;
  /** Merge strategy: 'array' (default), 'concat', 'object', or expression */
  merge?: string;
}

/**
 * Checkpoint node - human approval gate.
 */
export interface CheckpointNode extends BaseNode {
  type: 'checkpoint';
  prompt: string;
  timeout?: number;
  defaultAction?: 'approve' | 'reject';
  /** Named actions with goto routing */
  actions?: CheckpointActionDef[];
  /** Condition expression — skip checkpoint if evaluates to false */
  condition?: string;
}

/**
 * Named action definition for checkpoint nodes.
 */
export interface CheckpointActionDef {
  /** Action identifier */
  id: string;
  /** Display label */
  label?: string;
  /** Node ID to route to when this action is selected */
  goto?: string;
}

// ============================================================================
// Structural / Temporal Nodes
// ============================================================================

/**
 * Phase node - logical grouping of nodes.
 * Transparent wrapper: child nodes are visible globally.
 */
export interface PhaseNode extends BaseNode {
  type: 'phase';
  name: string;
  children: NodeAST[];
}

/**
 * Context node - declares scoped variables.
 */
export interface ContextNode extends BaseNode {
  type: 'context';
  entries: Array<{ key: string; value: string }>;
}

/**
 * Set node - variable assignment.
 */
export interface SetNode extends BaseNode {
  type: 'set';
  var: string;
  value: string;
}

/**
 * Delay node - pause execution for a duration.
 */
export interface DelayNode extends BaseNode {
  type: 'delay';
  duration: string;
}

/**
 * Timeout node - wraps children with a time limit.
 */
export interface TimeoutNode extends BaseNode {
  type: 'timeout';
  duration: string;
  onTimeout?: string;
  children: NodeAST[];
}

// ============================================================================
// Composition Nodes
// ============================================================================

/**
 * Include node - execute another workflow inline.
 * Output available as `includeId.output` in parent scope.
 */
export interface IncludeNode extends BaseNode {
  type: 'include';
  /** Path to the workflow file to include */
  workflow: string;
  /** Input bindings passed to the sub-workflow */
  bindings: Array<{ key: string; value: string }>;
}

/**
 * Call node - invoke another workflow with function-call semantics.
 * Isolated execution context; only args are passed in, only output returned.
 */
export interface CallNode extends BaseNode {
  type: 'call';
  /** Path to the workflow file to call */
  workflow: string;
  /** Arguments passed to the sub-workflow (key-value pairs from attributes) */
  args: Record<string, string>;
}

// ============================================================================
// Union Type for All Nodes
// ============================================================================

/**
 * Union type representing any AST node.
 */
export type NodeAST =
  | SourceNode
  | TransformNode
  | SinkNode
  | BranchNode
  | IfNode
  | LoopNode
  | WhileNode
  | ForeachNode
  | ParallelNode
  | CheckpointNode
  | PhaseNode
  | ContextNode
  | SetNode
  | DelayNode
  | TimeoutNode
  | IncludeNode
  | CallNode;

// ============================================================================
// Complete Workflow AST
// ============================================================================

/**
 * Source map for error location tracking.
 */
export interface SourceMap {
  /** Original file content */
  source: string;
  /** File path */
  filePath: string;
  /** Byte offset for each line start */
  lineOffsets: number[];
}

/**
 * Complete workflow AST representing a parsed .flow.md file.
 */
export interface WorkflowAST {
  metadata: WorkflowMetadata;
  nodes: NodeAST[];
  sourceMap: SourceMap;
}
