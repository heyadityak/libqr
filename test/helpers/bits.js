/**
 * Test helpers for reading a BitBuffer as text.
 *
 * Bit strings are the readable form for encoder assertions: a wrong count
 * indicator or a wrong pad shows up as a visible offset, where a byte array
 * diff just looks like noise.
 */

/**
 * @param {import('../../src/util/bitbuffer.js').BitBuffer} buffer source
 * @returns {string} one '0' or '1' per written bit
 */
export function bitString(buffer) {
  let out = '';
  for (let i = 0; i < buffer.bitLength; i += 1) out += buffer.bitAt(i);
  return out;
}

/**
 * @param {import('../../src/util/bitbuffer.js').BitBuffer} buffer source
 * @returns {string} uppercase hex of the written bytes, space separated
 */
export function hexString(buffer) {
  return Array.from(buffer.toBytes(), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
