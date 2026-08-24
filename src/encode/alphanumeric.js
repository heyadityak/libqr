/**
 * Alphanumeric mode. ISO/IEC 18004 section 8.4.3.
 *
 * Per ADR-0012 this module owns its own mode indicator, character-count widths,
 * and character set.
 */

/** Mode name used across the library. */
export const NAME = 'alphanumeric';

/** Four-bit mode indicator. */
export const MODE_INDICATOR = 0b0010;

/** Character-count indicator width for version ranges 1-9, 10-26, 27-40. */
export const COUNT_BITS = Object.freeze([9, 11, 13]);

/**
 * The 45-character alphanumeric set, in ISO/IEC 18004 Table 5 order.
 *
 * Uppercase only -- lowercase letters are not in the set and fall to byte mode.
 */
export const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const VALUES = new Map();
{
  for (let i = 0; i < CHARSET.length; i += 1) {
    VALUES.set(CHARSET.codePointAt(i), i);
  }
}

/**
 * Whether a code point is in the alphanumeric set.
 *
 * @param {number} codePoint Unicode code point
 * @returns {boolean} true if encodable in alphanumeric mode
 */
export function canEncode(codePoint) {
  return VALUES.has(codePoint);
}

/**
 * Table value for a code point in the alphanumeric set.
 *
 * @param {number} codePoint Unicode code point in the set
 * @returns {number} value 0..44
 */
export function valueOf(codePoint) {
  return VALUES.get(codePoint);
}

/**
 * Data bits for a run of alphanumeric characters, excluding indicators.
 *
 * Two characters pack into 11 bits; a trailing single character takes 6.
 *
 * @param {number} charCount number of characters
 * @returns {number} data bit count
 */
export function dataBitLength(charCount) {
  return 11 * Math.floor(charCount / 2) + 6 * (charCount % 2);
}

/**
 * Writes the data bits for a run of alphanumeric characters.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {string} text characters from CHARSET only
 * @returns {void}
 */
export function write(buffer, text) {
  let i = 0;
  for (; i + 2 <= text.length; i += 2) {
    const high = VALUES.get(text.codePointAt(i));
    const low = VALUES.get(text.codePointAt(i + 1));
    buffer.put(high * 45 + low, 11);
  }
  if (i < text.length) {
    buffer.put(VALUES.get(text.codePointAt(i)), 6);
  }
}
