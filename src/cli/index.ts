#!/usr/bin/env bun
/**
 * FlowScript CLI
 *
 * Command-line interface for the FlowScript workflow engine.
 * Provides commands for validating, parsing, and executing workflows.
 */

import { Command } from 'commander';
import { validateFile, validateFiles } from './validate';
import { runWorkflow } from './run';
import { inspectWorkflow } from './inspect';
import { testWorkflow } from './test';

// Read package version
const packageJson = await Bun.file(new URL('../../package.json', import.meta.url)).json();
const version = packageJson.version || '0.0.0';

// Create the main program
const program = new Command();

program
  .name('flowscript')
  .description('Text-native workflow engine for .flow.md files')
  .version(version, '-v, --version', 'Output the current version');

// Validate command
program
  .command('validate')
  .description('Validate .flow.md workflow files')
  .argument('<files...>', 'Workflow files to validate')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--no-color', 'Disable colored output')
  .option('-s, --strict', 'Treat warnings as errors')
  .action(async (files: string[], options: { format?: string; color?: boolean; strict?: boolean }) => {
    const validateOptions = {
      format: options.format === 'json' ? 'json' as const : 'text' as const,
      noColor: options.color === false,
      strict: options.strict || false,
    };

    const result = files.length === 1
      ? await validateFile(files[0]!, validateOptions)
      : await validateFiles(files, validateOptions);

    // Output result
    console.log(result.output);

    // Exit with appropriate code
    process.exit(result.valid ? 0 : 1);
  });

// Run command
function collectConfig(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command('run')
  .description('Execute a .flow.md workflow')
  .argument('<file>', 'Workflow file to run')
  .option('--dry-run', 'Show execution plan without running')
  .option('-c, --config <key=value>', 'Override config value (repeatable)', collectConfig, [])
  .option('--input <json>', 'Workflow input data as JSON')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options: {
    dryRun?: boolean;
    config: string[];
    input?: string;
    format?: string;
    color?: boolean;
  }) => {
    const result = await runWorkflow(file, {
      dryRun: options.dryRun,
      config: options.config,
      input: options.input,
      format: options.format === 'json' ? 'json' : 'text',
      noColor: options.color === false,
    });

    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });

// Inspect command
program
  .command('inspect')
  .description('Inspect a .flow.md workflow structure')
  .argument('<file>', 'Workflow file to inspect')
  .option('--deps', 'Show dependency graph')
  .option('--schema', 'Show input/output schemas')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options: {
    deps?: boolean;
    schema?: boolean;
    format?: string;
    color?: boolean;
  }) => {
    const result = await inspectWorkflow(file, {
      deps: options.deps,
      schema: options.schema,
      format: options.format === 'json' ? 'json' : 'text',
      noColor: options.color === false,
    });

    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });

// Test command
program
  .command('test')
  .description('Run workflow tests from .test.flow.md files')
  .argument('<file>', 'Workflow or test file')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options: {
    format?: string;
    color?: boolean;
  }) => {
    const result = await testWorkflow(file, {
      format: options.format === 'json' ? 'json' : 'text',
      noColor: options.color === false,
    });

    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });

// Parse command (useful for debugging/tooling)
program
  .command('parse')
  .description('Parse a .flow.md file and output the AST')
  .argument('<file>', 'Workflow file to parse')
  .option('-f, --format <format>', 'Output format (json, yaml)', 'json')
  .option('--no-validate', 'Skip validation after parsing')
  .action(async (file: string, options: { format?: string; validate?: boolean }) => {
    const { parseFile } = await import('../parser');

    // Check if file exists
    const bunFile = Bun.file(file);
    const exists = await bunFile.exists();

    if (!exists) {
      console.error(`error: File not found: ${file}`);
      process.exit(1);
    }

    const result = await parseFile(file);

    if (!result.success) {
      console.error(`Parse failed with ${result.errors.length} error(s):`);
      for (const error of result.errors) {
        const loc = error.loc ? `${error.loc.start.line}:${error.loc.start.column}` : '';
        console.error(`  ${loc ? `[${loc}] ` : ''}${error.message}`);
      }
      process.exit(1);
    }

    // Optionally validate
    if (options.validate !== false) {
      const { validate } = await import('../validator');
      const validationResult = validate(result.data);

      if (!validationResult.valid) {
        console.error(`Validation failed with ${validationResult.errors.length} error(s):`);
        for (const error of validationResult.errors) {
          const loc = error.loc ? `${error.loc.start.line}:${error.loc.start.column}` : '';
          console.error(`  ${loc ? `[${loc}] ` : ''}${error.message}`);
        }
        process.exit(1);
      }
    }

    // Output AST
    if (options.format === 'yaml') {
      // Bun doesn't have native YAML stringify, use JSON for now
      console.log('YAML output not yet supported, using JSON:');
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log(JSON.stringify(result.data, null, 2));
    }
  });

// Handle unknown commands
program.on('command:*', (operands) => {
  console.error(`error: Unknown command '${operands[0]}'\n`);
  program.outputHelp();
  process.exit(1);
});

// Parse arguments
program.parse();
