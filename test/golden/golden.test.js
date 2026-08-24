/**
 * The golden gate (ADR-0008).
 *
 * Two kinds of entry, distinguished by `source` (ADR-0014):
 *
 * - `published` -- expected values taken from ISO/IEC 18004 worked examples.
 *   These are independent conformance evidence.
 * - `regression` -- expected values locked in from this implementation. These
 *   prove only that behaviour has not changed. To stop them being mistaken for
 *   conformance evidence, every one is additionally required to decode back to
 *   its input, so a regression lock can never be merely "whatever the code did".
 *
 * The set is append-only. A failing entry means the change is wrong, unless a
 * cited spec clause proves the entry was wrong -- and correcting an entry
 * requires an ADR, not a commit message.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qr, matrixToSvg } from '../../src/index.js';
import { buildDataCodewords } from '../../src/core/version.js';
import { makeSegments } from '../../src/core/segment.js';
import { versionRangeIndex } from '../../src/core/mode.js';
import { VECTORS_PATH, buildSvgSnapshots, buildVectors, svgPath } from '../../scripts/gen-goldens.js';
import { decodeMatrix } from '../helpers/decode.js';

const golden = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));

const rowsOf = (matrix) => {
  const rows = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let line = '';
    for (let col = 0; col < matrix.size; col += 1) line += matrix.get(row, col) ? '1' : '0';
    rows.push(line);
  }
  return rows;
};

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('the golden file matches its generator', () => {
  it('regenerating in memory produces the committed vectors', () => {
    expect(buildVectors()).toEqual({ ...golden, vectors: golden.vectors });
  });

  it('every entry declares a source', () => {
    for (const vector of golden.vectors) {
      expect(['published', 'regression']).toContain(vector.source);
    }
  });

  it('includes at least one published conformance vector', () => {
    expect(golden.vectors.some((v) => v.source === 'published')).toBe(true);
  });
});

describe('published conformance vectors', () => {
  const published = golden.vectors.filter((v) => v.source === 'published');

  for (const vector of published) {
    it(`${vector.name}`, () => {
      const segments = makeSegments(vector.data, {
        rangeIndex: versionRangeIndex(vector.version),
      });
      const codewords = buildDataCodewords({
        segments,
        version: vector.version,
        ecLevel: vector.ecLevel,
      });
      expect(hex(codewords)).toBe(vector.dataCodewordsHex);
    });
  }
});

describe('regression vectors', () => {
  const regression = golden.vectors.filter((v) => v.source === 'regression');

  for (const vector of regression) {
    describe(vector.name, () => {
      const options = { ecLevel: vector.ecLevel };
      if (vector.mask !== undefined) options.mask = vector.mask;
      // Only pin the version when the entry was generated with it pinned.
      if (vector.name.startsWith('version-') || vector.name.startsWith('forced-version')) {
        options.version = vector.version;
      }

      it('reproduces the recorded matrix', () => {
        const result = qr(vector.data, options);
        expect(result.version).toBe(vector.version);
        expect(result.mask).toBe(vector.mask);
        expect(result.size).toBe(vector.size);
        expect(rowsOf(result.matrix)).toEqual(vector.rows);
      });

      it('decodes back to its input', () => {
        const result = qr(vector.data, options);
        expect(decodeMatrix(result.matrix)).toBe(vector.data);
      });

      it('records the ECI it declared', () => {
        const result = qr(vector.data, options);
        expect(result.eci ?? null).toBe(vector.eci);
      });
    });
  }

  it('covers all four error-correction levels', () => {
    const levels = new Set(regression.map((v) => v.ecLevel));
    expect(levels).toEqual(new Set(['L', 'M', 'Q', 'H']));
  });

  it('covers the version boundaries from AGENTS.md section 6', () => {
    const versions = new Set(regression.map((v) => v.version));
    for (const boundary of [1, 6, 7, 9, 10, 26, 27, 40]) {
      expect(versions).toContain(boundary);
    }
  });
});

describe('SVG snapshots', () => {
  for (const { name, svg } of buildSvgSnapshots()) {
    it(`svg-${name}.svg is unchanged`, () => {
      expect(`${svg}\n`).toBe(readFileSync(svgPath(name), 'utf8'));
    });
  }

  it('merges square modules into far fewer path segments than modules', () => {
    const { matrix } = qr('HELLO WORLD', { ecLevel: 'M' });
    const merged = matrixToSvg(matrix, { shape: 'square' });
    const perModule = matrixToSvg(matrix, { shape: 'rounded' });
    // Run merging is the reason SVG stays within the size budget (ADR-0005).
    expect(merged.length).toBeLessThan(perModule.length / 2);
  });

  it('produces well-formed, self-contained SVG', () => {
    const { matrix } = qr('HELLO WORLD', { ecLevel: 'M' });
    const svg = matrixToSvg(matrix, {});
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no external references
  });

  it('escapes colours rather than trusting them', () => {
    const { matrix } = qr('X', { ecLevel: 'L' });
    const svg = matrixToSvg(matrix, { dark: '"/><script>alert(1)</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
