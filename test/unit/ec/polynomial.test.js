import { describe, expect, it } from 'vitest';
import { evaluate, multiplyPolynomials, remainder } from '../../../src/ec/polynomial.js';
import { exp, multiply } from '../../../src/ec/galois.js';

describe('multiplyPolynomials', () => {
  it('produces a polynomial of the summed degree', () => {
    const product = multiplyPolynomials(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 4));
    expect(product.length).toBe(4);
  });

  it('treats [1] as the identity', () => {
    const poly = Uint8Array.of(1, 87, 229, 146);
    expect(Array.from(multiplyPolynomials(poly, Uint8Array.of(1)))).toEqual(Array.from(poly));
  });

  it('multiplies (x + 1)(x + 1) to x^2 + 1, since 1 XOR 1 is 0', () => {
    // In GF(2^k) the middle term cancels: x^2 + (1+1)x + 1 = x^2 + 1.
    expect(Array.from(multiplyPolynomials(Uint8Array.of(1, 1), Uint8Array.of(1, 1))))
      .toEqual([1, 0, 1]);
  });

  it('is commutative', () => {
    const a = Uint8Array.of(1, 5, 9);
    const b = Uint8Array.of(1, 200, 3, 77);
    expect(Array.from(multiplyPolynomials(a, b))).toEqual(Array.from(multiplyPolynomials(b, a)));
  });

  it('agrees with pointwise evaluation', () => {
    const a = Uint8Array.of(1, 5, 9);
    const b = Uint8Array.of(1, 200, 3);
    const product = multiplyPolynomials(a, b);
    for (let power = 0; power < 20; power += 1) {
      const x = exp(power);
      expect(evaluate(product, x)).toBe(multiply(evaluate(a, x), evaluate(b, x)));
    }
  });
});

describe('evaluate', () => {
  it('returns the constant term at x = 0', () => {
    expect(evaluate(Uint8Array.of(1, 2, 7), 0)).toBe(7);
  });

  it('sums all coefficients at x = 1, addition being XOR', () => {
    expect(evaluate(Uint8Array.of(1, 2, 7), 1)).toBe(1 ^ 2 ^ 7);
  });

  it('evaluates a linear polynomial', () => {
    // (x + 3) at x = 5 is 5 XOR 3.
    expect(evaluate(Uint8Array.of(1, 3), 5)).toBe(5 ^ 3);
  });
});

describe('remainder', () => {
  it('is zero when the divisor divides exactly', () => {
    const divisor = Uint8Array.of(1, 3);
    const quotient = Uint8Array.of(1, 7, 9);
    const dividend = multiplyPolynomials(quotient, divisor);
    expect(Array.from(remainder(dividend, divisor))).toEqual([0]);
  });

  it('has degree strictly below the divisor', () => {
    const divisor = Uint8Array.of(1, 3, 5, 9);
    const dividend = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    expect(remainder(dividend, divisor).length).toBe(3);
  });

  it('leaves the dividend unchanged when it is already smaller', () => {
    const divisor = Uint8Array.of(1, 3, 5);
    expect(Array.from(remainder(Uint8Array.of(4, 9), divisor))).toEqual([4, 9]);
  });
});
