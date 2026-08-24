/**
 * The lint config IS the enforcement mechanism for ADR-0003, ADR-0004 and
 * ADR-0009. A misconfigured zone is indistinguishable from no zone, so the
 * config gets tested like any other code.
 *
 * ADR-0011 M0 requires proving the zones reject a deliberate bad import.
 * This test makes that permanent rather than a one-time check.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const ROOT = resolve(import.meta.dirname, '../..');
const LAYERS = ['util', 'ec', 'encode', 'core', 'render', 'dom'];
const TARGET = '__lint_probe_target.js';

const eslint = new ESLint({ cwd: ROOT });

/**
 * `import/no-restricted-paths` only fires when the imported path resolves.
 * See .memory/gotchas/2026-08-24-no-restricted-paths-needs-resolvable-target.md
 * -- so every layer needs a real file for the probes to import.
 */
beforeAll(() => {
  for (const layer of LAYERS) {
    const file = resolve(ROOT, 'src', layer, TARGET);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'export const probe = 1;\n');
  }
});

afterAll(() => {
  for (const layer of LAYERS) {
    rmSync(resolve(ROOT, 'src', layer, TARGET), { force: true });
  }
});

/** @returns {Promise<string[]>} rule ids reported for `code` linted as `filePath` */
async function rulesFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, filePath) });
  return result.messages.map((m) => m.ruleId);
}

const importProbe = (from) => `import { probe } from '${from}/${TARGET}';\nexport const use = probe;\n`;

describe('ADR-0003: layer boundaries are a lint error', () => {
  const illegal = [
    ['util may not import ec', 'src/util/probe.js', '../ec'],
    ['util may not import core', 'src/util/probe.js', '../core'],
    ['ec may not import core', 'src/ec/probe.js', '../core'],
    ['ec may not import encode', 'src/ec/probe.js', '../encode'],
    ['encode may not import core', 'src/encode/probe.js', '../core'],
    ['encode may not import ec', 'src/encode/probe.js', '../ec'],
    ['core may not import render', 'src/core/probe.js', '../render'],
    ['core may not import dom', 'src/core/probe.js', '../dom'],
    ['render may not import dom', 'src/render/probe.js', '../dom'],
  ];

  for (const [name, filePath, from] of illegal) {
    it(name, async () => {
      const rules = await rulesFor(importProbe(from), filePath);
      expect(rules).toContain('import/no-restricted-paths');
    });
  }

  const legal = [
    ['ec may import util', 'src/ec/probe.js', '../util'],
    ['encode may import util', 'src/encode/probe.js', '../util'],
    ['core may import util', 'src/core/probe.js', '../util'],
    ['core may import ec', 'src/core/probe.js', '../ec'],
    ['core may import encode', 'src/core/probe.js', '../encode'],
    ['render may import core', 'src/render/probe.js', '../core'],
    ['render may import util', 'src/render/probe.js', '../util'],
    ['dom may import render', 'src/dom/probe.js', '../render'],
    ['dom may import core', 'src/dom/probe.js', '../core'],
  ];

  for (const [name, filePath, from] of legal) {
    it(name, async () => {
      const rules = await rulesFor(importProbe(from), filePath);
      expect(rules).not.toContain('import/no-restricted-paths');
    });
  }
});

describe('ADR-0004: no browser globals below src/render', () => {
  for (const layer of ['core', 'ec', 'encode', 'util']) {
    it(`${layer} may not touch document`, async () => {
      const rules = await rulesFor('export const t = document.title;\n', `src/${layer}/probe.js`);
      expect(rules).toContain('no-restricted-globals');
    });
  }

  it('render may touch document', async () => {
    const rules = await rulesFor('export const t = document.title;\n', 'src/render/probe.js');
    expect(rules).not.toContain('no-restricted-globals');
  });
});

describe('ADR-0009: bare Error is banned in src', () => {
  it('rejects throw new Error', async () => {
    const rules = await rulesFor("export function f() { throw new Error('x'); }\n", 'src/util/probe.js');
    expect(rules).toContain('no-restricted-syntax');
  });

  it('allows a typed error', async () => {
    const code = "class QrError extends Error {}\nexport function f() { throw new QrError('x'); }\n";
    const rules = await rulesFor(code, 'src/util/probe.js');
    expect(rules).not.toContain('no-restricted-syntax');
  });
});
