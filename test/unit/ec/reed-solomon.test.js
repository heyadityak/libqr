/**
 * M2 gate (ADR-0011).
 *
 * The primary test here is the **root property**, not a transcribed coefficient
 * table. By definition the generator polynomial for n error-correction
 * codewords is the product of (x - 2^i) for i in 0..n-1, so a monic polynomial
 * of degree n whose roots are exactly 2^0..2^(n-1) *is* that polynomial,
 * uniquely. That makes the check a proof rather than a spot check, and it needs
 * no external table to compare against.
 *
 * The ISO/IEC 18004 Annex A exponent lists are asserted as well, as an
 * independent cross-check on the same values.
 */
import { describe, expect, it } from 'vitest';
import { computeEcc, generatorPolynomial } from '../../../src/ec/reed-solomon.js';
import { evaluate } from '../../../src/ec/polynomial.js';
import { exp, log } from '../../../src/ec/galois.js';

/** Every error-correction block length that appears anywhere in the spec tables. */
const ALL_DEGREES = [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30];

describe('generatorPolynomial shape', () => {
  for (const degree of ALL_DEGREES) {
    it(`degree ${degree} is monic with ${degree + 1} coefficients`, () => {
      const g = generatorPolynomial(degree);
      expect(g.length).toBe(degree + 1);
      expect(g[0]).toBe(1);
    });
  }

  it('caches by degree', () => {
    expect(generatorPolynomial(10)).toBe(generatorPolynomial(10));
  });
});

describe('generatorPolynomial roots -- the defining property', () => {
  for (const degree of ALL_DEGREES) {
    it(`degree ${degree} vanishes at 2^0 .. 2^${degree - 1}`, () => {
      const g = generatorPolynomial(degree);
      for (let i = 0; i < degree; i += 1) {
        expect(evaluate(g, exp(i))).toBe(0);
      }
    });
  }

  it('has no roots outside that set', () => {
    const degree = 10;
    const g = generatorPolynomial(degree);
    for (let i = degree; i < 255; i += 1) {
      expect(evaluate(g, exp(i))).not.toBe(0);
    }
  });
});

describe('generatorPolynomial coefficients match ISO/IEC 18004 Annex A', () => {
  // Coefficients expressed as powers of 2, highest power of x first.
  const ANNEX_A = {
    7: [0, 87, 229, 146, 149, 238, 102, 21],
    10: [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
    13: [0, 74, 152, 176, 100, 86, 100, 106, 104, 130, 218, 206, 140, 78],
    17: [0, 43, 139, 206, 78, 43, 239, 123, 206, 214, 147, 24, 99, 150, 39, 243, 163, 136],
  };

  for (const [degree, exponents] of Object.entries(ANNEX_A)) {
    it(`degree ${degree}`, () => {
      const g = generatorPolynomial(Number(degree));
      expect(Array.from(g).map((c) => log(c))).toEqual(exponents);
    });
  }
});

describe('computeEcc', () => {
  const DATA = Uint8Array.of(0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11);

  it('returns exactly the requested number of codewords', () => {
    for (const degree of ALL_DEGREES) {
      expect(computeEcc(DATA, degree).length).toBe(degree);
    }
  });

  it('produces a codeword divisible by the generator polynomial', () => {
    // The defining property of a Reed-Solomon codeword: data followed by its
    // error-correction codewords, read as a polynomial, has every generator
    // root as a root.
    for (const degree of ALL_DEGREES) {
      const ecc = computeEcc(DATA, degree);
      const codeword = Uint8Array.from([...DATA, ...ecc]);
      for (let i = 0; i < degree; i += 1) {
        expect(evaluate(codeword, exp(i))).toBe(0);
      }
    }
  });

  it('maps all-zero data to all-zero error correction', () => {
    const zeros = new Uint8Array(16);
    expect(Array.from(computeEcc(zeros, 10))).toEqual(new Array(10).fill(0));
  });

  it('is linear: ecc(a XOR b) equals ecc(a) XOR ecc(b)', () => {
    const a = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    const b = Uint8Array.of(0xff, 0x10, 0x00, 0x7f, 0x33, 0x81, 0x02, 0x40);
    const combined = Uint8Array.from(a, (value, i) => value ^ b[i]);

    const eccA = computeEcc(a, 13);
    const eccB = computeEcc(b, 13);
    const eccCombined = computeEcc(combined, 13);

    for (let i = 0; i < 13; i += 1) {
      expect(eccCombined[i]).toBe(eccA[i] ^ eccB[i]);
    }
  });

  it('does not mutate its input', () => {
    const data = Uint8Array.of(9, 8, 7, 6);
    const before = Array.from(data);
    computeEcc(data, 10);
    expect(Array.from(data)).toEqual(before);
  });

  it('changes output when any input byte changes', () => {
    const base = computeEcc(DATA, 10);
    for (let i = 0; i < DATA.length; i += 1) {
      const mutated = Uint8Array.from(DATA);
      mutated[i] ^= 0x01;
      expect(Array.from(computeEcc(mutated, 10))).not.toEqual(Array.from(base));
    }
  });
});
