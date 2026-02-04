/**
 * Type Compatibility Validator
 *
 * Validates that AI node output schemas are compatible with downstream
 * node input expectations. Produces warnings (not errors) since types
 * are resolved at runtime and may still work despite static mismatches.
 */

import type { WorkflowAST, NodeAST, TransformNode, ValidationError } from '../types';
import { createWarning } from '../types/errors';
import { parseSchemaDSL, SchemaDSLError } from '../runtimes/ai/schema-dsl';
import { z } from 'zod';

/**
 * Validate type compatibility between AI nodes and their consumers.
 *
 * For each AI node with an output-schema:
 * 1. Find nodes that reference this AI node's output
 * 2. Check if the consumer has type expectations (via input attribute patterns)
 * 3. Warn if there's a potential mismatch
 *
 * @param ast - The parsed workflow AST
 * @returns Array of validation warnings
 */
export function validateTypeCompatibility(ast: WorkflowAST): ValidationError[] {
  const warnings: ValidationError[] = [];

  // Find all AI transform nodes with output schemas
  const aiNodes = findAINodesWithSchema(ast.nodes);

  for (const aiNode of aiNodes) {
    const outputSchema = aiNode.config['output-schema'];
    if (typeof outputSchema !== 'string') continue;

    // Parse the output schema
    let parsedSchema: z.ZodType;
    try {
      parsedSchema = parseSchemaDSL(outputSchema);
    } catch (e) {
      if (e instanceof SchemaDSLError) {
        warnings.push(
          createWarning(
            'VALID_INVALID_SCHEMA',
            `AI node "${aiNode.id}" has invalid output-schema: ${e.message}`,
            aiNode.loc,
            ['Check the output-schema syntax follows TypeScript-like DSL']
          )
        );
      }
      continue;
    }

    // Find consumers of this AI node
    const consumers = findConsumers(aiNode.id, ast.nodes);

    for (const consumer of consumers) {
      // Check if consumer has field access patterns that might fail
      const inputRef = consumer.input;
      if (!inputRef) continue;

      // Extract field access from input reference (e.g., "{{aiNode.output.field}}")
      const fieldAccess = extractFieldAccess(inputRef, aiNode.id);
      if (!fieldAccess) continue;

      // Validate the field exists in the output schema
      const compatibility = checkFieldCompatibility(parsedSchema, fieldAccess);
      if (!compatibility.compatible) {
        warnings.push(
          createWarning(
            'VALID_TYPE_MISMATCH',
            `Node "${consumer.id}" accesses "${fieldAccess}" from AI node "${aiNode.id}", ` +
            `but output-schema "${outputSchema}" ${compatibility.reason}`,
            consumer.loc,
            [
              `Update the output-schema to include the "${fieldAccess}" field`,
              `Or update the input reference to use an existing field`
            ]
          )
        );
      }
    }
  }

  return warnings;
}

/**
 * Build a map of node ID to node for quick lookup.
 */
function buildNodeMap(nodes: NodeAST[]): Map<string, NodeAST> {
  const map = new Map<string, NodeAST>();

  function addNodes(nodeList: NodeAST[]) {
    for (const node of nodeList) {
      map.set(node.id, node);

      // Recurse into control flow nodes
      if ('body' in node && Array.isArray(node.body)) {
        addNodes(node.body);
      }
      if ('then' in node && Array.isArray(node.then)) {
        addNodes(node.then);
      }
      if ('else' in node && Array.isArray(node.else)) {
        addNodes(node.else);
      }
      if ('cases' in node) {
        for (const c of node.cases) {
          addNodes(c.nodes);
        }
        if (node.default) {
          addNodes(node.default);
        }
      }
      if ('branches' in node) {
        for (const branch of node.branches) {
          addNodes(branch);
        }
      }
    }
  }

  addNodes(nodes);
  return map;
}

/**
 * Find all AI transform nodes that have output-schema defined.
 */
function findAINodesWithSchema(nodes: NodeAST[]): TransformNode[] {
  const aiNodes: TransformNode[] = [];

  function search(nodeList: NodeAST[]) {
    for (const node of nodeList) {
      if (
        node.type === 'transform' &&
        node.transformType === 'ai' &&
        node.config['output-schema']
      ) {
        aiNodes.push(node);
      }

      // Recurse into control flow nodes
      if ('body' in node && Array.isArray(node.body)) {
        search(node.body);
      }
      if ('then' in node && Array.isArray(node.then)) {
        search(node.then);
      }
      if ('else' in node && Array.isArray(node.else)) {
        search(node.else);
      }
      if ('cases' in node) {
        for (const c of node.cases) {
          search(c.nodes);
        }
        if (node.default) {
          search(node.default);
        }
      }
      if ('branches' in node) {
        for (const branch of node.branches) {
          search(branch);
        }
      }
    }
  }

  search(nodes);
  return aiNodes;
}

/**
 * Find all nodes that consume output from a given node ID.
 */
function findConsumers(nodeId: string, nodes: NodeAST[]): NodeAST[] {
  const consumers: NodeAST[] = [];
  const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(nodeId)}\\b`);

  function search(nodeList: NodeAST[]) {
    for (const node of nodeList) {
      // Check input attribute
      if (node.input && pattern.test(node.input)) {
        consumers.push(node);
      }

      // Check config values for template references
      if ('config' in node) {
        for (const value of Object.values(node.config)) {
          if (typeof value === 'string' && pattern.test(value)) {
            consumers.push(node);
            break;
          }
        }
      }

      // Recurse into control flow nodes
      if ('body' in node && Array.isArray(node.body)) {
        search(node.body);
      }
      if ('then' in node && Array.isArray(node.then)) {
        search(node.then);
      }
      if ('else' in node && Array.isArray(node.else)) {
        search(node.else);
      }
      if ('cases' in node) {
        for (const c of node.cases) {
          search(c.nodes);
        }
        if (node.default) {
          search(node.default);
        }
      }
      if ('branches' in node) {
        for (const branch of node.branches) {
          search(branch);
        }
      }
    }
  }

  search(nodes);
  return consumers;
}

/**
 * Extract field access path from an input reference.
 *
 * For "{{nodeId.output.field.nested}}" returns "field.nested"
 * For "{{nodeId}}" returns null (whole object reference)
 */
function extractFieldAccess(inputRef: string, nodeId: string): string | null {
  // Match patterns like {{nodeId.field}} or {{nodeId.output.field}}
  const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(nodeId)}\\.(?:output\\.)?([\\w.]+)\\s*\\}\\}`);
  const match = inputRef.match(pattern);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Check if a field path is compatible with a Zod schema.
 */
function checkFieldCompatibility(
  schema: z.ZodType,
  fieldPath: string
): { compatible: boolean; reason?: string } {
  const fields = fieldPath.split('.');

  let current: z.ZodType = schema;

  for (const field of fields) {
    // Check if current is an object type
    if (!(current instanceof z.ZodObject)) {
      return {
        compatible: false,
        reason: `does not define field "${field}" (not an object type)`
      };
    }

    // Get the shape of the object
    const shape = current.shape;
    if (!(field in shape)) {
      return {
        compatible: false,
        reason: `does not include field "${field}"`
      };
    }

    current = shape[field];
  }

  return { compatible: true };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
