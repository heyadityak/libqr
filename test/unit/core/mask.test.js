/**
 * M6 gate (ADR-0011): penalty scores for all eight masks, and mask selection.
 *
 * The penalty rules are tested against matrices simple enough to score by hand,
 * so the expected values are derived from the spec rather than from this
 * implementation.
 */
import { describe, expect, it } from 'vitest';
import {
  MASK_COUNT,
  PENALTY_N1,
  PENALTY_N2,
  PENALTY_N3,
  PENALTY_N4,
  applyMask,
  chooseMask,
  drawCandidate,
  maskCondition,
  penalty,
  penaltyBalance,
  penaltyBlocks,
  penaltyBreakdown,
  penaltyFinderLike,
  penaltyRuns,
} from '../../../src/core/mask.js';
import { Matrix, placeCodewords } from '../../../src/core/matrix.js';
import { placeFunctionPatterns } from '../../../src/core/patterns.js';
import { buildCodewords } from '../../../src/core/version.js';
import { makeSegments } from '../../../src/core/segment.js';
import { versionRangeIndex } from '../../../src/core/mode.js';
import { EC_LEVELS } from '../../../src/core/constants.js';

/** A version 1 matrix with no function modules, filled uniformly. */
function uniform(version, dark) {
  const matrix = new Matrix(version);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, dark);
  }
  return matrix;
}

/** A fully drawn, unmasked version 1 symbol for a payload. */
function unmaskedSymbol(text, version, ecLevel) {
  const segments = makeSegments(text, { rangeIndex: versionRangeIndex(version) });
  const codewords = buildCodewords({ segments, version, ecLevel });
  const matrix = new Matrix(version);
  placeFunctionPatterns(matrix);
  placeCodewords(matrix, codewords);
  return matrix;
}

describe('penalty constants', () => {
  it('match ISO/IEC 18004 Table 11', () => {
    expect(PENALTY_N1).toBe(3);
    expect(PENALTY_N2).toBe(3);
    expect(PENALTY_N3).toBe(40);
    expect(PENALTY_N4).toBe(10);
  });
});

describe('penalty rule 1: same-colour runs', () => {
  it('scores a uniform 21x21 as 3 + (21 - 5) per line, both directions', () => {
    // 19 points per line, 21 rows plus 21 columns.
    expect(penaltyRuns(uniform(1, false))).toBe(19 * 42);
    expect(penaltyRuns(uniform(1, true))).toBe(19 * 42);
  });

  it('ignores runs shorter than five', () => {
    const matrix = new Matrix(1);
    // Alternating modules: longest run is 1.
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, (row + col) % 2 === 0);
    }
    expect(penaltyRuns(matrix)).toBe(0);
  });

  it('charges one extra point per module beyond five', () => {
    const matrix = new Matrix(1);
    // One horizontal run of exactly 5 dark in row 0, everything else alternating
    // to avoid incidental runs.
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, (row + col) % 2 === 0);
    }
    for (let col = 0; col < 5; col += 1) matrix.set(0, col, true);
    // Row 0 now has a run of 5. Columns 1 and 3 gain a run of 2 at most.
    expect(penaltyRuns(matrix)).toBe(PENALTY_N1);
  });
});

describe('penalty rule 2: 2x2 blocks', () => {
  it('scores every overlapping block in a uniform symbol', () => {
    expect(penaltyBlocks(uniform(1, false))).toBe(20 * 20 * PENALTY_N2);
    expect(penaltyBlocks(uniform(1, true))).toBe(20 * 20 * PENALTY_N2);
  });

  it('scores nothing on a checkerboard', () => {
    const matrix = new Matrix(1);
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, (row + col) % 2 === 0);
    }
    expect(penaltyBlocks(matrix)).toBe(0);
  });

  it('counts overlapping blocks separately', () => {
    const matrix = new Matrix(1);
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, (row + col) % 2 === 0);
    }
    // A solid 3x3 area contains four overlapping 2x2 blocks.
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) matrix.set(row, col, true);
    }
    expect(penaltyBlocks(matrix)).toBe(4 * PENALTY_N2);
  });
});

