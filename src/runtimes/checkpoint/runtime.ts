/**
 * Checkpoint Runtime - pauses execution for human interaction.
 *
 * Prompts user in terminal for approval, rejection, or text input.
 * Supports timeout with configurable default action.
 * Supports named actions with goto routing and conditional display.
 *
 * In non-TTY environments (CI, automated tests), uses default action
 * immediately without prompting.
 */

import * as readline from 'node:readline';
import type { NodeRuntime, ExecutionParams } from '../types.ts';
import type { CheckpointConfig, CheckpointResult, CheckpointAction } from './types.ts';
import { evaluate, buildEvaluationContext } from '../../expression/index.ts';

/** Maximum number of invalid input attempts before using default action */
const MAX_ATTEMPTS = 3;

/**
 * Checkpoint Runtime - pauses execution for human interaction.
 */
export class CheckpointRuntime implements NodeRuntime<CheckpointConfig, unknown, CheckpointResult> {
  readonly type = 'checkpoint';

  async execute(params: ExecutionParams<CheckpointConfig, unknown>): Promise<CheckpointResult> {
    const { config, state } = params;
    const defaultAction = config.defaultAction ?? 'reject';
    const allowInput = config.allowInput ?? false;

    // Conditional display: skip checkpoint if condition evaluates to false
    if (config.condition) {
      try {
        const ctx = buildEvaluationContext(state);
        const conditionResult = evaluate(config.condition, ctx);
        if (!conditionResult) {
          return {
            action: 'approve',
            timedOut: false,
            respondedAt: Date.now(),
            skipped: true,
          };
        }
      } catch {
        // If condition can't be evaluated, show the checkpoint
      }
    }

    // Non-TTY environment: use default action immediately
    if (!process.stdin.isTTY) {
      return {
        action: defaultAction,
        timedOut: false,
        respondedAt: Date.now(),
      };
    }

    return this.promptUser(config.message, defaultAction, allowInput, config.timeout, config.actions);
  }

  /**
   * Prompt user for input in TTY environment.
   */
  private async promptUser(
    message: string,
    defaultAction: 'approve' | 'reject',
    allowInput: boolean,
    timeout?: number,
    actions?: CheckpointConfig['actions']
  ): Promise<CheckpointResult> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;

    return new Promise<CheckpointResult>((resolve) => {
      // Handle cleanup and resolution
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        rl.close();
      };

      const resolveWith = (result: CheckpointResult) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      // Set up timeout if configured
      if (timeout && timeout > 0) {
        timeoutId = setTimeout(() => {
          resolveWith({
            action: defaultAction,
            timedOut: true,
            respondedAt: Date.now(),
          });
        }, timeout);
      }

      // Handle SIGINT (Ctrl+C)
      rl.on('SIGINT', () => {
        resolveWith({
          action: 'reject',
          timedOut: false,
          respondedAt: Date.now(),
        });
      });

      // Handle readline close without answer
      rl.on('close', () => {
        resolveWith({
          action: defaultAction,
          timedOut: false,
          respondedAt: Date.now(),
        });
      });

      // Start the prompt loop
      this.promptLoop(rl, message, allowInput, defaultAction, 0, resolveWith, actions);
    });
  }

  /**
   * Prompt loop with retry logic for invalid input.
   */
  private promptLoop(
    rl: readline.Interface,
    message: string,
    allowInput: boolean,
    defaultAction: 'approve' | 'reject',
    attempts: number,
    resolve: (result: CheckpointResult) => void,
    actions?: CheckpointConfig['actions']
  ): void {
    // Build options string — include named actions if present
    let options = allowInput ? '[A]pprove / [R]eject / [I]nput' : '[A]pprove / [R]eject';
    if (actions && actions.length > 0) {
      const actionLabels = actions.map(a => `[${a.label || a.id}]`).join(' / ');
      options += ` / ${actionLabels}`;
    }
    const prompt = `\n${message}\n${options}: `;

    rl.question(prompt, (answer) => {
      const trimmed = answer.trim().toLowerCase();

      // Empty input: re-prompt
      if (!trimmed) {
        if (attempts + 1 >= MAX_ATTEMPTS) {
          resolve({
            action: defaultAction,
            timedOut: false,
            respondedAt: Date.now(),
          });
          return;
        }
        console.log('Please enter a valid response.');
        this.promptLoop(rl, message, allowInput, defaultAction, attempts + 1, resolve, actions);
        return;
      }

      // Check for named action match first
      if (actions && actions.length > 0) {
        const matchedAction = actions.find(a =>
          trimmed === a.id.toLowerCase() ||
          trimmed === (a.label || '').toLowerCase()
        );
        if (matchedAction) {
          resolve({
            action: matchedAction.id,
            timedOut: false,
            respondedAt: Date.now(),
            goto: matchedAction.goto,
          });
          return;
        }
      }

      // Parse standard response
      const action = this.parseAction(trimmed, allowInput);
      if (action) {
        if (action === 'input' && allowInput) {
          // Prompt for text input
          rl.question('Enter your input: ', (textInput) => {
            resolve({
              action: 'input',
              input: textInput,
              timedOut: false,
              respondedAt: Date.now(),
            });
          });
        } else {
          resolve({
            action,
            timedOut: false,
            respondedAt: Date.now(),
          });
        }
        return;
      }

      // Invalid input: retry or use default
      if (attempts + 1 >= MAX_ATTEMPTS) {
        console.log(`Maximum attempts reached. Using default action: ${defaultAction}`);
        resolve({
          action: defaultAction,
          timedOut: false,
          respondedAt: Date.now(),
        });
        return;
      }

      console.log('Invalid response. Please try again.');
      this.promptLoop(rl, message, allowInput, defaultAction, attempts + 1, resolve, actions);
    });
  }

  /**
   * Parse user input into a CheckpointAction.
   */
  private parseAction(input: string, allowInput: boolean): CheckpointAction | null {
    switch (input) {
      case 'a':
      case 'approve':
        return 'approve';
      case 'r':
      case 'reject':
        return 'reject';
      case 'i':
      case 'input':
        return allowInput ? 'input' : null;
      default:
        return null;
    }
  }
}

/**
 * Singleton instance of the checkpoint runtime.
 */
export const checkpointRuntime = new CheckpointRuntime();
