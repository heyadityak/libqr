/**
 * Geometry shared by every renderer.
 *
 * Renderers read the matrix and never mutate it (ADR-0004), so anything derived
 * from it -- quiet zone offsets, module extents, merged runs -- is computed here
 * rather than annotated onto the matrix.
 */

/**
 * @typedef {object} Run
 * @property {number} row row index, quiet zone excluded
 * @property {number} col starting column, quiet zone excluded
 * @property {number} length number of consecutive dark modules
 */

/**
 * Overall dimensions for a rendered symbol.
 *
 * @param {import('../../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} options
 * @param {number} options.quietZone quiet zone width in modules
 * @param {number} options.scale pixels per module
 * @returns {{modules: number, pixels: number, quietZone: number, scale: number}}
 */
export function dimensions(matrix, { quietZone, scale }) {
  const modules = matrix.size + quietZone * 2;
  return { modules, pixels: modules * scale, quietZone, scale };
}

/**
 * Merges each row's dark modules into horizontal runs.
 *
 * This is what keeps SVG output small: a version 40 symbol has over 31,000
 * modules, and emitting one element per dark module produces a file several
 * times larger than the merged form for no visual difference.
 *
 * @param {import('../../core/matrix.js').Matrix} matrix finished symbol
 * @returns {Run[]} runs in row-major order
 */
export function horizontalRuns(matrix) {
  const runs = [];

  for (let row = 0; row < matrix.size; row += 1) {
    let start = -1;
    for (let col = 0; col < matrix.size; col += 1) {
      const dark = matrix.get(row, col);
      if (dark && start === -1) {
        start = col;
      } else if (!dark && start !== -1) {
        runs.push({ row, col: start, length: col - start });
        start = -1;
      }
    }
    if (start !== -1) {
      runs.push({ row, col: start, length: matrix.size - start });
    }
  }

  return runs;
}

/**
 * Every dark module as an individual cell. For renderers that draw per-module
 * shapes, where merging would change the appearance.
 *
 * @param {import('../../core/matrix.js').Matrix} matrix finished symbol
 * @returns {Array<{row: number, col: number}>} dark module coordinates
 */
export function darkModules(matrix) {
  const cells = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.get(row, col)) cells.push({ row, col });
    }
  }
  return cells;
}
