/**
 * XML Body Parser
 *
 * Parses XML body from .flow.md files into AST nodes.
 * Uses fast-xml-parser with processEntities: false to prevent XXE injection.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  NodeAST,
  SourceNode,
  TransformNode,
  SinkNode,
  BranchNode,
  BranchCase,
  IfNode,
  LoopNode,
  WhileNode,
  ForeachNode,
  ParallelNode,
  CheckpointNode,
  SourceLocation,
} from '../types';
import { createError, type ValidationError } from '../types/errors';
import { buildLineOffsets, offsetToPosition, createLocation, findOffset, adjustLocation } from './location';

/**
 * Result type for body parsing.
 */
export type BodyResult =
  | { success: true; nodes: NodeAST[] }
  | { success: false; errors: ValidationError[] };

/**
 * Parsed XML node structure with attributes.
 */
interface ParsedXMLNode {
  ':@'?: Record<string, string | number | boolean>;
  '#text'?: string;
  [key: string]: unknown;
}

/**
 * Create the XML parser with secure configuration.
 * processEntities: false prevents XXE injection attacks.
 */
function createXMLParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    preserveOrder: true,
    trimValues: true,
    // Security: Prevent XXE injection
    processEntities: false,
    // Allow CDATA sections for code blocks
    cdataPropName: '__cdata',
    // Don't parse text content as number/boolean
    parseTagValue: false,
    parseAttributeValue: false,
  });
}

/**
 * Parse XML body into AST nodes.
 *
 * @param xml - Raw XML body content
 * @param bodyLineOffset - Line number where body starts in original file
 * @param bodyByteOffset - Byte offset where body starts in original file
 * @param fullSource - Full source content for error location tracking
 */
