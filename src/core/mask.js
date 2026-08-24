/**
 * Data masking and mask selection. ISO/IEC 18004 section 8.8.
 *
 * Masking XORs a fixed pattern over the data modules, to break up large blocks
 * of one colour and sequences that look like finder patterns -- both of which
 * make a symbol harder to scan. Eight patterns are defined; the encoder tries
 * all eight and keeps whichever scores lowest against four penalty rules.
 */
import { writeFormatInfo, writeVersionInfo } from './format-info.js';

/** Number of defined mask patterns. */
export const MASK_COUNT = 8;

/** Penalty for a run of five or more same-coloured modules. */
export const PENALTY_N1 = 3;

/** Penalty for a 2x2 block of one colour. */
export const PENALTY_N2 = 3;

/** Penalty for a finder-like 1:1:3:1:1 sequence. */
export const PENALTY_N3 = 40;

/** Penalty per 5% that dark coverage deviates from half. */
export const PENALTY_N4 = 10;

/**
 * The eight mask conditions, ISO/IEC 18004 Table 10. A true result means the
 * module is inverted.
 */
const CONDITIONS = Object.freeze([
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
]);

/** The finder-like sequence, and the same sequence reversed, as 11-bit windows. */
const N3_PATTERN_A = 0b1011_1010_000;
const N3_PATTERN_B = 0b0000_1011_101;
const N3_WINDOW = 11;
const N3_WINDOW_MASK = (1 << N3_WINDOW) - 1;

/**
 * The mask condition for a pattern id.
 *
 * @param {number} id mask pattern 0..7
 * @returns {(row: number, col: number) => boolean} true where the module inverts
 */
export function maskCondition(id) {
  return CONDITIONS[id];
}

/**
 * Inverts data modules where the mask condition holds. Function modules are
 * never touched.
 *
 * Applying the same mask twice returns the original, which the tests rely on.
 *
 * @param {import('./matrix.js').Matrix} matrix matrix with data already placed
 * @param {number} id mask pattern 0..7
 * @returns {void}
 */
export function applyMask(matrix, id) {
  const condition = CONDITIONS[id];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.isFunction(row, col)) continue;
      if (condition(row, col)) matrix.set(row, col, !matrix.get(row, col));
    }
  }
}

/**
 * Penalty rule 1: runs of five or more same-coloured modules, counted along
 * every row and every column.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {number} penalty points
 */
