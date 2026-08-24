/**
 * M6 gate (ADR-0011): format bits for all 32 EC x mask combinations, and
 * version bits for versions 7 and above.
 *
 * The primary tests are the BCH divisibility property and the minimum Hamming
 * distance of the code -- both defining properties, so they hold regardless of
 * any transcribed table. Published values are asserted alongside as an
 * independent cross-check.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMAT_GENERATOR,
  FORMAT_MASK,
  MIN_VERSION_INFO,
  VERSION_GENERATOR,
  formatBits,
  versionBits,
  writeFormatInfo,
  writeVersionInfo,
} from '../../../src/core/format-info.js';
import { Matrix } from '../../../src/core/matrix.js';
import {
  formatInfoPositions,
  placeFunctionPatterns,
  versionInfoPositions,
} from '../../../src/core/patterns.js';
import { EC_FORMAT_BITS, EC_LEVELS, MAX_VERSION } from '../../../src/core/constants.js';

const LEVELS = Array.from(EC_LEVELS);
const MASKS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Remainder of `value` divided by `generator` over GF(2). */
function bchRemainder(value, generator) {
  const generatorBits = 32 - Math.clz32(generator);
  let remainder = value;
  while (32 - Math.clz32(remainder) >= generatorBits) {
    remainder ^= generator << ((32 - Math.clz32(remainder)) - generatorBits);
  }
  return remainder;
}

const hamming = (a, b) => {
  let bits = a ^ b;
  let count = 0;
  while (bits !== 0) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
};

describe('the divisibility helper itself', () => {
  // Guards against a vacuous test: if bchRemainder returned 0 for everything,
  // the BCH assertions below would pass while proving nothing.
  it('reports a nonzero remainder for a non-codeword', () => {
    expect(bchRemainder(0x5412 ^ 1, FORMAT_GENERATOR)).not.toBe(0);
    expect(bchRemainder(0b101010000010011, FORMAT_GENERATOR)).not.toBe(0);
    expect(bchRemainder(versionBits(7) ^ 1, VERSION_GENERATOR)).not.toBe(0);
  });

  it('reports zero for the generator itself and its multiples', () => {
    expect(bchRemainder(FORMAT_GENERATOR, FORMAT_GENERATOR)).toBe(0);
    expect(bchRemainder(FORMAT_GENERATOR << 3, FORMAT_GENERATOR)).toBe(0);
  });
});

describe('generator polynomials', () => {
  it('match the spec', () => {
    expect(FORMAT_GENERATOR).toBe(0x537);
    expect(VERSION_GENERATOR).toBe(0x1f25);
    expect(FORMAT_MASK).toBe(0x5412);
  });
});

