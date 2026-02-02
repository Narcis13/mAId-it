#!/usr/bin/env bun
/**
 * FlowScript CLI
 *
 * Command-line interface for the FlowScript workflow engine.
 * Provides commands for validating, parsing, and (future) executing workflows.
 */

import { Command } from 'commander';
import { validateFile, validateFiles } from './validate';

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
