/**
 * Performance guards.
 *
 * Not a leaderboard -- these exist so a refactor that quietly makes mask
 * selection eight times slower shows up. Mask selection is the hot path by
 * construction: it draws and scores all eight candidates over the whole matrix
 * (ADR-0011 M6), so it dominates encoding cost at high versions.
 */
import { bench, describe } from 'vitest';
import { qr, toSvg, matrixToSvg } from '../src/index.js';
import { chooseMask, penalty } from '../src/core/mask.js';
import { Matrix, placeCodewords } from '../src/core/matrix.js';
import { placeFunctionPatterns } from '../src/core/patterns.js';
import { buildCodewords } from '../src/core/version.js';
import { makeSegments } from '../src/core/segment.js';
import { versionRangeIndex } from '../src/core/mode.js';
import { computeEcc } from '../src/ec/reed-solomon.js';

const SHORT = 'HELLO WORLD';
const URL_LIKE = 'https://example.com/orders/8f3a19c2?ref=email&utm=campaign';
const MAX_NUMERIC = '7'.repeat(7089);

/** An unmasked symbol, so mask selection can be timed on its own. */
function unmasked(text, version, ecLevel) {
  const segments = makeSegments(text, { rangeIndex: versionRangeIndex(version) });
  const codewords = buildCodewords({ segments, version, ecLevel });
  const matrix = new Matrix(version);
  placeFunctionPatterns(matrix);
  placeCodewords(matrix, codewords);
  return matrix;
}

describe('end to end', () => {
  bench('encode, version 1', () => {
    qr(SHORT, { ecLevel: 'M' });
  });

  bench('encode, url payload', () => {
    qr(URL_LIKE, { ecLevel: 'M' });
  });

  bench('encode, version 40 at maximum numeric capacity', () => {
    qr(MAX_NUMERIC, { ecLevel: 'L' });
  });

  bench('encode and render SVG', () => {
    toSvg(URL_LIKE, { ecLevel: 'M' });
  });
});

describe('mask selection -- the hot path', () => {
  const small = unmasked(SHORT, 1, 'M');
  const large = unmasked(MAX_NUMERIC, 40, 'L');

  bench('score one candidate, version 1', () => {
    penalty(small);
  });

  bench('score one candidate, version 40', () => {
    penalty(large);
  });

  bench('choose from all eight, version 1', () => {
    chooseMask(small, 'M');
  });

  bench('choose from all eight, version 40', () => {
    chooseMask(large, 'L');
  });
});

describe('error correction', () => {
  const block = new Uint8Array(120).map((_, i) => (i * 37) % 256);

  bench('compute 30 error-correction codewords', () => {
    computeEcc(block, 30);
  });
});

describe('rendering only', () => {
  const { matrix: v1 } = qr(SHORT, { ecLevel: 'M' });
  const { matrix: v40 } = qr(MAX_NUMERIC, { ecLevel: 'L' });

  bench('SVG, version 1, merged runs', () => {
    matrixToSvg(v1, { shape: 'square' });
  });

  bench('SVG, version 40, merged runs', () => {
    matrixToSvg(v40, { shape: 'square' });
  });

  bench('SVG, version 40, per-module shapes', () => {
    matrixToSvg(v40, { shape: 'dot' });
  });
});
