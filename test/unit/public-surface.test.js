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
import * as canvasEntry from '../../src/render/canvas.js';
import * as svgEntry from '../../src/render/svg.js';
import * as pngEntry from '../../src/render/png.js';
import * as logoEntry from '../../src/render/logo.js';

const declarationsFor = (name) =>
  readFileSync(new URL(`../../src/types/${name}.d.ts`, import.meta.url), 'utf8');

const declarations = declarationsFor('index');

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
    // ADR-0006 / ADR-0017: canvas, PNG, Kanji, the custom element and logo
    // overlays are separate entry points. Re-exporting any of them here would
    // put their weight in every bundle.
    for (const name of [
      'toCanvas', 'toDataUrl', 'toPng', 'defineElement', 'mount',
      'logoOverlay', 'validateLogo', 'maxSizeRatio',
    ]) {
      expect(actual.has(name)).toBe(false);
    }
  });

  it('has no default export', () => {
    expect(actual.has('default')).toBe(false);
  });
});

describe('sub-entry points are renderer-only', () => {
  // ADR-0015: each sub-entry takes a matrix rather than encoding, so its bundle
  // is its marginal cost. A convenience wrapper here would drag the encoder in.
  const cases = [
    ['svg', svgEntry, ['matrixToSvg']],
    ['canvas', canvasEntry, ['canvasSizeFor', 'matrixToCanvas']],
    ['png', pngEntry, ['matrixToBlob', 'matrixToDataUrl']],
    ['logo', logoEntry, [
      'DEFAULT_SIZE_RATIO', 'FUNCTION_CLEARANCE', 'SAFETY_MARGIN', 'clearanceRatio',
      'effectiveMaxSizeRatio', 'logoGeometry', 'logoOverlay', 'maxSizeRatio', 'validateLogo',
    ]],
  ];

  for (const [name, module, expected] of cases) {
    it(`libqr/${name} exports exactly ${expected.join(', ')}`, () => {
      expect(Object.keys(module).sort()).toEqual(expected);
    });

    it(`libqr/${name} declarations match its runtime exports`, () => {
      expect(declaredValueNames(declarationsFor(name))).toEqual(new Set(Object.keys(module)));
    });

    it(`libqr/${name} exports nothing that encodes`, () => {
      for (const forbidden of ['qr', 'encode', 'toSvg', 'toCanvas', 'toDataUrl']) {
        expect(Object.keys(module)).not.toContain(forbidden);
      }
    });
  }
});

describe('every entry point has a types declaration', () => {
  it('covers each exports specifier', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    for (const [specifier, target] of Object.entries(pkg.exports)) {
      if (specifier === './package.json') continue;
      // Kanji registers a mode rather than exporting an API surface consumers
      // call, so it has no declaration file of its own.
      if (specifier === './kanji') continue;
      expect(target.types, `${specifier} has no types condition`).toBeDefined();
    }
  });
});
