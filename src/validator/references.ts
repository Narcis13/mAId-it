/**
 * Reference Validator
 *
 * Validates references within the workflow:
 * - Node references (input attributes) resolve to defined nodes
 * - Secret references are declared in frontmatter
 * - No duplicate node IDs within scope
 */

import type {
  WorkflowAST,
  NodeAST,
  BranchNode,
  IfNode,
  LoopNode,
  WhileNode,
  ForeachNode,
  ParallelNode,
} from '../types';
import { createError, type ValidationError } from '../types/errors';

/**
 * Validate all references within the workflow.
 *
 * @param ast - The parsed workflow AST
 * @returns Array of validation errors (empty if valid)
 */
export function validateReferences(ast: WorkflowAST): ValidationError[] {
  const errors: ValidationError[] = [];

  // Collect all defined node IDs
  const nodeIds = new Map<string, NodeAST>();
  collectNodeIds(ast.nodes, nodeIds, errors);

  // Validate node references
  errors.push(...validateNodeReferences(ast.nodes, nodeIds));

  // Validate secret references
  const declaredSecrets = new Set(ast.metadata.secrets || []);
  errors.push(...validateSecretReferences(ast.nodes, declaredSecrets));

  return errors;
}

/**
 * Recursively collect all node IDs and check for duplicates.
 */
function collectNodeIds(
  nodes: NodeAST[],
  nodeIds: Map<string, NodeAST>,
  errors: ValidationError[]
): void {
  for (const node of nodes) {
    // Check for duplicate ID
    const existing = nodeIds.get(node.id);
    if (existing) {
      errors.push(
        createError(
          'VALID_DUPLICATE_NODE_ID',
          `Duplicate node ID "${node.id}"`,
          node.loc,
          [
            `Another node with ID "${node.id}" exists at line ${existing.loc.start.line}`,
            'Each node must have a unique ID within the workflow'
          ]
        )
      );
    } else {
      nodeIds.set(node.id, node);
    }

    // Recursively collect from child nodes
    collectChildNodeIds(node, nodeIds, errors);
  }
}

/**
 * Collect node IDs from child nodes based on node type.
 */
function collectChildNodeIds(
  node: NodeAST,
  nodeIds: Map<string, NodeAST>,
  errors: ValidationError[]
): void {
  switch (node.type) {
    case 'branch': {
      const branchNode = node as BranchNode;
      for (const branchCase of branchNode.cases) {
        collectNodeIds(branchCase.nodes, nodeIds, errors);
      }
      if (branchNode.default) {
        collectNodeIds(branchNode.default, nodeIds, errors);
      }
      break;
    }
    case 'if': {
      const ifNode = node as IfNode;
      collectNodeIds(ifNode.then, nodeIds, errors);
      if (ifNode.else) {
        collectNodeIds(ifNode.else, nodeIds, errors);
      }
      break;
    }
    case 'loop': {
      const loopNode = node as LoopNode;
      collectNodeIds(loopNode.body, nodeIds, errors);
      break;
    }
    case 'while': {
      const whileNode = node as WhileNode;
      collectNodeIds(whileNode.body, nodeIds, errors);
      break;
    }
    case 'foreach': {
      const foreachNode = node as ForeachNode;
      collectNodeIds(foreachNode.body, nodeIds, errors);
      break;
    }
    case 'parallel': {
      const parallelNode = node as ParallelNode;
      for (const branch of parallelNode.branches) {
        collectNodeIds(branch, nodeIds, errors);
      }
      break;
    }
    // source, transform, sink, checkpoint have no children
    case 'source':
    case 'transform':
    case 'sink':
    case 'checkpoint':
      break;
  }
}

/**
 * Validate all node input references resolve to defined nodes.
 */
function validateNodeReferences(
  nodes: NodeAST[],
  nodeIds: Map<string, NodeAST>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const definedIds = Array.from(nodeIds.keys());

  for (const node of nodes) {
    // Check input reference
    if (node.input) {
      if (!nodeIds.has(node.input)) {
        // Find similar IDs for suggestions
        const suggestions = findSimilarIds(node.input, definedIds);
        const hints = suggestions.length > 0
          ? [`Did you mean: ${suggestions.join(', ')}?`]
          : [`Defined nodes: ${definedIds.join(', ') || 'none'}`];

        errors.push(
          createError(
            'VALID_UNDEFINED_NODE_REF',
            `Node "${node.id}" references undefined node "${node.input}"`,
            node.loc,
            hints
          )
        );
      }
    }

    // Recursively validate child nodes
    errors.push(...validateChildNodeReferences(node, nodeIds));
  }

  return errors;
}

/**
 * Validate references in child nodes.
 */
