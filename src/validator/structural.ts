/**
 * Structural Validator
 *
 * Validates structural integrity of the AST:
 * - Required fields are present
 * - Field types are correct
 * - Node types are valid
 */

import type {
  WorkflowAST,
  NodeAST,
  WorkflowMetadata,
  SourceNode,
  TransformNode,
  SinkNode,
  BranchNode,
  IfNode,
  LoopNode,
  WhileNode,
  ForeachNode,
  ParallelNode,
  CheckpointNode,
} from '../types';
import { createError, createWarning, type ValidationError } from '../types/errors';

/**
 * Validate structural integrity of the workflow AST.
 * Checks required fields and valid field types.
 *
 * @param ast - The parsed workflow AST
 * @returns Array of validation errors (empty if valid)
 */
export function validateStructural(ast: WorkflowAST): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate metadata
  errors.push(...validateMetadata(ast.metadata));

  // Validate all nodes recursively
  for (const node of ast.nodes) {
    errors.push(...validateNode(node));
  }

  return errors;
}

/**
 * Validate workflow metadata (frontmatter).
 */
function validateMetadata(metadata: WorkflowMetadata): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!metadata.name || metadata.name.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        'Workflow metadata requires a "name" field',
        undefined,
        ['Add "name: my-workflow" to the frontmatter']
      )
    );
  }

  // Required: version
  if (!metadata.version || metadata.version.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        'Workflow metadata requires a "version" field',
        undefined,
        ['Add "version: 1.0.0" to the frontmatter']
      )
    );
  }

  // Validate trigger config if present
  if (metadata.trigger) {
    const validTriggerTypes = ['manual', 'webhook', 'schedule'];
    if (!validTriggerTypes.includes(metadata.trigger.type)) {
      errors.push(
        createError(
          'VALID_INVALID_FIELD_TYPE',
          `Invalid trigger type "${metadata.trigger.type}"`,
          undefined,
          [`Valid trigger types: ${validTriggerTypes.join(', ')}`]
        )
      );
    }
  }

  // Validate config fields if present
  if (metadata.config) {
    for (const [fieldName, fieldConfig] of Object.entries(metadata.config)) {
      const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
      if (!validTypes.includes(fieldConfig.type)) {
        errors.push(
          createError(
            'VALID_INVALID_FIELD_TYPE',
            `Config field "${fieldName}" has invalid type "${fieldConfig.type}"`,
            undefined,
            [`Valid types: ${validTypes.join(', ')}`]
          )
        );
      }
    }
  }

  return errors;
}

/**
 * Validate a single node and its children recursively.
 */
function validateNode(node: NodeAST): ValidationError[] {
  const errors: ValidationError[] = [];

  // Common validations for all nodes
  if (!node.id || node.id.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Node of type "${node.type}" is missing required "id" attribute`,
        node.loc,
        ['Add id="unique-id" to the node']
      )
    );
  }

  // Type-specific validation using discriminated union
  switch (node.type) {
    case 'source':
      errors.push(...validateSourceNode(node));
      break;
    case 'transform':
      errors.push(...validateTransformNode(node));
      break;
    case 'sink':
      errors.push(...validateSinkNode(node));
      break;
    case 'branch':
      errors.push(...validateBranchNode(node));
      break;
    case 'if':
      errors.push(...validateIfNode(node));
      break;
    case 'loop':
      errors.push(...validateLoopNode(node));
      break;
    case 'while':
      errors.push(...validateWhileNode(node));
      break;
    case 'foreach':
      errors.push(...validateForeachNode(node));
      break;
    case 'parallel':
      errors.push(...validateParallelNode(node));
      break;
    case 'checkpoint':
      errors.push(...validateCheckpointNode(node));
      break;
    default:
      // TypeScript exhaustiveness check - this should never happen
      const _exhaustiveCheck: never = node;
      errors.push(
        createError(
          'VALID_UNKNOWN_NODE_TYPE',
          `Unknown node type encountered`,
          undefined
        )
      );
  }

  return errors;
}

/**
 * Validate source node structure.
 */
function validateSourceNode(node: SourceNode): ValidationError[] {
  const errors: ValidationError[] = [];

  const validSourceTypes = ['http', 'file'];
  if (!validSourceTypes.includes(node.sourceType)) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Source node "${node.id}" has invalid source type "${node.sourceType}"`,
        node.loc,
        [`Valid source types: ${validSourceTypes.join(', ')}`]
      )
    );
  }

  return errors;
}

/**
 * Validate transform node structure.
 */
function validateTransformNode(node: TransformNode): ValidationError[] {
  const errors: ValidationError[] = [];

  const validTransformTypes = ['ai', 'template', 'map', 'filter'];
  if (!validTransformTypes.includes(node.transformType)) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Transform node "${node.id}" has invalid transform type "${node.transformType}"`,
        node.loc,
        [`Valid transform types: ${validTransformTypes.join(', ')}`]
      )
    );
  }

  // AI transforms should have input
  if (node.transformType === 'ai' && !node.input) {
    errors.push(
      createWarning(
        'VALID_MISSING_REQUIRED_FIELD',
        `AI transform "${node.id}" has no input reference`,
        node.loc,
        ['Add input="source-node-id" to specify data source']
      )
    );
  }

  return errors;
}

/**
 * Validate sink node structure.
 */
function validateSinkNode(node: SinkNode): ValidationError[] {
  const errors: ValidationError[] = [];

  const validSinkTypes = ['http', 'file'];
  if (!validSinkTypes.includes(node.sinkType)) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Sink node "${node.id}" has invalid sink type "${node.sinkType}"`,
        node.loc,
        [`Valid sink types: ${validSinkTypes.join(', ')}`]
      )
    );
  }

  // Sinks should have input
  if (!node.input) {
    errors.push(
      createWarning(
        'VALID_MISSING_REQUIRED_FIELD',
        `Sink node "${node.id}" has no input reference`,
        node.loc,
        ['Add input="source-node-id" to specify data source']
      )
    );
  }

  return errors;
}

