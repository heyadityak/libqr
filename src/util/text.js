/**
 * Text and byte helpers.
 *
 * Character-class predicates that belong to a specific QR mode live with that
 * mode's encoder (ADR-0012); this module holds only the generic pieces.
 */

const utf8Encoder = new TextEncoder();

/**
 * Encodes text as UTF-8.
 *
 * @param {string} text input string
 * @returns {Uint8Array} UTF-8 bytes
 */
export function utf8Bytes(text) {
  return utf8Encoder.encode(text);
}

/**
 * Number of UTF-8 bytes a single code point occupies.
 *
 * @param {number} codePoint Unicode code point
 * @returns {number} 1, 2, 3, or 4
 */
export function utf8LengthOf(codePoint) {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Encodes text as Latin-1, replacing anything outside the range.
 *
 * @param {string} text input string
 * @returns {{bytes: Uint8Array, unrepresentable: number}} bytes, and how many
 *   code points fell outside Latin-1 and were replaced with `?`
 */
export function latin1Bytes(text) {
  const bytes = new Uint8Array(text.length);
  let unrepresentable = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      bytes[i] = 0x3f; // '?'
      unrepresentable += 1;
    } else {
      bytes[i] = code;
    }
  }
  return { bytes, unrepresentable };
}

/**
 * Splits text into code points, keeping surrogate pairs intact.
 *
 * @param {string} text input string
 * @returns {string[]} one entry per code point
 */
export function codePoints(text) {
  return Array.from(text);
}
