import { describe, expect, it } from 'vitest';
import {
  GENERATOR,
  ORDER,
  PRIMITIVE_POLYNOMIAL,
  divide,
  exp,
  inverse,
  log,
  multiply,
} from '../../../src/ec/galois.js';

const NONZERO = Array.from({ length: 255 }, (_, i) => i + 1);

describe('field definition', () => {
  it('uses the primitive polynomial from ISO/IEC 18004 section 8.5.1', () => {
    expect(PRIMITIVE_POLYNOMIAL).toBe(0x11d);
    expect(PRIMITIVE_POLYNOMIAL).toBe(285);
  });

  it('uses 2 as the generator element', () => {
    expect(GENERATOR).toBe(2);
  });

  it('has multiplicative order 255', () => {
    expect(ORDER).toBe(255);
  });
});

describe('exp and log', () => {
  it('round-trip in both directions', () => {
    for (let power = 0; power < ORDER; power += 1) {
      expect(log(exp(power))).toBe(power);
    }
    for (const value of NONZERO) {
      expect(exp(log(value))).toBe(value);
    }
  });

  it('generates every nonzero element exactly once', () => {
    const seen = new Set();
    for (let power = 0; power < ORDER; power += 1) seen.add(exp(power));
    expect(seen.size).toBe(255);
    expect(seen.has(0)).toBe(false);
  });

  it('wraps with period 255', () => {
    expect(exp(0)).toBe(1);
    expect(exp(ORDER)).toBe(1);
    expect(exp(ORDER + 5)).toBe(exp(5));
    expect(exp(-1)).toBe(exp(ORDER - 1));
  });

  it('starts 1, 2, 4, 8 ... and reduces at x^8', () => {
    expect(exp(0)).toBe(1);
    expect(exp(1)).toBe(2);
    expect(exp(2)).toBe(4);
    expect(exp(7)).toBe(128);
    // 2^8 overflows and reduces by the primitive polynomial: 0x100 ^ 0x11D = 0x1D.
    expect(exp(8)).toBe(0x1d);
  });
});

describe('multiplication', () => {
  it('is annihilated by zero', () => {
    for (const a of NONZERO) {
      expect(multiply(a, 0)).toBe(0);
      expect(multiply(0, a)).toBe(0);
    }
    expect(multiply(0, 0)).toBe(0);
  });

  it('has 1 as identity', () => {
    for (const a of NONZERO) {
      expect(multiply(a, 1)).toBe(a);
      expect(multiply(1, a)).toBe(a);
    }
  });

  it('is commutative across the whole field', () => {
    for (const a of NONZERO) {
      for (const b of NONZERO) {
        expect(multiply(a, b)).toBe(multiply(b, a));
      }
    }
  });

  it('is associative', () => {
    for (let a = 1; a < 256; a += 7) {
      for (let b = 1; b < 256; b += 11) {
        for (let c = 1; c < 256; c += 13) {
          expect(multiply(multiply(a, b), c)).toBe(multiply(a, multiply(b, c)));
        }
      }
    }
  });

  it('distributes over addition, which is XOR', () => {
    for (let a = 1; a < 256; a += 5) {
      for (let b = 1; b < 256; b += 9) {
        for (let c = 1; c < 256; c += 17) {
          expect(multiply(a, b ^ c)).toBe(multiply(a, b) ^ multiply(a, c));
        }
      }
    }
  });
});

describe('division and inverse', () => {
  it('gives every nonzero element an inverse', () => {
    for (const a of NONZERO) {
      expect(multiply(a, inverse(a))).toBe(1);
    }
  });

  it('undoes multiplication', () => {
    for (const a of NONZERO) {
      for (const b of NONZERO) {
        expect(divide(multiply(a, b), b)).toBe(a);
      }
    }
  });

  it('maps zero to zero', () => {
    expect(divide(0, 5)).toBe(0);
  });

  it('agrees with multiplication by the inverse', () => {
    for (const a of NONZERO) {
      for (let b = 1; b < 256; b += 3) {
        expect(divide(a, b)).toBe(multiply(a, inverse(b)));
      }
    }
  });
});
