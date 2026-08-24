/**
 * Polynomials over GF(256).
 *
 * Coefficients are stored **highest power first**, so `[1, 2, 3]` is
 * x^2 + 2x + 3. That ordering matches how codewords are laid out on the wire,
 * which keeps the Reed-Solomon remainder loop free of index arithmetic.
 */
import { multiply } from './galois.js';

/**
 * Product of two polynomials.
 *
 * @param {Uint8Array|number[]} a coefficients, highest power first
 * @param {Uint8Array|number[]} b coefficients, highest power first
 * @returns {Uint8Array} product, highest power first
 */
export function multiplyPolynomials(a, b) {
  const product = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j += 1) {
      product[i + j] ^= multiply(a[i], b[j]);
    }
  }
  return product;
}

/**
 * Evaluates a polynomial at `x` using Horner's method.
 *
 * @param {Uint8Array|number[]} poly coefficients, highest power first
 * @param {number} x field element to evaluate at
 * @returns {number} poly(x) in GF(256)
 */
export function evaluate(poly, x) {
  let result = 0;
  for (let i = 0; i < poly.length; i += 1) {
    result = multiply(result, x) ^ poly[i];
  }
  return result;
}

/**
 * Remainder of `dividend` divided by a monic `divisor`.
 *
 * General-purpose and allocating; the encoding hot path uses the specialised
 * loop in `reed-solomon.js` instead.
 *
 * @param {Uint8Array|number[]} dividend coefficients, highest power first
 * @param {Uint8Array|number[]} divisor monic divisor, highest power first
 * @returns {Uint8Array} remainder, length `divisor.length - 1`
 */
export function remainder(dividend, divisor) {
  const working = Uint8Array.from(dividend);
  const degree = divisor.length - 1;
  for (let i = 0; i + degree < working.length; i += 1) {
    const factor = working[i];
    if (factor === 0) continue;
    for (let j = 0; j <= degree; j += 1) {
      working[i + j] ^= multiply(divisor[j], factor);
    }
  }
  return working.subarray(working.length - degree);
}