describe('penalty rule 3: finder-like sequences', () => {
  it('scores nothing on a uniform symbol', () => {
    expect(penaltyFinderLike(uniform(1, false))).toBe(0);
    expect(penaltyFinderLike(uniform(1, true))).toBe(0);
  });

  it('scores 40 for one occurrence', () => {
    // All dark, with 00001011101 written across the start of row 10. A single
    // flipped module cannot create four consecutive light modules in any
    // column, so only the row can match, and only once.
    const matrix = uniform(1, true);
    const pattern = '00001011101';
    for (let col = 0; col < pattern.length; col += 1) {
      matrix.set(10, col, pattern[col] === '1');
    }
    expect(penaltyFinderLike(matrix)).toBe(PENALTY_N3);
  });

  it('scores the mirrored sequence too', () => {
    const matrix = uniform(1, true);
    const pattern = '10111010000';
    for (let col = 0; col < pattern.length; col += 1) {
      matrix.set(10, col, pattern[col] === '1');
    }
    expect(penaltyFinderLike(matrix)).toBe(PENALTY_N3);
  });

  it('finds sequences in columns as well as rows', () => {
    const matrix = uniform(1, true);
    const pattern = '00001011101';
    for (let row = 0; row < pattern.length; row += 1) {
      matrix.set(row, 10, pattern[row] === '1');
    }
    expect(penaltyFinderLike(matrix)).toBe(PENALTY_N3);
  });

  it('does not fire on 1011101 without four light modules beside it', () => {
    const matrix = uniform(1, true);
    const pattern = '1011101';
    for (let col = 0; col < pattern.length; col += 1) {
      matrix.set(10, col, pattern[col] === '1');
    }
    expect(penaltyFinderLike(matrix)).toBe(0);
  });
});

