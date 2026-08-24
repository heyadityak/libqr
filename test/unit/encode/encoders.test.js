/**
 * M3 gate (ADR-0011): encoder bit output against published vectors.
 */
import { describe, expect, it } from 'vitest';
import * as alphanumeric from '../../../src/encode/alphanumeric.js';
import * as byteMode from '../../../src/encode/byte.js';
import * as eci from '../../../src/encode/eci.js';
import * as numeric from '../../../src/encode/numeric.js';
import { BitBuffer } from '../../../src/util/bitbuffer.js';
import { utf8Bytes } from '../../../src/util/text.js';
import { bitString } from '../../helpers/bits.js';

describe('numeric mode', () => {
  it('has the mode indicator and count widths from the spec', () => {
    expect(numeric.MODE_INDICATOR).toBe(0b0001);
    expect(Array.from(numeric.COUNT_BITS)).toEqual([10, 12, 14]);
  });

  it('accepts only ASCII digits', () => {
    for (const char of '0123456789') expect(numeric.canEncode(char.codePointAt(0))).toBe(true);
    for (const char of 'aA -/٣') expect(numeric.canEncode(char.codePointAt(0))).toBe(false);
  });

  it('costs 10 bits per three digits, 7 for a pair, 4 for a single', () => {
    expect(numeric.dataBitLength(0)).toBe(0);
    expect(numeric.dataBitLength(1)).toBe(4);
    expect(numeric.dataBitLength(2)).toBe(7);
    expect(numeric.dataBitLength(3)).toBe(10);
    expect(numeric.dataBitLength(4)).toBe(14);
    expect(numeric.dataBitLength(5)).toBe(17);
    expect(numeric.dataBitLength(6)).toBe(20);
    expect(numeric.dataBitLength(8)).toBe(27);
  });

  it('encodes "01234567" as the ISO/IEC 18004 Annex I example', () => {
    const buffer = new BitBuffer();
    numeric.write(buffer, '01234567');
    // 012 -> 12 -> 0000001100, 345 -> 0101011001, 67 -> 1000011
    expect(bitString(buffer)).toBe('0000001100' + '0101011001' + '1000011');
    expect(buffer.bitLength).toBe(numeric.dataBitLength(8));
  });

  it('writes leading zeros rather than dropping them', () => {
    const buffer = new BitBuffer();
    numeric.write(buffer, '000');
    expect(bitString(buffer)).toBe('0000000000');
  });

  it('agrees with dataBitLength for every length up to 40', () => {
    for (let n = 0; n <= 40; n += 1) {
      const buffer = new BitBuffer();
      numeric.write(buffer, '7'.repeat(n));
      expect(buffer.bitLength).toBe(numeric.dataBitLength(n));
    }
  });
});

describe('alphanumeric mode', () => {
  it('has the mode indicator and count widths from the spec', () => {
    expect(alphanumeric.MODE_INDICATOR).toBe(0b0010);
    expect(Array.from(alphanumeric.COUNT_BITS)).toEqual([9, 11, 13]);
  });

  it('has the 45-character set in Table 5 order', () => {
    expect(alphanumeric.CHARSET.length).toBe(45);
    expect(alphanumeric.valueOf('0'.codePointAt(0))).toBe(0);
    expect(alphanumeric.valueOf('9'.codePointAt(0))).toBe(9);
    expect(alphanumeric.valueOf('A'.codePointAt(0))).toBe(10);
    expect(alphanumeric.valueOf('Z'.codePointAt(0))).toBe(35);
    expect(alphanumeric.valueOf(' '.codePointAt(0))).toBe(36);
    expect(alphanumeric.valueOf('$'.codePointAt(0))).toBe(37);
    expect(alphanumeric.valueOf('%'.codePointAt(0))).toBe(38);
    expect(alphanumeric.valueOf('*'.codePointAt(0))).toBe(39);
    expect(alphanumeric.valueOf('+'.codePointAt(0))).toBe(40);
    expect(alphanumeric.valueOf('-'.codePointAt(0))).toBe(41);
    expect(alphanumeric.valueOf('.'.codePointAt(0))).toBe(42);
    expect(alphanumeric.valueOf('/'.codePointAt(0))).toBe(43);
    expect(alphanumeric.valueOf(':'.codePointAt(0))).toBe(44);
  });

  it('rejects lowercase', () => {
    for (const char of 'abcxyz') expect(alphanumeric.canEncode(char.codePointAt(0))).toBe(false);
  });

  it('rejects characters that look plausible but are not in the set', () => {
    for (const char of '@#!?,;()[]_=&\'"<>\\|^~`{}') {
      expect(alphanumeric.canEncode(char.codePointAt(0))).toBe(false);
    }
  });

  it('costs 11 bits per pair and 6 for a trailing single', () => {
    expect(alphanumeric.dataBitLength(0)).toBe(0);
    expect(alphanumeric.dataBitLength(1)).toBe(6);
    expect(alphanumeric.dataBitLength(2)).toBe(11);
    expect(alphanumeric.dataBitLength(3)).toBe(17);
    expect(alphanumeric.dataBitLength(11)).toBe(61);
  });

  it('encodes "HELLO WORLD" to the published bit string', () => {
    const buffer = new BitBuffer();
    alphanumeric.write(buffer, 'HELLO WORLD');
    expect(bitString(buffer)).toBe(
      '01100001011' // HE -> 17*45+14 = 779
      + '01111000110' // LL -> 21*45+21 = 966
      + '10001011100' // "O " -> 24*45+36 = 1116
      + '10110111000' // WO -> 32*45+24 = 1464
      + '10011010100' // RL -> 27*45+21 = 1236
      + '001101', // D -> 13
    );
    expect(buffer.bitLength).toBe(61);
  });
});