/**
 * Validate branch node structure.
 */
function validateBranchNode(node: BranchNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (node.cases.length === 0) {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Branch node "${node.id}" must have at least one case`,
        node.loc,
        ['Add <case when="condition">...</case> elements inside the branch']
      )
    );
  }

  // Validate each case has a condition
  for (let i = 0; i < node.cases.length; i++) {
    const branchCase = node.cases[i];
    if (!branchCase || !branchCase.condition || branchCase.condition.trim() === '') {
      const caseLoc = branchCase?.loc;
      errors.push(
        createError(
          'VALID_MISSING_REQUIRED_FIELD',
          `Branch "${node.id}" case ${i + 1} is missing a "when" condition`,
          caseLoc || node.loc,
          ['Add when="expression" to the <case> element']
        )
      );
    }

    // Recursively validate case nodes
    if (branchCase) {
      for (const childNode of branchCase.nodes) {
        errors.push(...validateNode(childNode));
      }
    }
  }

  // Validate default branch nodes if present
  if (node.default) {
    for (const childNode of node.default) {
      errors.push(...validateNode(childNode));
    }
  }

  return errors;
}

/**
 * Validate if node structure.
 */
function validateIfNode(node: IfNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!node.condition || node.condition.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `If node "${node.id}" is missing required "condition" attribute`,
        node.loc,
        ['Add condition="expression" to the <if> element']
      )
    );
  }

  // Validate then branch
  for (const childNode of node.then) {
    errors.push(...validateNode(childNode));
  }

  // Validate else branch if present
  if (node.else) {
    for (const childNode of node.else) {
      errors.push(...validateNode(childNode));
    }
  }

  return errors;
}

/**
 * Validate loop node structure.
 */
function validateLoopNode(node: LoopNode): ValidationError[] {
  const errors: ValidationError[] = [];

  // Loop should have either maxIterations or breakCondition to prevent infinite loops
  if (node.maxIterations === undefined && !node.breakCondition) {
    errors.push(
      createWarning(
        'VALID_MISSING_REQUIRED_FIELD',
        `Loop node "${node.id}" has no exit condition (max or break)`,
        node.loc,
        ['Add max="10" or break="condition" to prevent infinite loops']
      )
    );
  }

  // Validate maxIterations if present
  if (node.maxIterations !== undefined && node.maxIterations <= 0) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Loop node "${node.id}" has invalid max iterations: ${node.maxIterations}`,
        node.loc,
        ['max must be a positive integer']
      )
    );
  }

  // Validate body nodes
  for (const childNode of node.body) {
    errors.push(...validateNode(childNode));
  }

  return errors;
}

/**
 * Validate while node structure.
 */
function validateWhileNode(node: WhileNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!node.condition || node.condition.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `While node "${node.id}" is missing required "condition" attribute`,
        node.loc,
        ['Add condition="expression" to the <while> element']
      )
    );
  }

  // Validate body nodes
  for (const childNode of node.body) {
    errors.push(...validateNode(childNode));
  }

  return errors;
}

/**
 * Validate foreach node structure.
 */
function validateForeachNode(node: ForeachNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!node.collection || node.collection.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Foreach node "${node.id}" is missing required "collection" attribute`,
        node.loc,
        ['Add collection="items" to specify what to iterate over']
      )
    );
  }

  if (!node.itemVar || node.itemVar.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Foreach node "${node.id}" is missing required "item" attribute`,
        node.loc,
        ['Add item="item" to specify the loop variable name']
      )
    );
  }

  // Validate maxConcurrency if present
  if (node.maxConcurrency !== undefined && node.maxConcurrency <= 0) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Foreach node "${node.id}" has invalid concurrency: ${node.maxConcurrency}`,
        node.loc,
        ['concurrency must be a positive integer']
      )
    );
  }

  // Validate body nodes
  for (const childNode of node.body) {
    errors.push(...validateNode(childNode));
  }

  return errors;
}

/**
 * Validate parallel node structure.
 */
function validateParallelNode(node: ParallelNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (node.branches.length === 0) {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Parallel node "${node.id}" must have at least one branch`,
        node.loc,
        ['Add <branch>...</branch> elements inside the parallel']
      )
    );
  }

  // Validate each branch
  for (const branch of node.branches) {
    for (const childNode of branch) {
      errors.push(...validateNode(childNode));
    }
  }

  return errors;
}

/**
 * Validate checkpoint node structure.
 */
function validateCheckpointNode(node: CheckpointNode): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!node.prompt || node.prompt.trim() === '') {
    errors.push(
      createError(
        'VALID_MISSING_REQUIRED_FIELD',
        `Checkpoint node "${node.id}" is missing required "prompt" attribute`,
        node.loc,
        ['Add prompt="Please review and approve" to describe the checkpoint']
      )
    );
  }

  // Validate timeout if present
  if (node.timeout !== undefined && node.timeout <= 0) {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Checkpoint node "${node.id}" has invalid timeout: ${node.timeout}`,
        node.loc,
        ['timeout must be a positive integer (seconds)']
      )
    );
  }

  // Validate defaultAction if present
  if (node.defaultAction && node.defaultAction !== 'approve' && node.defaultAction !== 'reject') {
    errors.push(
      createError(
        'VALID_INVALID_FIELD_TYPE',
        `Checkpoint node "${node.id}" has invalid default action: ${node.defaultAction}`,
        node.loc,
        ['default must be "approve" or "reject"']
      )
    );
  }

  return errors;
}
