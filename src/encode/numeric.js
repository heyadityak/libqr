/**
 * Numeric mode. ISO/IEC 18004 section 8.4.2.
 *
 * Per ADR-0012 this module owns its own mode indicator and character-count
 * widths, rather than reading them from `core/`.
 */

/** Mode name used across the library. */
export const NAME = 'numeric';

/** Four-bit mode indicator. */
export const MODE_INDICATOR = 0b0001;

/**
 * Character-count indicator width for version ranges 1-9, 10-26, 27-40.
 *
 * The step at version 10 and again at version 27 only breaks large payloads,
 * so short-string tests will not catch getting it wrong (AGENTS.md section 11).
 */
export const COUNT_BITS = Object.freeze([10, 12, 14]);

/** Bits contributed by a trailing group of 0, 1, or 2 digits. */
const REMAINDER_BITS = Object.freeze([0, 4, 7]);

/**
 * Whether a code point can be encoded in numeric mode.
 *
 * @param {number} codePoint Unicode code point
 * @returns {boolean} true for ASCII digits
 */
export function canEncode(codePoint) {
  return codePoint >= 0x30 && codePoint <= 0x39;
}

/**
 * Data bits for a run of digits, excluding mode and count indicators.
 *
 * Three digits pack into 10 bits; a trailing pair takes 7 and a single digit 4.
 *
 * @param {number} charCount number of digits
 * @returns {number} data bit count
 */
export function dataBitLength(charCount) {
  return 10 * Math.floor(charCount / 3) + REMAINDER_BITS[charCount % 3];
}

/**
 * Writes the data bits for a run of digits.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {string} text digits only; behaviour is undefined otherwise
 * @returns {void}
 */
export function write(buffer, text) {
  let i = 0;
  for (; i + 3 <= text.length; i += 3) {
    buffer.put(Number(text.slice(i, i + 3)), 10);
  }
  const remaining = text.length - i;
  if (remaining > 0) {
    buffer.put(Number(text.slice(i)), REMAINDER_BITS[remaining]);
  }
}
