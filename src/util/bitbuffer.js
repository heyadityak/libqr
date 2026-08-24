/**
 * Append-only bit writer.
 *
 * Lives in `util/` rather than `core/` because both `core/` and `encode/` write
 * into it, and ADR-0003 pushes shared helpers down a layer. See ADR-0012.
 *
 * Backed by a `Uint8Array` that doubles on demand. Bits are written most
 * significant first within each byte, which is the order QR codewords appear on
 * the wire, so `toBytes()` needs no reordering.
 */

/** Append-only most-significant-bit-first bit writer. */
export class BitBuffer {
  /** @param {number} [initialBytes] starting capacity in bytes */
  constructor(initialBytes = 64) {
    this._bytes = new Uint8Array(Math.max(1, initialBytes));
    this._bitLength = 0;
  }

  /** @returns {number} number of bits written so far */
  get bitLength() {
    return this._bitLength;
  }

  /** @returns {number} number of whole bytes the written bits occupy, rounded up */
  get byteLength() {
    return Math.ceil(this._bitLength / 8);
  }

  /**
   * Appends the low `bits` bits of `value`, most significant first.
   *
   * @param {number} value non-negative integer; bits above `bits` are ignored
   * @param {number} bits how many bits to append, 0 to 32
   * @returns {void}
   */
  put(value, bits) {
    for (let i = bits - 1; i >= 0; i -= 1) {
      this.putBit((value >>> i) & 1);
    }
  }

  /**
   * Appends a single bit.
   *
   * @param {number} bit 0 or 1; any nonzero value is treated as 1
   * @returns {void}
   */
  putBit(bit) {
    const byteIndex = this._bitLength >>> 3;
    if (byteIndex >= this._bytes.length) this._grow();
    if (bit) {
      this._bytes[byteIndex] |= 0x80 >>> (this._bitLength & 7);
    }
    this._bitLength += 1;
  }

  /**
   * Reads a previously written bit.
   *
   * @param {number} index bit position from the start
   * @returns {number} 0 or 1
   */
  bitAt(index) {
    return (this._bytes[index >>> 3] >>> (7 - (index & 7))) & 1;
  }

  /**
   * Pads with zero bits until the length is a multiple of 8.
   *
   * @returns {void}
   */
  padToByteBoundary() {
    while (this._bitLength % 8 !== 0) this.putBit(0);
  }

  /**
   * Copy of the written bytes. A trailing partial byte is zero-padded.
   *
   * @returns {Uint8Array} written bytes
   */
  toBytes() {
    return this._bytes.slice(0, this.byteLength);
  }

  _grow() {
    const grown = new Uint8Array(this._bytes.length * 2);
    grown.set(this._bytes);
    this._bytes = grown;
  }
}
