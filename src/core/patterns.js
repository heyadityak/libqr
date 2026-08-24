/**
 * Function pattern placement. ISO/IEC 18004 section 6.3.
 *
 * Function patterns are the parts of a symbol that carry no data: the three
 * finder patterns and their separators, the two timing patterns, the alignment
 * patterns, the dark module, and the reserved areas for format and version
 * information. Everything here marks modules as function modules, so data
 * placement and masking step over them.
 */
import { ALIGNMENT_CENTRES } from './constants.js';

/** Side length of a finder pattern. */
const FINDER_SIZE = 7;

/** Radius of an alignment pattern from its centre. */
const ALIGNMENT_RADIUS = 2;

/**
 * Places all function patterns and reserves the format and version areas.
 *
 * @param {import('./matrix.js').Matrix} matrix empty matrix at the target version
 * @returns {void}
 */
export function placeFunctionPatterns(matrix) {
  placeFinderPatterns(matrix);
  placeTimingPatterns(matrix);
  placeAlignmentPatterns(matrix);
  placeDarkModule(matrix);
  reserveFormatInfo(matrix);
  reserveVersionInfo(matrix);
}

/**
 * The three finder patterns and their separators.
 *
 * Top-left, top-right, and bottom-left -- never bottom-right, which is what
 * lets a decoder work out the symbol's rotation.
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function placeFinderPatterns(matrix) {
  const far = matrix.size - FINDER_SIZE;
  for (const [top, left] of [[0, 0], [0, far], [far, 0]]) {
    placeFinder(matrix, top, left);
    placeSeparator(matrix, top, left);
  }
}

/** One 7x7 finder: dark ring, light ring, dark 3x3 core. */
function placeFinder(matrix, top, left) {
  for (let row = 0; row < FINDER_SIZE; row += 1) {
    for (let col = 0; col < FINDER_SIZE; col += 1) {
      // Chebyshev distance from the centre: 2 is the light ring, everything
      // else is dark.
      const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
      matrix.setFunction(top + row, left + col, ring !== 2);
    }
  }
}

/** The light border separating a finder from the data region. */
function placeSeparator(matrix, top, left) {
  for (let i = -1; i <= FINDER_SIZE; i += 1) {
    for (const [row, col] of [
      [top - 1, left + i],
      [top + FINDER_SIZE, left + i],
      [top + i, left - 1],
      [top + i, left + FINDER_SIZE],
    ]) {
      if (matrix.contains(row, col) && !matrix.isFunction(row, col)) {
        matrix.setFunction(row, col, false);
      }
    }
  }
}

/**
 * The two timing patterns: alternating modules along row 6 and column 6,
 * giving a decoder a module-width reference across the whole symbol.
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function placeTimingPatterns(matrix) {
  for (let i = FINDER_SIZE + 1; i < matrix.size - FINDER_SIZE - 1; i += 1) {
    const dark = i % 2 === 0;
    matrix.setFunction(6, i, dark);
    matrix.setFunction(i, 6, dark);
  }
}

/**
 * Alignment patterns at every centre pair, except the three that would collide
 * with a finder pattern.
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function placeAlignmentPatterns(matrix) {
  const centres = ALIGNMENT_CENTRES[matrix.version];
  const last = centres.length - 1;

  for (let i = 0; i < centres.length; i += 1) {
    for (let j = 0; j < centres.length; j += 1) {
      // The three corners occupied by finder patterns.
      const isFinderCorner = (i === 0 && j === 0)
        || (i === 0 && j === last)
        || (i === last && j === 0);
      if (isFinderCorner) continue;

      placeAlignment(matrix, centres[i], centres[j]);
    }
  }
}

/** One 5x5 alignment pattern: dark ring, light ring, single dark centre. */
function placeAlignment(matrix, centreRow, centreCol) {
  for (let dr = -ALIGNMENT_RADIUS; dr <= ALIGNMENT_RADIUS; dr += 1) {
    for (let dc = -ALIGNMENT_RADIUS; dc <= ALIGNMENT_RADIUS; dc += 1) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      matrix.setFunction(centreRow + dr, centreCol + dc, ring !== 1);
    }
  }
}

/**
 * The single always-dark module below the top-right of the bottom-left finder.
 *
 * Position is `(4V + 9, 8)` -- row then column. Transposing it is a classic
 * error that produces a symbol strict readers reject (AGENTS.md section 11).
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function placeDarkModule(matrix) {
  matrix.setFunction(4 * matrix.version + 9, 8, true);
}

/**
 * Reserves the format information areas. Values are written after masking,
 * since the format bits encode which mask was chosen.
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function reserveFormatInfo(matrix) {
  for (const [row, col] of formatInfoPositions(matrix.size)) {
    matrix.reserve(row, col);
  }
}

/**
 * The 15 module positions of each format information copy, in bit order --
 * most significant bit first.
 *
 * @param {number} size symbol side length
 * @returns {Array<[number, number]>} 30 positions: the first copy's 15, then
 *   the second copy's 15
 */
export function formatInfoPositions(size) {
  const first = [];
  // Down the left of the top-left finder, then right along its bottom,
  // skipping the timing pattern crossings at (6, 8) and (8, 6).
  for (let i = 0; i <= 5; i += 1) first.push([8, i]);
  first.push([8, 7]);
  first.push([8, 8]);
  first.push([7, 8]);
  for (let i = 5; i >= 0; i -= 1) first.push([i, 8]);

  const second = [];
  // Up the left edge beside the bottom-left finder, then left along the top
  // beside the top-right finder.
  for (let i = 0; i <= 6; i += 1) second.push([size - 1 - i, 8]);
  for (let i = 7; i < 15; i += 1) second.push([8, size - 15 + i]);

  return [...first, ...second];
}

/**
 * Reserves the version information areas, which exist only from version 7.
 *
 * @param {import('./matrix.js').Matrix} matrix target
 * @returns {void}
 */
export function reserveVersionInfo(matrix) {
  if (matrix.version < 7) return;
  for (const [row, col] of versionInfoPositions(matrix.size)) {
    matrix.reserve(row, col);
  }
}

/**
 * The 18 module positions of each version information copy, in bit order --
 * least significant bit first, which is the order the spec lays them out.
 *
 * @param {number} size symbol side length
 * @returns {Array<[number, number]>} 36 positions: the bottom-left copy's 18,
 *   then the top-right copy's 18
 */
export function versionInfoPositions(size) {
  const bottomLeft = [];
  const topRight = [];

  for (let bit = 0; bit < 18; bit += 1) {
    const a = Math.floor(bit / 3);
    const b = bit % 3;
    bottomLeft.push([size - 11 + b, a]);
    topRight.push([a, size - 11 + b]);
  }

  return [...bottomLeft, ...topRight];
}
