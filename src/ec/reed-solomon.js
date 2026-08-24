/**
 * Reed-Solomon error correction codeword generation.
 *
 * ISO/IEC 18004 section 8.5. Per ADR-0012 this module takes the number of
 * error-correction codewords as a parameter -- it holds no version or EC-level
 * tables and never looks one up.
 */
import { GENERATOR, multiply } from './galois.js';
import { multiplyPolynomials } from './polynomial.js';

const generatorCache = new Map();

/**
 * Generator polynomial for `degree` error-correction codewords.
 *
 * By definition this is the product of (x - 2^i) for i in 0..degree-1, so its
 * roots are exactly 2^0 .. 2^(degree-1). Returned monic and highest power
 * first, meaning `result[0] === 1` and `result.length === degree + 1`.
 *
 * Results are cached: a single encode reuses one degree, and the 30-odd
 * distinct degrees across all versions are cheap to retain.
 *
 * @param {number} degree number of error-correction codewords; must be >= 1
 * @returns {Uint8Array} monic generator polynomial, highest power first
 */
export function generatorPolynomial(degree) {
  const cached = generatorCache.get(degree);
  if (cached !== undefined) return cached;

  let poly = Uint8Array.of(1);
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    // Subtraction is XOR in GF(2^k), so (x - root) is [1, root].
    poly = multiplyPolynomials(poly, Uint8Array.of(1, root));
    root = multiply(root, GENERATOR);
  }

  generatorCache.set(degree, poly);
  return poly;
}

/**
 * Error-correction codewords for one block.
 *
 * This is the remainder of `data * x^degree` divided by the generator
 * polynomial. The loop is deliberately allocation-free apart from the result:
 * it runs once per block, and a version 40 symbol has up to 81 blocks.
 *
 * @param {Uint8Array} data data codewords for a single block
 * @param {number} eccLength number of error-correction codewords to produce
 * @returns {Uint8Array} error-correction codewords, length `eccLength`
 */
export function computeEcc(data, eccLength) {
  // Coefficients below the leading 1, which the loop below handles implicitly.
  const divisor = generatorPolynomial(eccLength).subarray(1);
  const result = new Uint8Array(eccLength);

  for (let d = 0; d < data.length; d += 1) {
    const factor = data[d] ^ result[0];
    result.copyWithin(0, 1);
    result[eccLength - 1] = 0;
    if (factor === 0) continue;
    for (let i = 0; i < eccLength; i += 1) {
      result[i] ^= multiply(divisor[i], factor);
    }
  }

  return result;
}