export function parseBody(
  xml: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullSource: string
): BodyResult {
  const parser = createXMLParser();
  const fullLineOffsets = buildLineOffsets(fullSource);
  const bodyLineOffsets = buildLineOffsets(xml);

  let parsed: unknown[];

  try {
    parsed = parser.parse(xml);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract line/column from error message
    const lineMatch = errorMessage.match(/line[:\s]+(\d+)/i);
    const colMatch = errorMessage.match(/col(?:umn)?[:\s]+(\d+)/i);
    const errorLine = lineMatch && lineMatch[1] ? parseInt(lineMatch[1], 10) : 1;
    const errorCol = colMatch && colMatch[1] ? parseInt(colMatch[1], 10) : 0;

    // Adjust for body offset
    const actualLine = errorLine + bodyLineOffset;

    return {
      success: false,
      errors: [
        createError(
          'PARSE_XML_INVALID',
          `Invalid XML in body: ${errorMessage}`,
          {
            start: { line: actualLine, column: errorCol, offset: bodyByteOffset },
            end: { line: actualLine, column: errorCol, offset: bodyByteOffset },
          },
          ['Check XML syntax', 'Ensure all tags are properly closed']
        ),
      ],
    };
  }

  // Validate we have a root workflow element
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      success: false,
      errors: [
        createError(
          'PARSE_XML_INVALID',
          'XML body must contain a <workflow> root element',
          createLocation(bodyByteOffset, bodyByteOffset, fullLineOffsets),
          ['Wrap nodes in <workflow>...</workflow>']
        ),
      ],
    };
  }

  // Find the workflow element
  const workflowEntry = parsed.find(
    (entry): entry is ParsedXMLNode => typeof entry === 'object' && entry !== null && 'workflow' in entry
  );

  if (!workflowEntry) {
    return {
      success: false,
      errors: [
        createError(
          'PARSE_XML_INVALID',
          'XML body must contain a <workflow> root element',
          createLocation(bodyByteOffset, bodyByteOffset, fullLineOffsets),
          ['Wrap nodes in <workflow>...</workflow>']
        ),
      ],
    };
  }

  // Parse children of workflow element
  const workflowChildren = workflowEntry.workflow;
  if (!Array.isArray(workflowChildren)) {
    return { success: true, nodes: [] };
  }

  const nodes: NodeAST[] = [];
  const errors: ValidationError[] = [];

  for (const child of workflowChildren) {
    const result = parseNode(child, xml, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    if (result.success) {
      nodes.push(result.node);
    } else {
      errors.push(...result.errors);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, nodes };
}

/**
 * Result type for single node parsing.
 */
type NodeResult =
  | { success: true; node: NodeAST }
  | { success: false; errors: ValidationError[] };

/**
 * Parse a single XML node into an AST node.
 */
function parseNode(
  xmlNode: unknown,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  if (typeof xmlNode !== 'object' || xmlNode === null) {
    return {
      success: false,
      errors: [
        createError(
          'PARSE_XML_INVALID',
          'Invalid XML node structure',
          createLocation(bodyByteOffset, bodyByteOffset, fullLineOffsets)
        ),
      ],
    };
  }

  const entry = xmlNode as ParsedXMLNode;

  // Find the tag name (first key that's not ':@' or '#text')
  const tagName = Object.keys(entry).find(k => k !== ':@' && k !== '#text');

  if (!tagName) {
    // Skip text-only nodes
    return {
      success: false,
      errors: [],
    };
  }

  // Get attributes from ':@' property
  const attrs = entry[':@'] || {};
  const id = String(attrs.id || '');

  // Find location in source
  const loc = findNodeLocation(tagName, id, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets);

  // Validate required id attribute
  if (!id) {
    return {
      success: false,
      errors: [
        createError(
          'VALID_MISSING_REQUIRED_FIELD',
          `<${tagName}> requires an "id" attribute`,
          loc,
          [`Add id="unique-id" to the <${tagName}> element`]
        ),
      ],
    };
  }

  // Parse based on tag name
  switch (tagName) {
    case 'source':
      return parseSourceNode(entry, tagName, id, attrs, loc);
    case 'transform':
      return parseTransformNode(entry, tagName, id, attrs, loc);
    case 'sink':
      return parseSinkNode(entry, tagName, id, attrs, loc);
    case 'branch':
      return parseBranchNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'if':
      return parseIfNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'loop':
      return parseLoopNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'while':
      return parseWhileNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'foreach':
      return parseForeachNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'parallel':
      return parseParallelNode(entry, tagName, id, attrs, loc, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
    case 'checkpoint':
      return parseCheckpointNode(entry, tagName, id, attrs, loc);
    default:
      return {
        success: false,
        errors: [
          createError(
            'VALID_UNKNOWN_NODE_TYPE',
            `Unknown node type: <${tagName}>`,
            loc,
            ['Valid node types: source, transform, sink, branch, if, loop, while, foreach, parallel, checkpoint']
          ),
        ],
      };
  }
}

/**
 * Find the source location of a node by searching for its tag in the source.
 */
function findNodeLocation(
  tagName: string,
  id: string,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[]
): SourceLocation {
  // Try to find the specific tag with id
  const searchPattern = id ? `<${tagName}` : `<${tagName}`;
  let offset = findOffset(bodySource, searchPattern);

  // If we have an id, try to find the specific instance
  if (id && offset !== -1) {
    // Look for the tag with matching id
    let searchStart = 0;
    while (offset !== -1) {
      const tagEnd = bodySource.indexOf('>', offset);
      if (tagEnd !== -1) {
        const tagContent = bodySource.slice(offset, tagEnd + 1);
        if (tagContent.includes(`id="${id}"`) || tagContent.includes(`id='${id}'`)) {
          break;
        }
      }
      searchStart = offset + 1;
      offset = findOffset(bodySource, searchPattern, searchStart);
    }
  }

  if (offset === -1) {
    offset = 0;
  }

  // Calculate position in body
  const bodyLineOffsets = buildLineOffsets(bodySource);
  const bodyPos = offsetToPosition(offset, bodyLineOffsets);

  // Adjust for full file offset
  return {
    start: {
      line: bodyPos.line + bodyLineOffset,
      column: bodyPos.column,
      offset: offset + bodyByteOffset,
    },
    end: {
      line: bodyPos.line + bodyLineOffset,
      column: bodyPos.column + tagName.length + 1, // approximate
      offset: offset + bodyByteOffset + tagName.length + 1,
    },
  };
}

/**
 * Parse a <source> node.
 */
function parseSourceNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation
): NodeResult {
  const sourceType = String(attrs.type || 'http');
  if (sourceType !== 'http' && sourceType !== 'file') {
    return {
      success: false,
      errors: [
        createError(
          'VALID_INVALID_FIELD_TYPE',
          `Source type must be "http" or "file", got "${sourceType}"`,
          loc,
          ['Use type="http" or type="file"']
        ),
      ],
    };
  }

  // Extract config from attributes (excluding id, type)
  const config = extractConfig(attrs, ['id', 'type', 'input']);

  const node: SourceNode = {
    type: 'source',
    id,
    loc,
    sourceType,
    config,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <transform> node.
 */
function parseTransformNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation
): NodeResult {
  const transformType = String(attrs.type || 'template');
  if (!['ai', 'template', 'map', 'filter'].includes(transformType)) {
    return {
      success: false,
      errors: [
        createError(
          'VALID_INVALID_FIELD_TYPE',
          `Transform type must be "ai", "template", "map", or "filter", got "${transformType}"`,
          loc,
          ['Use type="ai", type="template", type="map", or type="filter"']
        ),
      ],
    };
  }

  const config = extractConfig(attrs, ['id', 'type', 'input']);

  // Get template content from children if present
  const children = entry[tagName];
  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === 'object' && child !== null) {
        const textChild = child as ParsedXMLNode;
        if (textChild['#text']) {
          config.template = String(textChild['#text']);
        }
      }
    }
  }

  const node: TransformNode = {
    type: 'transform',
    id,
    loc,
    transformType: transformType as 'ai' | 'template' | 'map' | 'filter',
    config,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <sink> node.
 */
function parseSinkNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation
): NodeResult {
  const sinkType = String(attrs.type || 'http');
  if (sinkType !== 'http' && sinkType !== 'file') {
    return {
      success: false,
      errors: [
        createError(
          'VALID_INVALID_FIELD_TYPE',
          `Sink type must be "http" or "file", got "${sinkType}"`,
          loc,
          ['Use type="http" or type="file"']
        ),
      ],
    };
  }

  const config = extractConfig(attrs, ['id', 'type', 'input']);

  const node: SinkNode = {
    type: 'sink',
    id,
    loc,
    sinkType,
    config,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <branch> node with multiple cases.
 */
function parseBranchNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const children = entry[tagName];
  const cases: BranchCase[] = [];
  let defaultNodes: NodeAST[] | undefined;
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child !== 'object' || child === null) continue;
      const childEntry = child as ParsedXMLNode;

      if ('case' in childEntry) {
        const caseAttrs = childEntry[':@'] || {};
        const condition = String(caseAttrs.when || '');
        const caseLoc = findNodeLocation('case', '', bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets);

        const caseChildren = childEntry.case;
        const caseNodes: NodeAST[] = [];

        if (Array.isArray(caseChildren)) {
          for (const caseChild of caseChildren) {
            const result = parseNode(caseChild, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
            if (result.success) {
              caseNodes.push(result.node);
            } else if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        }

        cases.push({ condition, nodes: caseNodes, loc: caseLoc });
      } else if ('default' in childEntry) {
        const defaultChildren = childEntry.default;
        defaultNodes = [];

        if (Array.isArray(defaultChildren)) {
          for (const defaultChild of defaultChildren) {
            const result = parseNode(defaultChild, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
            if (result.success) {
              defaultNodes.push(result.node);
            } else if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: BranchNode = {
    type: 'branch',
    id,
    loc,
    cases,
    default: defaultNodes,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse an <if> node.
 */
function parseIfNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const condition = String(attrs.condition || '');
  const children = entry[tagName];
  const thenNodes: NodeAST[] = [];
  let elseNodes: NodeAST[] | undefined;
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child !== 'object' || child === null) continue;
      const childEntry = child as ParsedXMLNode;

      if ('then' in childEntry) {
        const thenChildren = childEntry.then;
        if (Array.isArray(thenChildren)) {
          for (const thenChild of thenChildren) {
            const result = parseNode(thenChild, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
            if (result.success) {
              thenNodes.push(result.node);
            } else if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        }
      } else if ('else' in childEntry) {
        elseNodes = [];
        const elseChildren = childEntry.else;
        if (Array.isArray(elseChildren)) {
          for (const elseChild of elseChildren) {
            const result = parseNode(elseChild, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
            if (result.success) {
              elseNodes.push(result.node);
            } else if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: IfNode = {
    type: 'if',
    id,
    loc,
    condition,
    then: thenNodes,
    else: elseNodes,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <loop> node.
 */
function parseLoopNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const maxIterations = attrs.max ? parseInt(String(attrs.max), 10) : undefined;
  const breakCondition = attrs.break ? String(attrs.break) : undefined;
  const children = entry[tagName];
  const bodyNodes: NodeAST[] = [];
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      const result = parseNode(child, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
      if (result.success) {
        bodyNodes.push(result.node);
      } else if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: LoopNode = {
    type: 'loop',
    id,
    loc,
    maxIterations,
    breakCondition,
    body: bodyNodes,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <while> node.
 */
function parseWhileNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const condition = String(attrs.condition || '');
  const children = entry[tagName];
  const bodyNodes: NodeAST[] = [];
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      const result = parseNode(child, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
      if (result.success) {
        bodyNodes.push(result.node);
      } else if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: WhileNode = {
    type: 'while',
    id,
    loc,
    condition,
    body: bodyNodes,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <foreach> node.
 */
function parseForeachNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const collection = String(attrs.collection || '');
  const itemVar = String(attrs.item || 'item');
  const maxConcurrency = attrs.concurrency ? parseInt(String(attrs.concurrency), 10) : undefined;
  const children = entry[tagName];
  const bodyNodes: NodeAST[] = [];
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      const result = parseNode(child, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
      if (result.success) {
        bodyNodes.push(result.node);
      } else if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: ForeachNode = {
    type: 'foreach',
    id,
    loc,
    collection,
    itemVar,
    maxConcurrency,
    body: bodyNodes,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <parallel> node.
 */
function parseParallelNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation,
  bodySource: string,
  bodyLineOffset: number,
  bodyByteOffset: number,
  fullLineOffsets: number[],
  bodyLineOffsets: number[]
): NodeResult {
  const children = entry[tagName];
  const branches: NodeAST[][] = [];
  const errors: ValidationError[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child !== 'object' || child === null) continue;
      const childEntry = child as ParsedXMLNode;

      if ('branch' in childEntry) {
        const branchChildren = childEntry.branch;
        const branchNodes: NodeAST[] = [];

        if (Array.isArray(branchChildren)) {
          for (const branchChild of branchChildren) {
            const result = parseNode(branchChild, bodySource, bodyLineOffset, bodyByteOffset, fullLineOffsets, bodyLineOffsets);
            if (result.success) {
              branchNodes.push(result.node);
            } else if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        }

        branches.push(branchNodes);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const node: ParallelNode = {
    type: 'parallel',
    id,
    loc,
    branches,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Parse a <checkpoint> node.
 */
function parseCheckpointNode(
  entry: ParsedXMLNode,
  tagName: string,
  id: string,
  attrs: Record<string, string | number | boolean>,
  loc: SourceLocation
): NodeResult {
  const prompt = String(attrs.prompt || '');
  const timeout = attrs.timeout ? parseInt(String(attrs.timeout), 10) : undefined;
  const defaultAction = attrs.default === 'approve' || attrs.default === 'reject'
    ? attrs.default
    : undefined;

  const node: CheckpointNode = {
    type: 'checkpoint',
    id,
    loc,
    prompt,
    timeout,
    defaultAction,
    input: attrs.input ? String(attrs.input) : undefined,
  };

  return { success: true, node };
}

/**
 * Extract config from attributes, excluding specified keys.
 */
function extractConfig(
  attrs: Record<string, string | number | boolean>,
  excludeKeys: string[]
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attrs)) {
    if (!excludeKeys.includes(key)) {
      config[key] = value;
    }
  }

  return config;
}
