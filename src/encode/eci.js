/**
 * Extended Channel Interpretation designators. ISO/IEC 18004 section 8.4.1.2.
 *
 * An ECI header tells the decoder which character set the following byte-mode
 * data uses. Without one, decoders fall back to their default -- historically
 * Latin-1 or Shift-JIS depending on the reader -- which is why non-ASCII text
 * encoded as UTF-8 needs an explicit designator to decode reliably.
 */

/** Four-bit mode indicator for an ECI header. */
export const MODE_INDICATOR = 0b0111;

/** ECI assignment number for UTF-8. */
export const ECI_UTF8 = 26;

/** ECI assignment number for ISO/IEC 8859-1 (Latin-1). */
export const ECI_LATIN1 = 3;

/** Largest assignment number the three-byte form can express. */
export const MAX_ECI = 999999;

/**
 * Bits the designator occupies, excluding the 4-bit mode indicator.
 *
 * @param {number} eci assignment number
 * @returns {number} 8, 16, or 24
 */
export function designatorBitLength(eci) {
  if (eci < 1 << 7) return 8;
  if (eci < 1 << 14) return 16;
  return 24;
}

/**
 * Total bits an ECI header occupies, mode indicator included.
 *
 * @param {number} eci assignment number
 * @returns {number} bit count
 */
export function bitLength(eci) {
  return 4 + designatorBitLength(eci);
}

/**
 * Writes a complete ECI header.
 *
 * The designator length is self-describing via its leading bits: `0` for one
 * byte, `10` for two, `110` for three.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {number} eci assignment number, 0..999999
 * @returns {void}
 */
export function write(buffer, eci) {
  buffer.put(MODE_INDICATOR, 4);
  if (eci < 1 << 7) {
    buffer.put(eci, 8);
  } else if (eci < 1 << 14) {
    buffer.put(0b10, 2);
    buffer.put(eci, 14);
  } else {
    buffer.put(0b110, 3);
    buffer.put(eci, 21);
  }
}
