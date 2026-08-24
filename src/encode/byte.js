/**
 * Byte mode. ISO/IEC 18004 section 8.4.4.
 *
 * Per ADR-0012 this module owns its own mode indicator and character-count
 * widths. Note that the count width does **not** step up a third time: it is 16
 * bits for both version ranges 10-26 and 27-40, unlike every other mode.
 */

/** Mode name used across the library. */
export const NAME = 'byte';

/** Four-bit mode indicator. */
export const MODE_INDICATOR = 0b0100;

/** Character-count indicator width for version ranges 1-9, 10-26, 27-40. */
export const COUNT_BITS = Object.freeze([8, 16, 16]);

/**
 * Byte mode encodes any code point, so this is unconditionally true. Kept for
 * interface symmetry with the other encoders.
 *
 * @param {number} _codePoint ignored
 * @returns {boolean} always true
 */
export function canEncode(_codePoint) {
  return true;
}

/**
 * Data bits for a run of bytes, excluding indicators.
 *
 * @param {number} byteCount number of bytes, not characters
 * @returns {number} data bit count
 */
export function dataBitLength(byteCount) {
  return 8 * byteCount;
}

/**
 * Writes the data bits for a byte run.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {Uint8Array} bytes already-encoded bytes
 * @returns {void}
 */
export function write(buffer, bytes) {
  for (let i = 0; i < bytes.length; i += 1) {
    buffer.put(bytes[i], 8);
  }
}
