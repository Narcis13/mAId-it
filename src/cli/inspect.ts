/**
 * CLI Inspect Command
 *
 * Implements the `flowscript inspect <file>` command.
 * Parses a workflow and displays its structure, dependencies, and schemas.
 */

import chalk from 'chalk';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { buildDependencyGraph } from '../scheduler/dag';
import type {
  NodeAST,
  SourceNode,
  TransformNode,
  SinkNode,
  WorkflowAST,
  IncludeNode,
  CallNode,
} from '../types/ast';
import {
  formatParseErrors,
  formatFileNotFound,
  type FormatOptions,
} from './format';

// ============================================================================
// Types
// ============================================================================

export interface InspectOptions {
  /** Show dependency graph */
  deps?: boolean;
  /** Show input/output schemas */
  schema?: boolean;
  /** Output format */
  format?: 'text' | 'json';
  /** Disable colored output */
  noColor?: boolean;
}

export interface InspectResult {
  success: boolean;
  output: string;
}

// ============================================================================
// Main Function
// ============================================================================

export async function inspectWorkflow(
  filePath: string,
  options: InspectOptions = {}
): Promise<InspectResult> {
  const formatOpts: FormatOptions = {
    color: !options.noColor,
    format: options.format || 'text',
  };
  const c = formatOpts.color ? chalk : new chalk.Instance({ level: 0 });

  // Check if file exists
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    return {
      success: false,
      output: formatFileNotFound(filePath, formatOpts),
    };
  }

  const source = await file.text();

  // Parse
  const parseResult = await parseFile(filePath);
  if (!parseResult.success) {
    return {
      success: false,
      output: formatParseErrors(parseResult.errors, source, filePath, formatOpts),
    };
  }

  const ast = parseResult.data;

  // JSON mode
  if (options.format === 'json') {
    const json = buildJsonInspection(ast, options);
    return {
      success: true,
      output: JSON.stringify(json, null, 2),
    };
  }

  // Text mode
  let output = '';

  // Header
  output += c.cyan.bold('Workflow Inspection') + '\n';
  output += c.gray('─'.repeat(50)) + '\n\n';

  // Metadata
  output += c.bold('Name:') + ` ${ast.metadata.name}\n`;
  output += c.bold('Version:') + ` ${ast.metadata.version}\n`;
  if (ast.metadata.description) {
    output += c.bold('Description:') + ` ${ast.metadata.description}\n`;
  }
  if (ast.metadata.trigger) {
    output += c.bold('Trigger:') + ` ${ast.metadata.trigger.type}\n`;
  }
  output += c.bold('Nodes:') + ` ${ast.nodes.length}\n`;
  output += '\n';

  // Node listing
  output += c.bold('Nodes:') + '\n';
  for (const node of ast.nodes) {
    output += formatNodeLine(node, c);
  }
  output += '\n';

  // Dependency graph
  if (options.deps) {
    output += c.bold('Dependencies:') + '\n';
    const deps = buildDependencyGraph(ast.nodes);
    const hasDeps = Array.from(deps.values()).some(s => s.size > 0);

    if (!hasDeps) {
      output += `  ${c.dim('(no dependencies — all nodes run in wave 1)')}\n`;
    } else {
      for (const [nodeId, depSet] of deps) {
        if (depSet.size > 0) {
          const depStr = Array.from(depSet).join(', ');
          output += `  ${c.cyan(nodeId)} ${c.dim('←')} ${depStr}\n`;
        } else {
          output += `  ${c.cyan(nodeId)} ${c.dim('(no deps)')}\n`;
        }
      }
    }
    output += '\n';
  }

  // Schemas
  if (options.schema) {
    output += c.bold('Config Schema:') + '\n';
    const configSchema = ast.metadata.config;
    if (configSchema && Object.keys(configSchema).length > 0) {
      for (const [key, field] of Object.entries(configSchema)) {
        const required = field.required ? c.red('*') : ' ';
        const defaultStr = field.default !== undefined
          ? c.dim(` (default: ${JSON.stringify(field.default)})`)
          : '';
        output += `  ${required}${c.yellow(key)}: ${field.type}${defaultStr}\n`;
        if (field.description) {
          output += `    ${c.dim(field.description)}\n`;
        }
      }
    } else {
      output += `  ${c.dim('(no config schema)')}\n`;
    }
    output += '\n';

    output += c.bold('Secrets:') + '\n';
    const secrets = ast.metadata.secrets;
    if (secrets && secrets.length > 0) {
      for (const name of secrets) {
        output += `  ${c.yellow(name)}\n`;
      }
    } else {
      output += `  ${c.dim('(no secrets declared)')}\n`;
    }
    output += '\n';
  }

  // Validation summary
  const validationResult = validate(ast);
  if (!validationResult.valid) {
    const errorCount = validationResult.errors.filter(e => e.severity === 'error').length;
    const warnCount = validationResult.errors.filter(e => e.severity === 'warning').length;
    output += c.yellow.bold('Validation Issues:') + '\n';
    if (errorCount > 0) output += `  ${c.red(`${errorCount} error(s)`)}\n`;
    if (warnCount > 0) output += `  ${c.yellow(`${warnCount} warning(s)`)}\n`;
    for (const error of validationResult.errors) {
      const icon = error.severity === 'error' ? c.red('✗') : c.yellow('⚠');
      output += `  ${icon} ${error.message}\n`;
    }
  } else {
    output += c.green('✓ Validation passed') + '\n';
  }

  return { success: true, output };
}

// ============================================================================
// Helpers
// ============================================================================

function formatNodeLine(node: NodeAST, c: chalk.Chalk): string {
  const typeDisplay = getNodeTypeDisplay(node);
  const inputStr = node.input ? c.dim(` ← ${node.input}`) : '';
  return `  ${c.gray('•')} ${c.bold(node.id)} ${c.dim(`(${typeDisplay})`)}${inputStr}\n`;
}

function getNodeTypeDisplay(node: NodeAST): string {
  switch (node.type) {
    case 'source':
      return `source:${(node as SourceNode).sourceType}`;
    case 'sink':
      return `sink:${(node as SinkNode).sinkType}`;
    case 'transform':
      return `transform:${(node as TransformNode).transformType}`;
    case 'include':
      return `include:${(node as IncludeNode).workflow}`;
    case 'call':
      return `call:${(node as CallNode).workflow}`;
    default:
      return node.type;
  }
}

function buildJsonInspection(
  ast: WorkflowAST,
  options: InspectOptions
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    metadata: ast.metadata,
    nodes: ast.nodes.map(n => ({
      id: n.id,
      type: n.type,
      ...(getNodeSubType(n) ? { subType: getNodeSubType(n) } : {}),
      ...(n.input ? { input: n.input } : {}),
    })),
  };

  if (options.deps) {
    const deps = buildDependencyGraph(ast.nodes);
    const depsObj: Record<string, string[]> = {};
    for (const [nodeId, depSet] of deps) {
      depsObj[nodeId] = Array.from(depSet);
    }
    result.dependencies = depsObj;
  }

  if (options.schema) {
    result.configSchema = ast.metadata.config || {};
    result.secrets = ast.metadata.secrets || [];
  }

  return result;
}

function getNodeSubType(node: NodeAST): string | undefined {
  switch (node.type) {
    case 'source': return (node as SourceNode).sourceType;
    case 'sink': return (node as SinkNode).sinkType;
    case 'transform': return (node as TransformNode).transformType;
    default: return undefined;
  }
}
