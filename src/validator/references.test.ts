/**
 * Reference Validator Tests
 *
 * Tests for secret reference validation in workflow files.
 */

import { test, expect, describe } from 'bun:test';
import { parse } from '../parser';
import { validateReferences } from './references';

describe('validateSecretReferences', () => {
  test('undeclared secret in HTTP source headers is detected', () => {
    const source = `---
name: test-workflow
version: 1.0.0
---
<workflow>
  <source id="fetch" type="http">
    <url>https://api.example.com</url>
    <headers>
      <Authorization>Bearer {{$secrets.UNDECLARED_TOKEN}}</Authorization>
    </headers>
  </source>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    expect(errors.length).toBeGreaterThan(0);

    const secretError = errors.find(e => e.code === 'VALID_UNDEFINED_SECRET_REF');
    expect(secretError).toBeDefined();
    expect(secretError?.message).toContain('UNDECLARED_TOKEN');
  });

  test('declared secret passes validation', () => {
    const source = `---
name: test-workflow
version: 1.0.0
secrets:
  - API_KEY
---
<workflow>
  <source id="fetch" type="http">
    <url>https://api.example.com</url>
    <headers>
      <Authorization>Bearer {{$secrets.API_KEY}}</Authorization>
    </headers>
  </source>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    const secretErrors = errors.filter(e => e.code === 'VALID_UNDEFINED_SECRET_REF');
    expect(secretErrors.length).toBe(0);
  });

  test('multiple undeclared secrets all reported', () => {
    const source = `---
name: test-workflow
version: 1.0.0
---
<workflow>
  <source id="fetch" type="http">
    <url>https://api.example.com?key={{$secrets.API_KEY}}</url>
    <headers>
      <Authorization>Bearer {{$secrets.AUTH_TOKEN}}</Authorization>
      <X-Custom>{{$secrets.CUSTOM_SECRET}}</X-Custom>
    </headers>
  </source>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    const secretErrors = errors.filter(e => e.code === 'VALID_UNDEFINED_SECRET_REF');

    expect(secretErrors.length).toBe(3);

    const secretNames = secretErrors.map(e => {
      const match = e.message.match(/"(\w+)"/);
      return match?.[1];
    });

    expect(secretNames).toContain('API_KEY');
    expect(secretNames).toContain('AUTH_TOKEN');
    expect(secretNames).toContain('CUSTOM_SECRET');
  });

  test('secret in transform template detected', () => {
    const source = `---
name: test-workflow
version: 1.0.0
---
<workflow>
  <source id="data" type="http">
    <url>https://api.example.com</url>
  </source>
  <transform id="enrich" type="template" input="data">
    <template>
      API Key: {{$secrets.TRANSFORM_SECRET}}
      Data: {{$.data}}
    </template>
  </transform>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    const secretError = errors.find(e => e.code === 'VALID_UNDEFINED_SECRET_REF');

    expect(secretError).toBeDefined();
    expect(secretError?.message).toContain('TRANSFORM_SECRET');
  });

  test('same secret referenced multiple times only reported once', () => {
    const source = `---
name: test-workflow
version: 1.0.0
---
<workflow>
  <source id="fetch" type="http">
    <url>https://api.example.com?key={{$secrets.DUPLICATE}}</url>
    <headers>
      <Authorization>{{$secrets.DUPLICATE}}</Authorization>
    </headers>
  </source>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    const secretErrors = errors.filter(e =>
      e.code === 'VALID_UNDEFINED_SECRET_REF' && e.message.includes('DUPLICATE')
    );

    // Should only report once even though referenced twice
    expect(secretErrors.length).toBe(1);
  });

  test('error hints include how to declare the secret', () => {
    const source = `---
name: test-workflow
version: 1.0.0
---
<workflow>
  <source id="fetch" type="http">
    <url>https://api.example.com</url>
    <headers>
      <Authorization>Bearer {{$secrets.MISSING}}</Authorization>
    </headers>
  </source>
</workflow>
`;

    const parseResult = parse(source, 'test.flow.md');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const errors = validateReferences(parseResult.data);
    const secretError = errors.find(e => e.code === 'VALID_UNDEFINED_SECRET_REF');

    expect(secretError).toBeDefined();
    expect(secretError?.hints).toBeDefined();
    expect(secretError?.hints?.some(h => h.includes('Declare the secret in frontmatter'))).toBe(true);
  });
});
