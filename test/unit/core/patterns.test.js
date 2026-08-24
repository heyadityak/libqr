/**
 * M5 gate (ADR-0011).
 *
 * Golden snapshots cover versions 1 and 7. Version 40 is asserted structurally
 * instead of by snapshot: a 177x177 text blob is exactly the unreviewable diff
 * ADR-0007 warns about, and the remainder-bit cross-check below is stronger
 * evidence than a snapshot anyway -- it ties the module-by-module placement here
 * to the independent closed-form formula in scripts/gen-tables.js, for all 40
 * versions at once.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix, dataModuleCount, placeCodewords } from '../../../src/core/matrix.js';
import {
  formatInfoPositions,
  placeFunctionPatterns,
  versionInfoPositions,
} from '../../../src/core/patterns.js';
import { ALIGNMENT_CENTRES, MAX_VERSION, TOTAL_CODEWORDS } from '../../../src/core/constants.js';
import { patternSnapshot } from '../../../scripts/gen-pattern-goldens.js';

const withPatterns = (version) => {
  const matrix = new Matrix(version);
  placeFunctionPatterns(matrix);
  return matrix;
};

const goldenPath = (version) => new URL(`../../golden/patterns-v${version}.txt`, import.meta.url);

describe('golden function-pattern snapshots', () => {
  for (const version of [1, 7]) {
    it(`version ${version} matches the committed snapshot`, () => {
      expect(patternSnapshot(version)).toBe(readFileSync(goldenPath(version), 'utf8'));
    });
  }
});

describe('geometry agrees with the generated tables', () => {
  it('leaves the published number of remainder bits at every version', () => {
    // ISO/IEC 18004 Table 1, remainder bits column. Placement here and the
    // closed-form module count in the generator are derived independently, so
    // agreement across all 40 versions pins both.
    const expected = {
      0: [1, 7, 8, 9, 10, 11, 12, 13, 35, 36, 37, 38, 39, 40],
      3: [14, 15, 16, 17, 18, 19, 20, 28, 29, 30, 31, 32, 33, 34],
      4: [21, 22, 23, 24, 25, 26, 27],
      7: [2, 3, 4, 5, 6],
    };

    const actual = {};
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      const remainder = dataModuleCount(withPatterns(version)) - TOTAL_CODEWORDS[version] * 8;
      (actual[remainder] ??= []).push(version);
    }

    expect(actual).toEqual(expected);
  });

  it('always leaves room for every codeword', () => {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      expect(dataModuleCount(withPatterns(version)))
        .toBeGreaterThanOrEqual(TOTAL_CODEWORDS[version] * 8);
    }
  });
});

describe('finder patterns', () => {
  const isFinderCore = (matrix, top, left) => {
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
        if (matrix.get(top + row, left + col) !== (ring !== 2)) return false;
      }
    }
    return true;
  };

  for (const version of [1, 7, 21, 40]) {
    it(`version ${version} has finders at three corners and none at the fourth`, () => {
      const matrix = withPatterns(version);
      const far = matrix.size - 7;

      expect(isFinderCore(matrix, 0, 0)).toBe(true);
      expect(isFinderCore(matrix, 0, far)).toBe(true);
      expect(isFinderCore(matrix, far, 0)).toBe(true);

      // The missing bottom-right finder is what tells a decoder the rotation.
      expect(isFinderCore(matrix, far, far)).toBe(false);
    });
  }

  it('surrounds each finder with a light separator', () => {
    const matrix = withPatterns(7);
    const far = matrix.size - 7;

    for (let i = 0; i < 8; i += 1) {
      expect(matrix.get(7, i)).toBe(false); // below top-left
      expect(matrix.get(i, 7)).toBe(false); // right of top-left
      expect(matrix.get(7, matrix.size - 1 - i)).toBe(false); // below top-right
      expect(matrix.get(matrix.size - 1 - i, 7)).toBe(false); // right of bottom-left
      expect(matrix.get(far - 1, i)).toBe(false); // above bottom-left
      expect(matrix.get(i, far - 1)).toBe(false); // left of top-right
    }
  });
});

describe('timing patterns', () => {
  for (const version of [1, 7, 40]) {
    it(`version ${version} alternates along row 6 and column 6`, () => {
      const matrix = withPatterns(version);
      for (let i = 8; i < matrix.size - 8; i += 1) {
        const expected = i % 2 === 0;
        expect(matrix.get(6, i)).toBe(expected);
        expect(matrix.get(i, 6)).toBe(expected);
        expect(matrix.isFunction(6, i)).toBe(true);
        expect(matrix.isFunction(i, 6)).toBe(true);
      }
    });
  }
});

describe('dark module', () => {
  it('sits at (4V + 9, 8) and is dark, at every version', () => {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      const matrix = withPatterns(version);
      expect(matrix.get(4 * version + 9, 8)).toBe(true);
      expect(matrix.isFunction(4 * version + 9, 8)).toBe(true);
    }
  });

  it('is not the transposed position', () => {
    // Transposing to (8, 4V + 9) is a classic error (AGENTS.md section 11).
    // At version 1 that lands on (8, 13), which must stay a reserved light
    // format-information module.
    const matrix = withPatterns(1);
    expect(matrix.get(8, 13)).toBe(false);
  });
});

describe('alignment patterns', () => {
  it('has none at version 1', () => {
    const matrix = withPatterns(1);
    // Version 1 is all finder, timing, format, and data -- no 5x5 rings.
    expect(ALIGNMENT_CENTRES[1]).toEqual([]);
    expect(matrix.get(4 * 1 + 9, 8)).toBe(true); // dark module still present
  });

  it('places one per centre pair except the three finder corners', () => {
    for (let version = 2; version <= MAX_VERSION; version += 1) {
      const centres = ALIGNMENT_CENTRES[version];
      const matrix = withPatterns(version);
      const last = centres.length - 1;

      let placed = 0;
      for (let i = 0; i < centres.length; i += 1) {
        for (let j = 0; j < centres.length; j += 1) {
          const finderCorner = (i === 0 && j === 0)
            || (i === 0 && j === last)
            || (i === last && j === 0);
          if (finderCorner) continue;

          // Centre dark, ring at distance 1 light, ring at distance 2 dark.
          expect(matrix.get(centres[i], centres[j])).toBe(true);
          expect(matrix.get(centres[i] - 1, centres[j])).toBe(false);
          expect(matrix.get(centres[i] - 2, centres[j])).toBe(true);
          placed += 1;
        }
      }

      expect(placed).toBe(centres.length ** 2 - 3);
    }
  });
});

describe('format information area', () => {
  it('reserves 31 distinct modules -- 15 bits twice, plus the shared corner', () => {
    const positions = formatInfoPositions(21);
    expect(positions.length).toBe(30);
    const unique = new Set(positions.map(([r, c]) => `${r},${c}`));
    expect(unique.size).toBe(30);
  });

  it('reserves every position at every version', () => {
    for (const version of [1, 7, 26, 40]) {
      const matrix = withPatterns(version);
      for (const [row, col] of formatInfoPositions(matrix.size)) {
        expect(matrix.isFunction(row, col)).toBe(true);
      }
    }
  });

  it('never collides with a timing pattern', () => {
    const positions = formatInfoPositions(45);
    for (const [row, col] of positions) {
      expect(row === 6 && col > 8).toBe(false);
      expect(col === 6 && row > 8).toBe(false);
    }
  });
});

describe('version information area', () => {
  it('does not exist below version 7', () => {
    for (const version of [1, 2, 6]) {
      const matrix = withPatterns(version);
      const reserved = dataModuleCount(matrix);
      const withoutVersionInfo = dataModuleCount(withPatterns(version));
      expect(reserved).toBe(withoutVersionInfo);
      // Version information would occupy 36 modules near the corners.
      expect(matrix.size).toBeLessThan(45);
    }
  });

  it('reserves 36 distinct modules from version 7', () => {
    for (const version of [7, 20, 40]) {
      const matrix = withPatterns(version);
      const positions = versionInfoPositions(matrix.size);
      expect(positions.length).toBe(36);
      expect(new Set(positions.map(([r, c]) => `${r},${c}`)).size).toBe(36);
      for (const [row, col] of positions) {
        expect(matrix.isFunction(row, col)).toBe(true);
      }
    }
  });
});

describe('placeCodewords', () => {
  it('fills every data module when codewords cover them', () => {
    const matrix = withPatterns(1);
    const codewords = new Uint8Array(TOTAL_CODEWORDS[1]).fill(0xff);
    placeCodewords(matrix, codewords);

    let dark = 0;
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) {
        if (!matrix.isFunction(row, col) && matrix.get(row, col)) dark += 1;
      }
    }
    expect(dark).toBe(TOTAL_CODEWORDS[1] * 8);
  });

  it('starts at the bottom-right and moves upward', () => {
    const matrix = withPatterns(1);
    const codewords = new Uint8Array(TOTAL_CODEWORDS[1]);
    codewords[0] = 0b1000_0000; // only the very first bit is dark
    placeCodewords(matrix, codewords);

    expect(matrix.get(matrix.size - 1, matrix.size - 1)).toBe(true);
    expect(matrix.get(matrix.size - 1, matrix.size - 2)).toBe(false);
    expect(matrix.get(matrix.size - 2, matrix.size - 1)).toBe(false);
  });

  it('never writes into a function module', () => {
    for (const version of [1, 7, 14, 40]) {
      const matrix = withPatterns(version);
      const before = matrix.toRows();
      placeCodewords(matrix, new Uint8Array(TOTAL_CODEWORDS[version]).fill(0xff));

      for (let row = 0; row < matrix.size; row += 1) {
        for (let col = 0; col < matrix.size; col += 1) {
          if (matrix.isFunction(row, col)) {
            expect(matrix.get(row, col)).toBe(before[row][col]);
          }
        }
      }
    }
  });

  it('leaves remainder bits light', () => {
    // Version 2 has 7 remainder bits that no codeword reaches.
    const matrix = withPatterns(2);
    placeCodewords(matrix, new Uint8Array(TOTAL_CODEWORDS[2]).fill(0xff));

    let light = 0;
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) {
        if (!matrix.isFunction(row, col) && !matrix.get(row, col)) light += 1;
      }
    }
    expect(light).toBe(7);
  });

  it('skips the vertical timing column when pairing', () => {
    const matrix = withPatterns(1);
    placeCodewords(matrix, new Uint8Array(TOTAL_CODEWORDS[1]).fill(0xff));
    // Column 6 is entirely function modules, so the alternating timing pattern
    // must survive a full data write.
    for (let row = 8; row < matrix.size - 8; row += 1) {
      expect(matrix.get(row, 6)).toBe(row % 2 === 0);
    }
  });
});
