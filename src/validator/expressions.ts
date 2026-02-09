/**
 * Expression Syntax Validation Pass
 *
 * Walks the AST and parses (but does not evaluate) all template expressions.
 * Catches syntax errors at validation time rather than during execution.
 */

import type { WorkflowAST, NodeAST, ValidationError } from '../types';
import { extractTemplateSegments, parseExpression } from '../expression';

/**
 * Validate all template expressions in the workflow AST.
 * Extracts template strings from node configs, conditions, and other
 * expression-bearing fields, then attempts to parse each one.
 */
export function validateExpressions(ast: WorkflowAST): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of ast.nodes) {
    validateNodeExpressions(node, errors);
  }

  return errors;
}

function validateNodeExpressions(
  node: NodeAST,
  errors: ValidationError[]
): void {
  // Collect all expression-bearing strings from this node
  const templates: Array<{ value: string; field: string }> = [];

  switch (node.type) {
    case 'source':
    case 'sink':
    case 'transform':
      collectConfigTemplates(node.config, `${node.id}.config`, templates);
      break;

    case 'if':
      templates.push({ value: node.condition, field: `${node.id}.condition` });
      for (const child of node.then) validateNodeExpressions(child, errors);
      if (node.else) {
        for (const child of node.else) validateNodeExpressions(child, errors);
      }
      break;

    case 'branch':
      for (const c of node.cases) {
        templates.push({ value: c.condition, field: `${node.id}.case.condition` });
        for (const child of c.nodes) validateNodeExpressions(child, errors);
      }
      if (node.default) {
        for (const child of node.default) validateNodeExpressions(child, errors);
      }
      break;

    case 'loop':
      if (node.breakCondition) {
        templates.push({ value: node.breakCondition, field: `${node.id}.breakCondition` });
      }
      for (const child of node.body) validateNodeExpressions(child, errors);
      break;

    case 'while':
      templates.push({ value: node.condition, field: `${node.id}.condition` });
      for (const child of node.body) validateNodeExpressions(child, errors);
      break;

    case 'foreach':
      templates.push({ value: node.collection, field: `${node.id}.collection` });
      for (const child of node.body) validateNodeExpressions(child, errors);
      break;

    case 'parallel':
      for (const branch of node.branches) {
        for (const child of branch) validateNodeExpressions(child, errors);
      }
      break;

    case 'checkpoint':
      templates.push({ value: node.prompt, field: `${node.id}.prompt` });
      break;

    case 'phase':
      for (const child of node.children) validateNodeExpressions(child, errors);
      break;

    case 'context':
      for (const entry of node.entries) {
        templates.push({ value: entry.value, field: `${node.id}.context.${entry.key}` });
      }
      break;

    case 'set':
      templates.push({ value: node.value, field: `${node.id}.value` });
      break;

    case 'delay':
      templates.push({ value: node.duration, field: `${node.id}.duration` });
      break;

    case 'timeout':
      templates.push({ value: node.duration, field: `${node.id}.duration` });
      for (const child of node.children) validateNodeExpressions(child, errors);
      break;
  }

  // Also check the error config retry condition
  if (node.errorConfig?.retry?.when) {
    templates.push({ value: node.errorConfig.retry.when, field: `${node.id}.on-error.retry.when` });
  }

  // Validate each template expression
  for (const t of templates) {
    validateTemplate(t.value, t.field, node, errors);
  }
}

function validateTemplate(
  template: string,
  field: string,
  node: NodeAST,
  errors: ValidationError[]
): void {
  if (!template || typeof template !== 'string') return;

  // Only validate strings that contain template expressions
  if (!template.includes('{{')) return;

  const segments = extractTemplateSegments(template);
  for (const seg of segments) {
    if (seg.type !== 'expression') continue;

    try {
      parseExpression(seg.value);
    } catch (e) {
      errors.push({
        message: `Invalid expression syntax in ${field}: {{${seg.value}}} — ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
        code: 'EXPR_PARSE_ERROR',
        loc: node.loc,
      });
    }
  }
}

/**
 * Recursively collect template strings from a config object.
 */
function collectConfigTemplates(
  config: Record<string, unknown>,
  prefix: string,
  templates: Array<{ value: string; field: string }>
): void {
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      templates.push({ value, field: `${prefix}.${key}` });
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      collectConfigTemplates(value as Record<string, unknown>, `${prefix}.${key}`, templates);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          templates.push({ value: value[i] as string, field: `${prefix}.${key}[${i}]` });
        }
      }
    }
  }
}