export function penaltyRuns(matrix) {
  let penalty = 0;

  const scoreLine = (get) => {
    let runColour = get(0);
    let runLength = 1;
    for (let i = 1; i < matrix.size; i += 1) {
      const colour = get(i);
      if (colour === runColour) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += PENALTY_N1 + (runLength - 5);
        runColour = colour;
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += PENALTY_N1 + (runLength - 5);
  };

  for (let row = 0; row < matrix.size; row += 1) {
    scoreLine((col) => matrix.get(row, col));
  }
  for (let col = 0; col < matrix.size; col += 1) {
    scoreLine((row) => matrix.get(row, col));
  }

  return penalty;
}

/**
 * Penalty rule 2: every 2x2 block of a single colour. Overlapping blocks each
 * count, so a solid 3x3 area scores four blocks.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {number} penalty points
 */
export function penaltyBlocks(matrix) {
  let penalty = 0;
  for (let row = 0; row < matrix.size - 1; row += 1) {
    for (let col = 0; col < matrix.size - 1; col += 1) {
      const colour = matrix.get(row, col);
      if (matrix.get(row, col + 1) === colour
        && matrix.get(row + 1, col) === colour
        && matrix.get(row + 1, col + 1) === colour) {
        penalty += PENALTY_N2;
      }
    }
  }
  return penalty;
}

/**
 * Penalty rule 3: sequences that mimic a finder pattern -- `1011101` with four
 * light modules on either side -- in any row or column.
 *
 * These are what cause a decoder to mistake data for a finder, so they are
 * penalised an order of magnitude more heavily than the other rules.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {number} penalty points
 */
export function penaltyFinderLike(matrix) {
  let penalty = 0;

  const scoreLine = (get) => {
    let window = 0;
    for (let i = 0; i < matrix.size; i += 1) {
      window = ((window << 1) | (get(i) ? 1 : 0)) & N3_WINDOW_MASK;
      if (i < N3_WINDOW - 1) continue;
      if (window === N3_PATTERN_A || window === N3_PATTERN_B) penalty += PENALTY_N3;
    }
  };

  for (let row = 0; row < matrix.size; row += 1) {
    scoreLine((col) => matrix.get(row, col));
  }
  for (let col = 0; col < matrix.size; col += 1) {
    scoreLine((row) => matrix.get(row, col));
  }

  return penalty;
}

/**
 * Penalty rule 4: how far dark coverage strays from half, in 5% steps.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {number} penalty points
 */
export function penaltyBalance(matrix) {
  const total = matrix.size * matrix.size;
  const dark = matrix.darkCount();
  // Smallest k >= 0 with (45 - 5k)% <= dark/total <= (55 + 5k)%. Integer-only,
  // so no floating point rounding creeps into mask selection.
  const steps = Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
  return steps * PENALTY_N4;
}

/**
 * All four penalties and their total.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {{runs: number, blocks: number, finderLike: number, balance: number, total: number}}
 */
export function penaltyBreakdown(matrix) {
  const runs = penaltyRuns(matrix);
  const blocks = penaltyBlocks(matrix);
  const finderLike = penaltyFinderLike(matrix);
  const balance = penaltyBalance(matrix);
  return { runs, blocks, finderLike, balance, total: runs + blocks + finderLike + balance };
}

/**
 * Total penalty score for a fully drawn symbol.
 *
 * @param {import('./matrix.js').Matrix} matrix symbol to score
 * @returns {number} penalty points; lower is better
 */
export function penalty(matrix) {
  return penaltyRuns(matrix) + penaltyBlocks(matrix)
    + penaltyFinderLike(matrix) + penaltyBalance(matrix);
}

/**
 * Draws a single mask candidate: applies the mask and writes format and version
 * information, so the score covers the finished symbol.
 *
 * @param {import('./matrix.js').Matrix} base matrix with function patterns and data placed, unmasked
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} id mask pattern 0..7
 * @returns {import('./matrix.js').Matrix} a new, complete matrix
 */
export function drawCandidate(base, ecLevel, id) {
  const candidate = base.clone();
  applyMask(candidate, id);
  writeFormatInfo(candidate, ecLevel, id);
  writeVersionInfo(candidate);
  return candidate;
}

/**
 * Chooses the mask with the lowest penalty, or draws a caller-specified one.
 *
 * Ties resolve to the lower mask id, because iteration order has to be
 * deterministic for output to be reproducible.
 *
 * @param {import('./matrix.js').Matrix} base matrix with function patterns and data placed, unmasked
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} [forcedMask] mask 0..7 to use instead of scoring
 * @returns {{mask: number, matrix: import('./matrix.js').Matrix, penalty: number}} chosen mask and the
 *   finished symbol
 */
export function chooseMask(base, ecLevel, forcedMask) {
  if (forcedMask !== undefined) {
    const matrix = drawCandidate(base, ecLevel, forcedMask);
    return { mask: forcedMask, matrix, penalty: penalty(matrix) };
  }

  let bestMask = 0;
  let bestMatrix = null;
  let bestPenalty = Infinity;

  for (let id = 0; id < MASK_COUNT; id += 1) {
    const candidate = drawCandidate(base, ecLevel, id);
    const score = penalty(candidate);
    if (score < bestPenalty) {
      bestPenalty = score;
      bestMask = id;
      bestMatrix = candidate;
    }
  }

  return { mask: bestMask, matrix: bestMatrix, penalty: bestPenalty };
}
