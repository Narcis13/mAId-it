/**
 * Expression Evaluator for FlowScript
 *
 * Sandboxed AST-walking evaluator for expression safety.
 * Blocks prototype chain access and only allows whitelisted function calls.
 */

import type { Expression } from 'jsep';
import { parseExpression } from './parser.ts';
import { ExpressionError, type EvalContext } from './types.ts';

// ============================================================================
// Security Configuration
// ============================================================================

/**
 * Properties blocked for security reasons.
 * These could be used to escape the sandbox or access unsafe globals.
 */
const BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

// ============================================================================
// AST Node Evaluation
// ============================================================================

/**
 * Evaluate a jsep AST node within a given context.
 *
 * This is a recursive function that walks the AST and evaluates each node.
 * Security checks are performed for member access and function calls.
 *
 * @param node - jsep Expression node to evaluate
 * @param context - Evaluation context with variables and functions
 * @returns The evaluated result
 * @throws ExpressionError for security violations or unsupported nodes
 */
export function evaluateNode(node: Expression, context: EvalContext): unknown {
  switch (node.type) {
    case 'Literal':
      return (node as { value: unknown }).value;

    case 'Identifier':
      return context.variables[(node as { name: string }).name];

    case 'MemberExpression': {
      const memberNode = node as {
        object: Expression;
        property: Expression;
        computed: boolean;
      };

      // Evaluate the object
      const obj = evaluateNode(memberNode.object, context);

      // Null-safe: return undefined for null/undefined objects
      if (obj == null) {
        return undefined;
      }

      // Get property name (handle computed vs non-computed)
      let prop: string;
      if (memberNode.computed) {
        // Computed: obj[expr] - evaluate the property expression
        prop = String(evaluateNode(memberNode.property, context));
      } else {
        // Non-computed: obj.prop - use property name directly
        prop = (memberNode.property as { name: string }).name;
      }

      // SECURITY: Block prototype chain access
      if (BLOCKED_PROPS.has(prop)) {
        throw new ExpressionError(
          `Access to '${prop}' is not allowed for security reasons`,
          { expression: prop }
        );
      }

      // Return property value
      return (obj as Record<string, unknown>)[prop];
    }

    case 'CallExpression': {
      const callNode = node as {
        callee: Expression;
        arguments: Expression[];
      };

      // SECURITY: Only allow identifier-based function calls
      // This prevents method calls like obj.toString() which could escape sandbox
      if (callNode.callee.type !== 'Identifier') {
        throw new ExpressionError(
          'Only direct function calls are allowed (e.g., fn(x), not obj.method(x))',
          { expression: 'method call' }
        );
      }

      const fnName = (callNode.callee as { name: string }).name;
      const fn = context.functions[fnName];

      // Check if function is whitelisted
      if (typeof fn !== 'function') {
        throw new ExpressionError(
          `Function '${fnName}' is not defined or not allowed`,
          { expression: fnName }
        );
      }

      // Evaluate arguments and call the function
      const args = callNode.arguments.map((arg) => evaluateNode(arg, context));
      return fn(...args);
    }

    case 'BinaryExpression': {
      const binNode = node as {
        operator: string;
        left: Expression;
        right: Expression;
      };

      // Short-circuit evaluation for && and ||
      if (binNode.operator === '&&') {
        return evaluateNode(binNode.left, context) && evaluateNode(binNode.right, context);
      }
      if (binNode.operator === '||') {
        return evaluateNode(binNode.left, context) || evaluateNode(binNode.right, context);
      }
      if (binNode.operator === '??') {
        const leftVal = evaluateNode(binNode.left, context);
        return leftVal ?? evaluateNode(binNode.right, context);
      }

      // Non-short-circuit operators
      const left = evaluateNode(binNode.left, context);
      const right = evaluateNode(binNode.right, context);

      switch (binNode.operator) {
        case '+':
          return (left as number) + (right as number);
        case '-':
          return (left as number) - (right as number);
        case '*':
          return (left as number) * (right as number);
        case '/':
          return (left as number) / (right as number);
        case '%':
          return (left as number) % (right as number);
        case '==':
          return left == right;
        case '===':
          return left === right;
        case '!=':
          return left != right;
        case '!==':
          return left !== right;
        case '<':
          return (left as number) < (right as number);
        case '>':
          return (left as number) > (right as number);
        case '<=':
          return (left as number) <= (right as number);
        case '>=':
          return (left as number) >= (right as number);
        default:
          throw new ExpressionError(
            `Unsupported binary operator: ${binNode.operator}`,
            { expression: binNode.operator }
          );
      }
    }

    case 'UnaryExpression': {
      const unaryNode = node as {
        operator: string;
        argument: Expression;
        prefix: boolean;
      };

      const arg = evaluateNode(unaryNode.argument, context);

      switch (unaryNode.operator) {
        case '!':
          return !arg;
        case '-':
          return -(arg as number);
        case '+':
          return +(arg as number);
        default:
          throw new ExpressionError(
            `Unsupported unary operator: ${unaryNode.operator}`,
            { expression: unaryNode.operator }
          );
      }
    }

    case 'ConditionalExpression': {
      const condNode = node as {
        test: Expression;
        consequent: Expression;
        alternate: Expression;
      };

      const test = evaluateNode(condNode.test, context);
      return test
        ? evaluateNode(condNode.consequent, context)
        : evaluateNode(condNode.alternate, context);
    }

    case 'ArrayExpression': {
      const arrayNode = node as { elements: (Expression | null)[] };
      return arrayNode.elements.map((el) =>
        el ? evaluateNode(el, context) : undefined
      );
    }

    case 'Compound': {
      // Compound expressions (comma-separated) - evaluate all, return last
      const compoundNode = node as { body: Expression[] };
      let result: unknown;
      for (const expr of compoundNode.body) {
        result = evaluateNode(expr, context);
      }
      return result;
    }

    case 'ThisExpression':
      throw new ExpressionError(
        "'this' is not allowed in expressions",
        { expression: 'this' }
      );

    default:
      throw new ExpressionError(
        `Unsupported expression type: ${node.type}`,
        { expression: node.type }
      );
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Evaluate an expression string within a given context.
 *
 * Parses the expression and evaluates it with security sandboxing.
 *
 * @param expression - Expression string to evaluate
 * @param context - Evaluation context with variables and functions
 * @returns The evaluated result
 * @throws ExpressionError if parsing or evaluation fails
 *
 * @example
 * ```ts
 * evaluate('a + b', { variables: { a: 1, b: 2 }, functions: {} }); // 3
 * evaluate('user.name', { variables: { user: { name: 'Alice' } }, functions: {} }); // 'Alice'
 * evaluate('x ?? "default"', { variables: { x: null }, functions: {} }); // 'default'
 * ```
 */
export function evaluate(expression: string, context: EvalContext): unknown {
  try {
    const ast = parseExpression(expression);
    return evaluateNode(ast, context);
  } catch (error) {
    // Re-throw ExpressionError as-is
    if (error instanceof ExpressionError) {
      // Add expression context if not already present
      if (!error.expression) {
        throw new ExpressionError(error.message, {
          expression,
          cause: error.cause,
        });
      }
      throw error;
    }

    // Wrap other errors
    throw new ExpressionError(
      `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        expression,
        cause: error,
      }
    );
  }
}
