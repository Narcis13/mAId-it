/**
 * Tests for XML Body Parser
 *
 * Covers all node types: existing (source, transform, sink, branch, if, loop,
 * while, foreach, parallel, checkpoint) and new (phase, context, set, delay,
 * timeout, on-error).
 */

import { test, expect, describe } from 'bun:test';
import { parseBody } from './body';
import type { NodeAST } from '../types';

/** Helper: wrap XML in <workflow> and parse with default offsets */
function parse(xml: string) {
  const wrapped = `<workflow>${xml}</workflow>`;
  return parseBody(wrapped, 0, 0, wrapped);
}

/** Helper: parse and assert success, return nodes */
function parseOk(xml: string): NodeAST[] {
  const result = parse(xml);
  if (!result.success) {
    throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result.nodes;
}

/** Helper: parse and assert failure, return error messages */
function parseErrors(xml: string): string[] {
  const result = parse(xml);
  if (result.success) {
    throw new Error(`Expected parse failure but got ${result.nodes.length} nodes`);
  }
  return result.errors.map(e => e.message);
}

// ============================================================================
// Existing Node Types — Regression Tests (Item 2.1)
// ============================================================================

describe('existing node types', () => {
  describe('<source>', () => {
    test('parses HTTP source with config', () => {
      const [node] = parseOk('<source id="fetch" type="http" url="https://api.example.com"/>');
      expect(node.type).toBe('source');
      expect(node.id).toBe('fetch');
      if (node.type === 'source') {
        expect(node.sourceType).toBe('http');
        expect(node.config.url).toBe('https://api.example.com');
      }
    });

    test('parses file source', () => {
      const [node] = parseOk('<source id="read" type="file" path="data.json"/>');
      expect(node.type).toBe('source');
      if (node.type === 'source') {
        expect(node.sourceType).toBe('file');
        expect(node.config.path).toBe('data.json');
      }
    });

    test('defaults to HTTP type', () => {
      const [node] = parseOk('<source id="fetch"/>');
      if (node.type === 'source') {
        expect(node.sourceType).toBe('http');
      }
    });

    test('rejects invalid source type', () => {
      const errors = parseErrors('<source id="x" type="grpc"/>');
      expect(errors[0]).toContain('Source type must be');
    });

    test('parses input attribute', () => {
      const [node] = parseOk('<source id="fetch" type="http" input="prev"/>');
      expect(node.input).toBe('prev');
    });
  });

  describe('<transform>', () => {
    test('parses AI transform', () => {
      const [node] = parseOk('<transform id="analyze" type="ai" model="gpt-4"/>');
      expect(node.type).toBe('transform');
      if (node.type === 'transform') {
        expect(node.transformType).toBe('ai');
        expect(node.config.model).toBe('gpt-4');
      }
    });

    test('parses template transform', () => {
      const [node] = parseOk('<transform id="fmt" type="template"/>');
      if (node.type === 'transform') {
        expect(node.transformType).toBe('template');
      }
    });

    test('parses map transform', () => {
      const [node] = parseOk('<transform id="m" type="map" expression="$item * 2"/>');
      if (node.type === 'transform') {
        expect(node.transformType).toBe('map');
      }
    });

    test('parses filter transform', () => {
      const [node] = parseOk('<transform id="f" type="filter" condition="$item > 0"/>');
      if (node.type === 'transform') {
        expect(node.transformType).toBe('filter');
      }
    });

    test('defaults to template type', () => {
      const [node] = parseOk('<transform id="t"/>');
      if (node.type === 'transform') {
        expect(node.transformType).toBe('template');
      }
    });

    test('rejects invalid transform type', () => {
      const errors = parseErrors('<transform id="x" type="sql"/>');
      expect(errors[0]).toContain('Transform type must be');
    });
  });

  describe('<sink>', () => {
    test('parses HTTP sink', () => {
      const [node] = parseOk('<sink id="post" type="http" url="https://api.example.com"/>');
      expect(node.type).toBe('sink');
      if (node.type === 'sink') {
        expect(node.sinkType).toBe('http');
      }
    });

    test('parses file sink', () => {
      const [node] = parseOk('<sink id="write" type="file" path="out.json"/>');
      if (node.type === 'sink') {
        expect(node.sinkType).toBe('file');
      }
    });

    test('rejects invalid sink type', () => {
      const errors = parseErrors('<sink id="x" type="kafka"/>');
      expect(errors[0]).toContain('Sink type must be');
    });
  });

  describe('<branch>', () => {
    test('parses branch with cases and default', () => {
      const [node] = parseOk(`
        <branch id="route">
          <case when="status == 200">
            <transform id="ok" type="template"/>
          </case>
          <case when="status == 404">
            <transform id="notfound" type="template"/>
          </case>
          <default>
            <transform id="error" type="template"/>
          </default>
        </branch>
      `);
      expect(node.type).toBe('branch');
      if (node.type === 'branch') {
        expect(node.cases).toHaveLength(2);
        expect(node.cases[0].condition).toBe('status == 200');
        expect(node.cases[0].nodes).toHaveLength(1);
        expect(node.cases[1].condition).toBe('status == 404');
        expect(node.default).toHaveLength(1);
      }
    });

    test('parses branch without default', () => {
      const [node] = parseOk(`
        <branch id="route">
          <case when="x > 0">
            <transform id="pos" type="template"/>
          </case>
        </branch>
      `);
      if (node.type === 'branch') {
        expect(node.cases).toHaveLength(1);
        expect(node.default).toBeUndefined();
      }
    });
  });

  describe('<if>', () => {
    test('parses if with then and else', () => {
      const [node] = parseOk(`
        <if id="check" condition="score > 80">
          <then>
            <transform id="pass" type="template"/>
          </then>
          <else>
            <transform id="fail" type="template"/>
          </else>
        </if>
      `);
      expect(node.type).toBe('if');
      if (node.type === 'if') {
        expect(node.condition).toBe('score > 80');
        expect(node.then).toHaveLength(1);
        expect(node.else).toHaveLength(1);
      }
    });

    test('parses if without else', () => {
      const [node] = parseOk(`
        <if id="check" condition="x">
          <then>
            <transform id="a" type="template"/>
          </then>
        </if>
      `);
      if (node.type === 'if') {
        expect(node.then).toHaveLength(1);
        expect(node.else).toBeUndefined();
      }
    });
  });

  describe('<loop>', () => {
    test('parses loop with max and break', () => {
      const [node] = parseOk(`
        <loop id="retry" max="5" break="success == true">
          <transform id="attempt" type="template"/>
        </loop>
      `);
      expect(node.type).toBe('loop');
      if (node.type === 'loop') {
        expect(node.maxIterations).toBe(5);
        expect(node.breakCondition).toBe('success == true');
        expect(node.body).toHaveLength(1);
      }
    });
  });

  describe('<while>', () => {
    test('parses while with condition and body', () => {
      const [node] = parseOk(`
        <while id="poll" condition="status != done">
          <source id="check" type="http"/>
        </while>
      `);
      expect(node.type).toBe('while');
      if (node.type === 'while') {
        expect(node.condition).toBe('status != done');
        expect(node.body).toHaveLength(1);
      }
    });
  });

  describe('<foreach>', () => {
    test('parses foreach with collection and item var', () => {
      const [node] = parseOk(`
        <foreach id="process" collection="items" item="item" concurrency="3">
          <transform id="handle" type="template"/>
        </foreach>
      `);
      expect(node.type).toBe('foreach');
      if (node.type === 'foreach') {
        expect(node.collection).toBe('items');
        expect(node.itemVar).toBe('item');
        expect(node.maxConcurrency).toBe(3);
        expect(node.body).toHaveLength(1);
      }
    });

    test('defaults item var to "item"', () => {
      const [node] = parseOk(`
        <foreach id="x" collection="list">
          <transform id="y" type="template"/>
        </foreach>
      `);
      if (node.type === 'foreach') {
        expect(node.itemVar).toBe('item');
      }
    });
  });

  describe('<parallel>', () => {
    test('parses parallel with multiple branches', () => {
      const [node] = parseOk(`
        <parallel id="fan-out">
          <branch>
            <source id="a" type="http"/>
          </branch>
          <branch>
            <source id="b" type="http"/>
          </branch>
        </parallel>
      `);
      expect(node.type).toBe('parallel');
      if (node.type === 'parallel') {
        expect(node.branches).toHaveLength(2);
        expect(node.branches[0]).toHaveLength(1);
        expect(node.branches[1]).toHaveLength(1);
      }
    });
  });

  describe('<checkpoint>', () => {
    test('parses checkpoint with prompt and timeout', () => {
      const [node] = parseOk('<checkpoint id="approve" prompt="Review this?" timeout="3600" default="approve"/>');
      expect(node.type).toBe('checkpoint');
      if (node.type === 'checkpoint') {
        expect(node.prompt).toBe('Review this?');
        expect(node.timeout).toBe(3600);
        expect(node.defaultAction).toBe('approve');
      }
    });
  });

  describe('error handling', () => {
    test('rejects node without id', () => {
      const errors = parseErrors('<source type="http"/>');
      expect(errors[0]).toContain('requires an identifier');
    });

    test('rejects unknown node type', () => {
      const errors = parseErrors('<foobar id="x"/>');
      expect(errors[0]).toContain('Unknown node type');
    });
  });
});

// ============================================================================
// New Node Types (Items 2.2 - 2.7)
// ============================================================================

describe('<phase> (item 2.2)', () => {
  test('parses phase with name and children', () => {
    const [node] = parseOk(`
      <phase name="gather">
        <source id="fetch" type="http"/>
        <transform id="clean" type="template"/>
      </phase>
    `);
    expect(node.type).toBe('phase');
    if (node.type === 'phase') {
      expect(node.name).toBe('gather');
      expect(node.id).toBe('gather');
      expect(node.children).toHaveLength(2);
      expect(node.children[0].id).toBe('fetch');
      expect(node.children[1].id).toBe('clean');
    }
  });

  test('uses explicit id if provided alongside name', () => {
    const [node] = parseOk(`
      <phase id="p1" name="gather">
        <source id="s1" type="http"/>
      </phase>
    `);
    if (node.type === 'phase') {
      expect(node.id).toBe('p1');
      expect(node.name).toBe('gather');
    }
  });

  test('parses empty phase', () => {
    const [node] = parseOk('<phase name="empty"></phase>');
    if (node.type === 'phase') {
      expect(node.children).toHaveLength(0);
    }
  });

  test('rejects phase without name or id', () => {
    const errors = parseErrors('<phase><source id="x" type="http"/></phase>');
    expect(errors[0]).toContain('requires an identifier');
  });

  test('parses nested phases', () => {
    const [node] = parseOk(`
      <phase name="outer">
        <phase name="inner">
          <source id="s" type="http"/>
        </phase>
      </phase>
    `);
    if (node.type === 'phase') {
      expect(node.children).toHaveLength(1);
      const inner = node.children[0];
      if (inner.type === 'phase') {
        expect(inner.name).toBe('inner');
        expect(inner.children).toHaveLength(1);
      }
    }
  });
});

describe('<context> (item 2.3)', () => {
  test('parses context with set entries', () => {
    const [node] = parseOk(`
      <context id="global">
        <set key="api_url" value="https://api.example.com"/>
        <set key="timeout" value="30"/>
      </context>
    `);
    expect(node.type).toBe('context');
    if (node.type === 'context') {
      expect(node.id).toBe('global');
      expect(node.entries).toHaveLength(2);
      expect(node.entries[0]).toEqual({ key: 'api_url', value: 'https://api.example.com' });
      expect(node.entries[1]).toEqual({ key: 'timeout', value: '30' });
    }
  });

  test('parses empty context', () => {
    const [node] = parseOk('<context id="empty"></context>');
    if (node.type === 'context') {
      expect(node.entries).toHaveLength(0);
    }
  });

  test('accepts var attribute as key alias', () => {
    const [node] = parseOk(`
      <context id="vars">
        <set var="name" value="test"/>
      </context>
    `);
    if (node.type === 'context') {
      expect(node.entries[0]).toEqual({ key: 'name', value: 'test' });
    }
  });

  test('parses context with template expressions in values', () => {
    const [node] = parseOk(`
      <context id="computed">
        <set key="full_url" value="{{base_url}}/api/v1"/>
      </context>
    `);
    if (node.type === 'context') {
      expect(node.entries[0].value).toBe('{{base_url}}/api/v1');
    }
  });
});

describe('<set> (item 2.4)', () => {
  test('parses standalone set with var and value', () => {
    const [node] = parseOk('<set var="count" value="{{items.length}}"/>');
    expect(node.type).toBe('set');
    if (node.type === 'set') {
      expect(node.var).toBe('count');
      expect(node.value).toBe('{{items.length}}');
      expect(node.id).toBe('count');
    }
  });

  test('uses explicit id over var', () => {
    const [node] = parseOk('<set id="set-count" var="count" value="0"/>');
    if (node.type === 'set') {
      expect(node.id).toBe('set-count');
      expect(node.var).toBe('count');
    }
  });

  test('rejects set without var', () => {
    const errors = parseErrors('<set id="x" value="5"/>');
    expect(errors[0]).toContain('<set> requires a "var" attribute');
  });

  test('rejects set without any identifier', () => {
    const errors = parseErrors('<set value="5"/>');
    expect(errors[0]).toContain('requires an identifier');
  });

  test('allows empty value', () => {
    const [node] = parseOk('<set var="x" value=""/>');
    if (node.type === 'set') {
      expect(node.value).toBe('');
    }
  });
});

describe('<delay> (item 2.5)', () => {
  test('parses delay with duration', () => {
    const [node] = parseOk('<delay id="wait" duration="5s"/>');
    expect(node.type).toBe('delay');
    if (node.type === 'delay') {
      expect(node.duration).toBe('5s');
    }
  });

  test('parses delay with ISO duration', () => {
    const [node] = parseOk('<delay id="wait" duration="PT30S"/>');
    if (node.type === 'delay') {
      expect(node.duration).toBe('PT30S');
    }
  });

  test('rejects delay without duration', () => {
    const errors = parseErrors('<delay id="wait"/>');
    expect(errors[0]).toContain('<delay> requires a "duration" attribute');
  });

  test('passes input through', () => {
    const [node] = parseOk('<delay id="wait" duration="1s" input="prev"/>');
    expect(node.input).toBe('prev');
  });
});

describe('<timeout> (item 2.6)', () => {
  test('parses timeout with children and on-timeout', () => {
    const [node] = parseOk(`
      <timeout id="timed" duration="30s" on-timeout="fallback-node">
        <source id="slow-api" type="http"/>
        <transform id="process" type="template"/>
      </timeout>
    `);
    expect(node.type).toBe('timeout');
    if (node.type === 'timeout') {
      expect(node.duration).toBe('30s');
      expect(node.onTimeout).toBe('fallback-node');
      expect(node.children).toHaveLength(2);
      expect(node.children[0].id).toBe('slow-api');
      expect(node.children[1].id).toBe('process');
    }
  });

  test('parses timeout without on-timeout', () => {
    const [node] = parseOk(`
      <timeout id="timed" duration="10s">
        <source id="api" type="http"/>
      </timeout>
    `);
    if (node.type === 'timeout') {
      expect(node.onTimeout).toBeUndefined();
    }
  });

  test('rejects timeout without duration', () => {
    const errors = parseErrors(`
      <timeout id="timed">
        <source id="api" type="http"/>
      </timeout>
    `);
    expect(errors[0]).toContain('<timeout> requires a "duration" attribute');
  });

  test('parses empty timeout', () => {
    const [node] = parseOk('<timeout id="t" duration="5s"></timeout>');
    if (node.type === 'timeout') {
      expect(node.children).toHaveLength(0);
    }
  });
});

describe('<on-error> (item 2.7)', () => {
  test('parses on-error with retry config on source', () => {
    const [node] = parseOk(`
      <source id="fetch" type="http">
        <on-error>
          <retry when="status >= 500" max="3" backoff="exponential"/>
        </on-error>
      </source>
    `);
    expect(node.errorConfig).toBeDefined();
    expect(node.errorConfig!.retry).toBeDefined();
    expect(node.errorConfig!.retry!.when).toBe('status >= 500');
    expect(node.errorConfig!.retry!.max).toBe(3);
    expect(node.errorConfig!.retry!.backoff).toBe('exponential');
  });

  test('parses on-error with fallback', () => {
    const [node] = parseOk(`
      <transform id="process" type="ai">
        <on-error>
          <fallback node="fallback-transform"/>
        </on-error>
      </transform>
    `);
    expect(node.errorConfig).toBeDefined();
    expect(node.errorConfig!.fallback).toBe('fallback-transform');
  });

  test('parses on-error with both retry and fallback', () => {
    const [node] = parseOk(`
      <source id="fetch" type="http">
        <on-error>
          <retry max="2" backoff="linear"/>
          <fallback node="cache"/>
        </on-error>
      </source>
    `);
    expect(node.errorConfig!.retry!.max).toBe(2);
    expect(node.errorConfig!.retry!.backoff).toBe('linear');
    expect(node.errorConfig!.fallback).toBe('cache');
  });

  test('no errorConfig when no on-error present', () => {
    const [node] = parseOk('<source id="fetch" type="http"/>');
    expect(node.errorConfig).toBeUndefined();
  });

  test('on-error works on transform nodes', () => {
    const [node] = parseOk(`
      <transform id="t" type="template">
        <on-error>
          <retry max="1" backoff="fixed"/>
        </on-error>
      </transform>
    `);
    expect(node.errorConfig!.retry!.max).toBe(1);
    expect(node.errorConfig!.retry!.backoff).toBe('fixed');
  });

  test('on-error works on sink nodes', () => {
    const [node] = parseOk(`
      <sink id="out" type="http">
        <on-error>
          <retry max="5"/>
        </on-error>
      </sink>
    `);
    expect(node.errorConfig!.retry!.max).toBe(5);
  });

  test('retry without optional attributes', () => {
    const [node] = parseOk(`
      <source id="fetch" type="http">
        <on-error>
          <retry max="2"/>
        </on-error>
      </source>
    `);
    expect(node.errorConfig!.retry!.max).toBe(2);
    expect(node.errorConfig!.retry!.when).toBeUndefined();
    expect(node.errorConfig!.retry!.backoff).toBeUndefined();
  });
});

// ============================================================================
// Multiple Nodes / Integration
// ============================================================================

describe('multiple nodes', () => {
  test('parses workflow with mixed node types', () => {
    const nodes = parseOk(`
      <context id="vars">
        <set key="base" value="https://api.example.com"/>
      </context>
      <source id="fetch" type="http"/>
      <delay id="wait" duration="2s"/>
      <transform id="process" type="ai"/>
      <sink id="output" type="file"/>
    `);
    expect(nodes).toHaveLength(5);
    expect(nodes.map(n => n.type)).toEqual(['context', 'source', 'delay', 'transform', 'sink']);
  });

  test('parses phase containing new node types', () => {
    const [node] = parseOk(`
      <phase name="setup">
        <set var="count" value="0"/>
        <delay id="warmup" duration="1s"/>
        <source id="api" type="http"/>
      </phase>
    `);
    if (node.type === 'phase') {
      expect(node.children).toHaveLength(3);
      expect(node.children[0].type).toBe('set');
      expect(node.children[1].type).toBe('delay');
      expect(node.children[2].type).toBe('source');
    }
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  test('handles self-closing tags', () => {
    const nodes = parseOk(`
      <source id="s" type="http"/>
      <set var="x" value="1"/>
      <delay id="d" duration="1s"/>
    `);
    expect(nodes).toHaveLength(3);
  });

  test('empty workflow body', () => {
    const result = parseBody('<workflow></workflow>', 0, 0, '<workflow></workflow>');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodes).toHaveLength(0);
    }
  });

  test('invalid XML returns error', () => {
    const result = parseBody('<workflow><broken', 0, 0, '<workflow><broken');
    expect(result.success).toBe(false);
  });
});
