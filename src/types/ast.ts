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
  | 'checkpoint';

/**
 * Base interface for all AST nodes.
 */
export interface BaseNode {
  type: NodeType;
  id: string;
  loc: SourceLocation;
  /** Reference to another node's output */
  input?: string;
}

// ============================================================================
// Data Flow Nodes
// ============================================================================

/**
 * Source node - fetches data from external sources.
 */
export interface SourceNode extends BaseNode {
  type: 'source';
  sourceType: 'http' | 'file';
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
  sinkType: 'http' | 'file';
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
}

/**
 * Checkpoint node - human approval gate.
 */
export interface CheckpointNode extends BaseNode {
  type: 'checkpoint';
  prompt: string;
  timeout?: number;
  defaultAction?: 'approve' | 'reject';
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
  | CheckpointNode;

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