describe('penalty rule 4: dark balance', () => {
  it('charges the maximum for an all-light symbol', () => {
    // 0% dark is 10 steps of 5% from 50%, minus the free first step.
    expect(penaltyBalance(uniform(1, false))).toBe(9 * PENALTY_N4);
  });

  it('charges the maximum for an all-dark symbol', () => {
    expect(penaltyBalance(uniform(1, true))).toBe(9 * PENALTY_N4);
  });

  it('charges nothing near an even split', () => {
    const matrix = new Matrix(1);
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) matrix.set(row, col, (row + col) % 2 === 0);
    }
    // 221 of 441 modules dark: 50.1%.
    expect(penaltyBalance(matrix)).toBe(0);
  });

  it('is never negative', () => {
    for (let dark = 0; dark <= 441; dark += 1) {
      const matrix = new Matrix(1);
      let placed = 0;
      for (let row = 0; row < matrix.size && placed < dark; row += 1) {
        for (let col = 0; col < matrix.size && placed < dark; col += 1) {
          matrix.set(row, col, true);
          placed += 1;
        }
      }
      expect(penaltyBalance(matrix)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('total penalty', () => {
  it('sums to a hand-computable value for a uniform version 1 symbol', () => {
    // Runs 798, blocks 1200, finder-like 0, balance 90.
    const expected = 19 * 42 + 20 * 20 * PENALTY_N2 + 0 + 9 * PENALTY_N4;
    expect(expected).toBe(2088);
    expect(penalty(uniform(1, false))).toBe(2088);
    expect(penalty(uniform(1, true))).toBe(2088);
  });

  it('breakdown components add up to the total', () => {
    const matrix = unmaskedSymbol('HELLO WORLD', 1, 'Q');
    const parts = penaltyBreakdown(matrix);
    expect(parts.runs + parts.blocks + parts.finderLike + parts.balance).toBe(parts.total);
    expect(parts.total).toBe(penalty(matrix));
  });
});

describe('mask conditions', () => {
  it('defines eight of them', () => {
    expect(MASK_COUNT).toBe(8);
  });

  it('matches ISO/IEC 18004 Table 10', () => {
    const table = [
      (i, j) => (i + j) % 2 === 0,
      (i) => i % 2 === 0,
      (_i, j) => j % 3 === 0,
      (i, j) => (i + j) % 3 === 0,
      (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
      (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
      (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
      (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
    ];

    for (let id = 0; id < MASK_COUNT; id += 1) {
      const condition = maskCondition(id);
      for (let row = 0; row < 25; row += 1) {
        for (let col = 0; col < 25; col += 1) {
          expect(condition(row, col)).toBe(table[id](row, col));
        }
      }
    }
  });

  it('gives each mask a distinct pattern', () => {
    const signatures = new Set();
    for (let id = 0; id < MASK_COUNT; id += 1) {
      const condition = maskCondition(id);
      let signature = '';
      for (let row = 0; row < 12; row += 1) {
        for (let col = 0; col < 12; col += 1) signature += condition(row, col) ? '1' : '0';
      }
      signatures.add(signature);
    }
    expect(signatures.size).toBe(MASK_COUNT);
  });
});

describe('applyMask', () => {
  it('is its own inverse', () => {
    for (let id = 0; id < MASK_COUNT; id += 1) {
      const matrix = unmaskedSymbol('HELLO WORLD', 1, 'Q');
      const before = matrix.toRows();
      applyMask(matrix, id);
      applyMask(matrix, id);
      expect(matrix.toRows()).toEqual(before);
    }
  });

  it('never touches a function module', () => {
    for (let id = 0; id < MASK_COUNT; id += 1) {
      const matrix = unmaskedSymbol('HELLO WORLD', 7, 'M');
      const before = matrix.toRows();
      applyMask(matrix, id);
      for (let row = 0; row < matrix.size; row += 1) {
        for (let col = 0; col < matrix.size; col += 1) {
          if (matrix.isFunction(row, col)) {
            expect(matrix.get(row, col)).toBe(before[row][col]);
          }
        }
      }
    }
  });

  it('actually changes data modules', () => {
    for (let id = 0; id < MASK_COUNT; id += 1) {
      const matrix = unmaskedSymbol('HELLO WORLD', 1, 'Q');
      const before = matrix.toRows();
      applyMask(matrix, id);
      expect(matrix.toRows()).not.toEqual(before);
    }
  });
});

describe('chooseMask', () => {
  it('returns the lowest-penalty mask, ties going to the lower id', () => {
    const base = unmaskedSymbol('HELLO WORLD', 1, 'Q');
    const scores = [];
    for (let id = 0; id < MASK_COUNT; id += 1) {
      scores.push(penalty(drawCandidate(base, 'Q', id)));
    }
    const lowest = Math.min(...scores);

    const chosen = chooseMask(base, 'Q');
    expect(chosen.penalty).toBe(lowest);
    expect(chosen.mask).toBe(scores.indexOf(lowest));
  });

  it('is deterministic', () => {
    const base = unmaskedSymbol('HELLO WORLD', 1, 'Q');
    const first = chooseMask(base, 'Q');
    const second = chooseMask(base, 'Q');
    expect(second.mask).toBe(first.mask);
    expect(second.matrix.toRows()).toEqual(first.matrix.toRows());
  });

  it('leaves the base matrix unmasked', () => {
    const base = unmaskedSymbol('HELLO WORLD', 1, 'Q');
    const before = base.toRows();
    chooseMask(base, 'Q');
    expect(base.toRows()).toEqual(before);
  });

  it('honours a forced mask', () => {
    const base = unmaskedSymbol('HELLO WORLD', 1, 'Q');
    for (let id = 0; id < MASK_COUNT; id += 1) {
      const result = chooseMask(base, 'Q', id);
      expect(result.mask).toBe(id);
      expect(result.matrix.toRows()).toEqual(drawCandidate(base, 'Q', id).toRows());
    }
  });

  it('writes format information for the chosen mask', () => {
    // "HELLO WORLD" needs 74 bits and version 1 at level H holds 72, so the
    // strongest level gets a shorter payload.
    const base = unmaskedSymbol('HELLO', 1, 'H');
    const { mask, matrix } = chooseMask(base, 'H');
    // Re-deriving the candidate for that mask must reproduce the symbol exactly.
    expect(matrix.toRows()).toEqual(drawCandidate(base, 'H', mask).toRows());
  });

  it('produces a scannable-looking balance at every level', () => {
    for (const level of EC_LEVELS) {
      const base = unmaskedSymbol('HELLO', 1, level);
      const { matrix } = chooseMask(base, level);
      const ratio = matrix.darkCount() / (matrix.size * matrix.size);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.7);
    }
  });
});
