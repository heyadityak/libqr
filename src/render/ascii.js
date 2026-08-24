/**
 * Terminal and debug rendering.
 *
 * Pulled forward from M7 to M5 (ADR-0011) because it is instrumentation: a
 * matrix bug is obvious as text and invisible as a byte array. Test failures
 * print through this, which is most of its value.
 */

/** Default glyphs: two cells wide per module, so output looks square in a terminal. */
const DEFAULT_DARK = '██';
const DEFAULT_LIGHT = '  ';

/**
 * Renders a matrix as text.
 *
 * @param {import('../core/matrix.js').Matrix} matrix matrix to render
 * @param {object} [options]
 * @param {string} [options.dark] glyph for a dark module
 * @param {string} [options.light] glyph for a light module
 * @param {number} [options.quietZone] quiet zone width in modules
 * @returns {string} newline-separated rows, no trailing newline
 */
export function matrixToAscii(matrix, { dark = DEFAULT_DARK, light = DEFAULT_LIGHT, quietZone = 0 } = {}) {
  const rows = [];
  const width = matrix.size + quietZone * 2;
  const blankRow = light.repeat(width);

  for (let i = 0; i < quietZone; i += 1) rows.push(blankRow);

  for (let row = 0; row < matrix.size; row += 1) {
    let line = light.repeat(quietZone);
    for (let col = 0; col < matrix.size; col += 1) {
      line += matrix.get(row, col) ? dark : light;
    }
    line += light.repeat(quietZone);
    rows.push(line);
  }

  for (let i = 0; i < quietZone; i += 1) rows.push(blankRow);

  return rows.join('\n');
}

/**
 * Renders which modules are function patterns rather than which are dark.
 *
 * Diagnostic only: `#` for a function module, `.` for a data module.
 *
 * @param {import('../core/matrix.js').Matrix} matrix matrix to inspect
 * @returns {string} newline-separated rows
 */
export function toFunctionMap(matrix) {
  const rows = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let line = '';
    for (let col = 0; col < matrix.size; col += 1) {
      line += matrix.isFunction(row, col) ? '#' : '.';
    }
    rows.push(line);
  }
  return rows.join('\n');
}