describe('byte mode', () => {
  it('has the mode indicator and count widths from the spec', () => {
    expect(byteMode.MODE_INDICATOR).toBe(0b0100);
    expect(Array.from(byteMode.COUNT_BITS)).toEqual([8, 16, 16]);
  });

  it('does not step the count width up a third time', () => {
    // Unlike every other mode, byte is 16 bits for both 10-26 and 27-40.
    expect(byteMode.COUNT_BITS[1]).toBe(byteMode.COUNT_BITS[2]);
  });

  it('encodes anything', () => {
    for (const codePoint of [0x00, 0x41, 0x7f, 0x20ac, 0x1f600]) {
      expect(byteMode.canEncode(codePoint)).toBe(true);
    }
  });

  it('costs 8 bits per byte', () => {
    expect(byteMode.dataBitLength(0)).toBe(0);
    expect(byteMode.dataBitLength(5)).toBe(40);
  });

  it('writes bytes verbatim', () => {
    const buffer = new BitBuffer();
    byteMode.write(buffer, utf8Bytes('Hi'));
    expect(bitString(buffer)).toBe('01001000' + '01101001'); // 0x48 0x69
  });

  it('counts UTF-8 bytes, not characters', () => {
    const bytes = utf8Bytes('€');
    expect(bytes.length).toBe(3);
    const buffer = new BitBuffer();
    byteMode.write(buffer, bytes);
    expect(buffer.bitLength).toBe(24);
  });
});

describe('ECI designators', () => {
  it('has the mode indicator and known assignments', () => {
    expect(eci.MODE_INDICATOR).toBe(0b0111);
    expect(eci.ECI_UTF8).toBe(26);
    expect(eci.ECI_LATIN1).toBe(3);
  });

  it('uses one byte below 128, two below 16384, three above', () => {
    expect(eci.designatorBitLength(0)).toBe(8);
    expect(eci.designatorBitLength(26)).toBe(8);
    expect(eci.designatorBitLength(127)).toBe(8);
    expect(eci.designatorBitLength(128)).toBe(16);
    expect(eci.designatorBitLength(16383)).toBe(16);
    expect(eci.designatorBitLength(16384)).toBe(24);
    expect(eci.designatorBitLength(999999)).toBe(24);
  });

  it('writes UTF-8 as 0111 then 00011010', () => {
    const buffer = new BitBuffer();
    eci.write(buffer, eci.ECI_UTF8);
    expect(bitString(buffer)).toBe('0111' + '00011010');
    expect(buffer.bitLength).toBe(eci.bitLength(eci.ECI_UTF8));
  });

  it('prefixes the two-byte form with 10', () => {
    const buffer = new BitBuffer();
    eci.write(buffer, 200);
    expect(bitString(buffer)).toBe('0111' + '10' + '00000011001000');
  });

  it('prefixes the three-byte form with 110', () => {
    const buffer = new BitBuffer();
    eci.write(buffer, 999999);
    expect(bitString(buffer).slice(4, 7)).toBe('110');
    expect(buffer.bitLength).toBe(4 + 24);
  });

  it('agrees with bitLength at every boundary', () => {
    for (const value of [0, 127, 128, 16383, 16384, 999999]) {
      const buffer = new BitBuffer();
      eci.write(buffer, value);
      expect(buffer.bitLength).toBe(eci.bitLength(value));
    }
  });
});
