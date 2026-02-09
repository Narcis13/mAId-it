/**
 * Email Sink Runtime (SendGrid)
 *
 * Sends emails via the SendGrid v3 API (HTTP-based, no SDK).
 */

import type { NodeRuntime, ExecutionParams, EmailSinkConfig, EmailSinkResult } from '../types.ts';
import { HttpError } from '../errors.ts';
import { evaluateTemplateInContext } from '../../execution/index.ts';
import type { ExecutionState } from '../../execution/types.ts';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

/**
 * Resolve template expressions in a string value.
 */
function resolveValue(value: string, state: ExecutionState): string {
  return evaluateTemplateInContext(value, state);
}

/**
 * Build the SendGrid API payload from config.
 */
function buildPayload(
  config: EmailSinkConfig,
  state: ExecutionState
): Record<string, unknown> {
  const from = resolveValue(config.from, state);
  const subject = resolveValue(config.subject, state);
  const toRaw = resolveValue(config.to, state);

  // Support comma-separated recipients
  const toAddresses = toRaw.split(',').map((addr) => ({ email: addr.trim() }));

  const content: Array<{ type: string; value: string }> = [];

  if (config.text) {
    content.push({ type: 'text/plain', value: resolveValue(config.text, state) });
  }
  if (config.html) {
    content.push({ type: 'text/html', value: resolveValue(config.html, state) });
  }

  // Default to plain text if neither provided
  if (content.length === 0) {
    content.push({ type: 'text/plain', value: '' });
  }

  return {
    personalizations: [{ to: toAddresses }],
    from: { email: from },
    subject,
    content,
  };
}

// ============================================================================
// Email Sink Runtime
// ============================================================================

class EmailSinkRuntime implements NodeRuntime<EmailSinkConfig, unknown, EmailSinkResult> {
  readonly type = 'email:sink';

  async execute(params: ExecutionParams<EmailSinkConfig, unknown>): Promise<EmailSinkResult> {
    const { config, state } = params;

    const apiKey = resolveValue(config.api_key, state);
    const payload = buildPayload(config, state);

    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(
        `SendGrid API error: HTTP ${response.status}`,
        response.status,
        body
      );
    }

    const messageId = response.headers.get('x-message-id') ?? undefined;

    return {
      status: response.status,
      messageId,
    };
  }
}

export const emailSinkRuntime = new EmailSinkRuntime();
