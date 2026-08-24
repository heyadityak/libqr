/**
 * ADR-0002 enforcement.
 *
 * The `.d.ts` is hand-maintained, so nothing structural stops it drifting from
 * the implementation. `npm run test:types` proves the declarations are
 * self-consistent and usable; this test proves they describe the module that
 * actually ships.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as libqr from '../../src/index.js';

const declarations = readFileSync(new URL('../../src/types/index.d.ts', import.meta.url), 'utf8');

/** Value-level names the declaration file exports. Types are not runtime exports. */
function declaredValueNames(source) {
  const names = new Set();
  const pattern = /^export declare (?:function|const|class) (\w+)/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    names.add(match[1]);
    match = pattern.exec(source);
  }
  return names;
}

describe('public surface', () => {
  const declared = declaredValueNames(declarations);
  const actual = new Set(Object.keys(libqr));

  it('declares every runtime export', () => {
    const undeclared = [...actual].filter((name) => !declared.has(name)).sort();
    expect(undeclared).toEqual([]);
  });

  it('exports everything it declares', () => {
    const missing = [...declared].filter((name) => !actual.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('exports the documented API and nothing surprising', () => {
    expect([...actual].sort()).toEqual([
      'CapacityError',
      'DEFAULT_OPTIONS',
      'ECLevel',
      'MAX_VERSION',
      'MIN_VERSION',
      'Matrix',
      'Mode',
      'ModeError',
      'OptionError',
      'QrError',
      'encode',
      'matrixToAscii',
      'matrixToSvg',
      'normalizeOptions',
      'qr',
      'toAscii',
      'toSvg',
    ]);
  });

  it('does not pull the optional entry points into the default path', () => {
    // ADR-0006: canvas, PNG, Kanji, and the custom element are separate entry
    // points. Re-exporting them here would put their weight in every bundle.
    for (const name of ['toCanvas', 'toDataUrl', 'toPng', 'defineElement', 'mount']) {
      expect(actual.has(name)).toBe(false);
    }
  });

  it('has no default export', () => {
    expect(actual.has('default')).toBe(false);
  });
});