function validateChildNodeReferences(
  node: NodeAST,
  nodeIds: Map<string, NodeAST>
): ValidationError[] {
  switch (node.type) {
    case 'branch': {
      const branchNode = node as BranchNode;
      const errors: ValidationError[] = [];
      for (const branchCase of branchNode.cases) {
        errors.push(...validateNodeReferences(branchCase.nodes, nodeIds));
      }
      if (branchNode.default) {
        errors.push(...validateNodeReferences(branchNode.default, nodeIds));
      }
      return errors;
    }
    case 'if': {
      const ifNode = node as IfNode;
      const errors = validateNodeReferences(ifNode.then, nodeIds);
      if (ifNode.else) {
        errors.push(...validateNodeReferences(ifNode.else, nodeIds));
      }
      return errors;
    }
    case 'loop': {
      const loopNode = node as LoopNode;
      return validateNodeReferences(loopNode.body, nodeIds);
    }
    case 'while': {
      const whileNode = node as WhileNode;
      return validateNodeReferences(whileNode.body, nodeIds);
    }
    case 'foreach': {
      const foreachNode = node as ForeachNode;
      return validateNodeReferences(foreachNode.body, nodeIds);
    }
    case 'parallel': {
      const parallelNode = node as ParallelNode;
      const errors: ValidationError[] = [];
      for (const branch of parallelNode.branches) {
        errors.push(...validateNodeReferences(branch, nodeIds));
      }
      return errors;
    }
    default:
      return [];
  }
}

/**
 * Find similar node IDs for error suggestions using Levenshtein distance.
 */
function findSimilarIds(target: string, candidates: string[]): string[] {
  const maxDistance = Math.max(2, Math.floor(target.length / 3));
  const similar: Array<{ id: string; distance: number }> = [];

  for (const candidate of candidates) {
    const distance = levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());
    if (distance <= maxDistance) {
      similar.push({ id: candidate, distance });
    }
  }

  // Sort by distance and return top 3
  return similar
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(s => s.id);
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,      // deletion
        matrix[i]![j - 1]! + 1,      // insertion
        matrix[i - 1]![j - 1]! + cost // substitution
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

/**
 * Validate secret references are declared in frontmatter.
 * Looks for patterns like {{secrets.NAME}} or ${{secrets.NAME}} in configs and templates.
 */
function validateSecretReferences(
  nodes: NodeAST[],
  declaredSecrets: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    // Check config values for secret references
    if ('config' in node) {
      const config = (node as { config: Record<string, unknown> }).config;
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string') {
          errors.push(...checkSecretRefs(value, node, declaredSecrets));
        }
      }
    }

    // Recursively check child nodes
    errors.push(...validateChildSecretReferences(node, declaredSecrets));
  }

  return errors;
}

/**
 * Validate secret references in child nodes.
 */
function validateChildSecretReferences(
  node: NodeAST,
  declaredSecrets: Set<string>
): ValidationError[] {
  switch (node.type) {
    case 'branch': {
      const branchNode = node as BranchNode;
      const errors: ValidationError[] = [];
      for (const branchCase of branchNode.cases) {
        errors.push(...validateSecretReferences(branchCase.nodes, declaredSecrets));
      }
      if (branchNode.default) {
        errors.push(...validateSecretReferences(branchNode.default, declaredSecrets));
      }
      return errors;
    }
    case 'if': {
      const ifNode = node as IfNode;
      const errors = validateSecretReferences(ifNode.then, declaredSecrets);
      if (ifNode.else) {
        errors.push(...validateSecretReferences(ifNode.else, declaredSecrets));
      }
      return errors;
    }
    case 'loop': {
      const loopNode = node as LoopNode;
      return validateSecretReferences(loopNode.body, declaredSecrets);
    }
    case 'while': {
      const whileNode = node as WhileNode;
      return validateSecretReferences(whileNode.body, declaredSecrets);
    }
    case 'foreach': {
      const foreachNode = node as ForeachNode;
      return validateSecretReferences(foreachNode.body, declaredSecrets);
    }
    case 'parallel': {
      const parallelNode = node as ParallelNode;
      const errors: ValidationError[] = [];
      for (const branch of parallelNode.branches) {
        errors.push(...validateSecretReferences(branch, declaredSecrets));
      }
      return errors;
    }
    default:
      return [];
  }
}

/**
 * Check a string value for secret references and validate they are declared.
 */
function checkSecretRefs(
  value: string,
  node: NodeAST,
  declaredSecrets: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Match patterns like {{secrets.NAME}} or ${{secrets.NAME}}
  const secretPattern = /\$?\{\{secrets\.(\w+)\}\}/g;
  let match;

  while ((match = secretPattern.exec(value)) !== null) {
    const secretName = match[1];
    if (secretName && !declaredSecrets.has(secretName)) {
      errors.push(
        createError(
          'VALID_UNDEFINED_SECRET_REF',
          `Node "${node.id}" references undeclared secret "${secretName}"`,
          node.loc,
          [
            `Declare the secret in frontmatter: secrets: [${secretName}]`,
            `Currently declared secrets: ${Array.from(declaredSecrets).join(', ') || 'none'}`
          ]
        )
      );
    }
  }

  return errors;
}