describe('format information', () => {
  it('produces a 15-bit field for all 32 combinations', () => {
    for (const level of LEVELS) {
      for (const mask of MASKS) {
        const bits = formatBits(level, mask);
        expect(bits).toBeGreaterThanOrEqual(0);
        expect(bits).toBeLessThan(1 << 15);
      }
    }
  });

  it('is a valid BCH codeword once the fixed mask is removed', () => {
    for (const level of LEVELS) {
      for (const mask of MASKS) {
        const unmasked = formatBits(level, mask) ^ FORMAT_MASK;
        expect(bchRemainder(unmasked, FORMAT_GENERATOR)).toBe(0);
      }
    }
  });

  it('carries the level and mask in its top five bits', () => {
    for (const level of LEVELS) {
      for (const mask of MASKS) {
        const unmasked = formatBits(level, mask) ^ FORMAT_MASK;
        expect(unmasked >>> 10).toBe((EC_FORMAT_BITS[level] << 3) | mask);
      }
    }
  });

  it('gives all 32 combinations distinct values', () => {
    const seen = new Set();
    for (const level of LEVELS) {
      for (const mask of MASKS) seen.add(formatBits(level, mask));
    }
    expect(seen.size).toBe(32);
  });

  it('keeps every pair at least 7 bits apart', () => {
    // The BCH(15,5) code has minimum distance 7. This is what lets a decoder
    // recover the format field from a damaged symbol.
    const values = [];
    for (const level of LEVELS) {
      for (const mask of MASKS) values.push(formatBits(level, mask));
    }
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        expect(hamming(values[i], values[j])).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('is never all light, which the fixed mask exists to prevent', () => {
    for (const level of LEVELS) {
      for (const mask of MASKS) expect(formatBits(level, mask)).not.toBe(0);
    }
  });

  it('matches the published value for level M mask 0', () => {
    // Level M is 00 and mask 0 is 000, so the data is zero and the field is the
    // fixed mask alone.
    expect(formatBits('M', 0)).toBe(0b101010000010010);
    expect(formatBits('M', 0)).toBe(0x5412);
  });

  it('matches published values across the levels', () => {
    expect(formatBits('L', 0)).toBe(0b111011111000100);
    expect(formatBits('Q', 0)).toBe(0b011010101011111);
    expect(formatBits('H', 0)).toBe(0b001011010001001);
  });
});

describe('version information', () => {
  it('is defined from version 7', () => {
    expect(MIN_VERSION_INFO).toBe(7);
  });

  it('produces an 18-bit field', () => {
    for (let version = MIN_VERSION_INFO; version <= MAX_VERSION; version += 1) {
      expect(versionBits(version)).toBeLessThan(1 << 18);
    }
  });

  it('is a valid BCH codeword', () => {
    for (let version = MIN_VERSION_INFO; version <= MAX_VERSION; version += 1) {
      expect(bchRemainder(versionBits(version), VERSION_GENERATOR)).toBe(0);
    }
  });

  it('carries the version in its top six bits', () => {
    for (let version = MIN_VERSION_INFO; version <= MAX_VERSION; version += 1) {
      expect(versionBits(version) >>> 12).toBe(version);
    }
  });

  it('keeps every pair at least 8 bits apart', () => {
    // Minimum distance of the BCH(18,6) code used here.
    const values = [];
    for (let version = MIN_VERSION_INFO; version <= MAX_VERSION; version += 1) {
      values.push(versionBits(version));
    }
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        expect(hamming(values[i], values[j])).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('matches published values', () => {
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(8)).toBe(0x085bc);
    expect(versionBits(21)).toBe(0x15683);
    expect(versionBits(40)).toBe(0x28c69);
  });
});

describe('writeFormatInfo', () => {
  it('writes both copies with the same bits', () => {
    const matrix = new Matrix(1);
    placeFunctionPatterns(matrix);
    writeFormatInfo(matrix, 'Q', 5);

    const positions = formatInfoPositions(matrix.size);
    const first = positions.slice(0, 15).map(([r, c]) => (matrix.get(r, c) ? 1 : 0));
    const second = positions.slice(15).map(([r, c]) => (matrix.get(r, c) ? 1 : 0));
    expect(second).toEqual(first);
  });

  it('writes most significant bit first', () => {
    const matrix = new Matrix(1);
    placeFunctionPatterns(matrix);
    writeFormatInfo(matrix, 'Q', 5);

    const bits = formatBits('Q', 5);
    const positions = formatInfoPositions(matrix.size);
    for (let i = 0; i < 15; i += 1) {
      const [row, col] = positions[i];
      expect(matrix.get(row, col)).toBe(((bits >>> (14 - i)) & 1) === 1);
    }
  });

  it('leaves the dark module dark', () => {
    for (const version of [1, 7, 40]) {
      const matrix = new Matrix(version);
      placeFunctionPatterns(matrix);
      writeFormatInfo(matrix, 'L', 0);
      expect(matrix.get(4 * version + 9, 8)).toBe(true);
    }
  });
});

describe('writeVersionInfo', () => {
  it('does nothing below version 7', () => {
    for (const version of [1, 2, 6]) {
      const matrix = new Matrix(version);
      placeFunctionPatterns(matrix);
      const before = matrix.darkCount();
      writeVersionInfo(matrix);
      expect(matrix.darkCount()).toBe(before);
    }
  });

  it('writes both copies least significant bit first', () => {
    const matrix = new Matrix(7);
    placeFunctionPatterns(matrix);
    writeVersionInfo(matrix);

    const bits = versionBits(7);
    const positions = versionInfoPositions(matrix.size);
    for (let i = 0; i < 36; i += 1) {
      const [row, col] = positions[i];
      expect(matrix.get(row, col)).toBe(((bits >>> (i % 18)) & 1) === 1);
    }
  });
});
