/**
 * File Runtime Module
 *
 * Provides file source and sink runtimes for reading and writing local files.
 * Both runtimes are automatically registered with the runtime registry.
 */

import { fileSourceRuntime } from './source';
import { fileSinkRuntime } from './sink';
import { runtimeRegistry } from '../registry';

// ============================================================================
// Runtime Registration
// ============================================================================

// Register file runtimes with the global registry
runtimeRegistry.register(fileSourceRuntime);
runtimeRegistry.register(fileSinkRuntime);

// ============================================================================
// Exports
// ============================================================================

// Export runtime instances
export { fileSourceRuntime } from './source';
export { fileSinkRuntime } from './sink';

// Export path utilities
export { resolveTemplatePath, validatePath, detectFormat } from './path';

// Export CSV/YAML utilities
export { parseCSV, toCSV } from './csv';
export { parseYAML, toYAML } from './yaml';
