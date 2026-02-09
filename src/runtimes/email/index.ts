/**
 * Email Runtime Module
 *
 * Provides email sink runtime for sending emails via SendGrid.
 */

import { emailSinkRuntime } from './sink.ts';
import { runtimeRegistry } from '../registry.ts';

// Register email runtimes with the global registry
runtimeRegistry.register(emailSinkRuntime);

export { emailSinkRuntime } from './sink.ts';
