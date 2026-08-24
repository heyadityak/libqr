/**
 * Decoding helper for roundtrip tests.
 *
 * ADR-0008 is explicit that this is **supplementary**: consumer decoders are
 * deliberately lenient, so a successful roundtrip does not prove conformance.
 * The golden vectors are the gate. What this catches cheaply is gross errors --
 * a transposed matrix, a wrong mask, a broken interleave.
 *
 * The RGBA buffer is synthesised directly from the matrix, so no canvas and no
 * browser are involved.
 */
import jsQR from 'jsqr';

/** Scale factor for the synthesised image. Decoders need more than one pixel per module. */
const PIXELS_PER_MODULE = 4;

/** Quiet zone used when rasterising, in modules. */
const QUIET_ZONE = 4;

/**
 * Rasterises a matrix into an RGBA buffer.
 *
 * @param {import('../../src/core/matrix.js').Matrix} matrix finished symbol
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} RGBA image
 */
export function rasterise(matrix) {
  const modules = matrix.size + QUIET_ZONE * 2;
  const width = modules * PIXELS_PER_MODULE;
  const data = new Uint8ClampedArray(width * width * 4).fill(0xff);

  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.get(row, col)) continue;

      const top = (row + QUIET_ZONE) * PIXELS_PER_MODULE;
      const left = (col + QUIET_ZONE) * PIXELS_PER_MODULE;
      for (let y = top; y < top + PIXELS_PER_MODULE; y += 1) {
        for (let x = left; x < left + PIXELS_PER_MODULE; x += 1) {
          const offset = (y * width + x) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }

  return { data, width, height: width };
}

/**
 * Decodes a matrix back to text.
 *
 * @param {import('../../src/core/matrix.js').Matrix} matrix finished symbol
 * @returns {string|null} decoded payload, or null if the decoder failed
 */
export function decodeMatrix(matrix) {
  const { data, width, height } = rasterise(matrix);
  const result = jsQR(data, width, height);
  return result === null ? null : result.data;
}
