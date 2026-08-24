import { describe, expect, it } from 'vitest';
import { BitBuffer } from '../../../src/util/bitbuffer.js';
import { bitString } from '../../helpers/bits.js';

describe('BitBuffer', () => {
  it('starts empty', () => {
    const buffer = new BitBuffer();
    expect(buffer.bitLength).toBe(0);
    expect(buffer.byteLength).toBe(0);
    expect(buffer.toBytes().length).toBe(0);
  });

  it('writes bits most significant first', () => {
    const buffer = new BitBuffer();
    buffer.put(0b1011, 4);
    expect(bitString(buffer)).toBe('1011');
  });

  it('zero-pads a value narrower than its field', () => {
    const buffer = new BitBuffer();
    buffer.put(0b11, 6);
    expect(bitString(buffer)).toBe('000011');
  });

  it('ignores bits above the requested width', () => {
    const buffer = new BitBuffer();
    buffer.put(0b1111_0011, 4);
    expect(bitString(buffer)).toBe('0011');
  });

  it('packs across byte boundaries without reordering', () => {
    const buffer = new BitBuffer();
    buffer.put(0b0010, 4);
    buffer.put(0b0000_0101_1, 9);
    expect(bitString(buffer)).toBe('0010000001011');
    expect(buffer.bitLength).toBe(13);
    expect(buffer.byteLength).toBe(2);
  });

  it('exposes written bits through bitAt', () => {
    const buffer = new BitBuffer();
    buffer.put(0b1001_0110, 8);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => buffer.bitAt(i))).toEqual([1, 0, 0, 1, 0, 1, 1, 0]);
  });

  it('zero-pads the trailing partial byte in toBytes', () => {
    const buffer = new BitBuffer();
    buffer.put(0b111, 3);
    expect(Array.from(buffer.toBytes())).toEqual([0b1110_0000]);
  });

  it('pads to a byte boundary on request', () => {
    const buffer = new BitBuffer();
    buffer.put(0b1, 1);
    buffer.padToByteBoundary();
    expect(buffer.bitLength).toBe(8);
    buffer.padToByteBoundary();
    expect(buffer.bitLength).toBe(8);
  });

  it('grows past its initial capacity', () => {
    const buffer = new BitBuffer(1);
    for (let i = 0; i < 500; i += 1) buffer.putBit(i % 2);
    expect(buffer.bitLength).toBe(500);
    expect(buffer.bitAt(499)).toBe(1);
    expect(buffer.bitAt(498)).toBe(0);
  });

  it('handles a 32-bit write', () => {
    const buffer = new BitBuffer();
    buffer.put(0xdead_beef, 32);
    expect(Array.from(buffer.toBytes())).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('returns a copy, not a view', () => {
    const buffer = new BitBuffer();
    buffer.put(0xff, 8);
    const bytes = buffer.toBytes();
    bytes[0] = 0;
    expect(buffer.toBytes()[0]).toBe(0xff);
  });
});
