/**
 * M7 gate (ADR-0011): generated symbols decode back to their input.
 *
 * Supplementary to the golden vectors, per ADR-0008 -- a lenient decoder cannot
 * prove conformance, but it does catch gross structural errors immediately.
 */
import { describe, expect, it } from 'vitest';
import { qr } from '../../src/index.js';
import { decodeMatrix } from '../helpers/decode.js';

const LEVELS = ['L', 'M', 'Q', 'H'];

describe('roundtrip across error-correction levels', () => {
  for (const ecLevel of LEVELS) {
    it(`level ${ecLevel} decodes back to the input`, () => {
      const text = 'HELLO WORLD';
      const { matrix } = qr(text, { ecLevel });
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }
});

describe('roundtrip across modes', () => {
  const samples = [
    ['numeric', '8675309'],
    ['alphanumeric', 'HTTPS://EXAMPLE.COM/PATH'],
    ['byte lowercase', 'https://example.com/path?q=1'],
    ['byte punctuation', 'a@b.com {json:"yes"}'],
    ['mixed', 'ORDER AB-1234 QTY 56789012345678901234567890'],
    ['single character', 'A'],
    ['single digit', '7'],
  ];

  for (const [label, text] of samples) {
    it(`${label} decodes back to the input`, () => {
      const { matrix } = qr(text, { ecLevel: 'M' });
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }
});

describe('roundtrip across versions', () => {
  for (const version of [1, 2, 6, 7, 10, 15, 26, 27, 33, 40]) {
    it(`version ${version} decodes back to the input`, () => {
      // Fill a decent fraction of the symbol so the version is genuinely used.
      const text = 'DATA'.repeat(Math.max(1, version * 2));
      const result = qr(text, { ecLevel: 'L', version });
      expect(result.version).toBe(version);
      expect(decodeMatrix(result.matrix)).toBe(text);
    });
  }
});

describe('roundtrip across masks', () => {
  for (let mask = 0; mask < 8; mask += 1) {
    it(`mask ${mask} decodes back to the input`, () => {
      const text = 'MASK TEST 12345';
      const result = qr(text, { ecLevel: 'M', mask });
      expect(result.mask).toBe(mask);
      expect(decodeMatrix(result.matrix)).toBe(text);
    });
  }
});

describe('roundtrip for non-ASCII', () => {
  const samples = ['café', 'Ünïcödé', 'naïve résumé', '€100', '日本語テキスト'];

  for (const text of samples) {
    it(`"${text}" decodes back to the input`, () => {
      const { matrix, eci } = qr(text, { ecLevel: 'M' });
      expect(eci).toBe(26);
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }
});

describe('roundtrip at capacity boundaries', () => {
  it('decodes a payload that exactly fills version 1 at level H', () => {
    // Version 1 level H holds 72 bits: 4 + 10 header plus 58 for digits.
    const text = '1'.repeat(17);
    const result = qr(text, { ecLevel: 'H', version: 1 });
    expect(decodeMatrix(result.matrix)).toBe(text);
  });

  it('decodes the largest numeric payload at version 40 level L', () => {
    const text = '7'.repeat(7089);
    const result = qr(text, { ecLevel: 'L' });
    expect(result.version).toBe(40);
    expect(decodeMatrix(result.matrix)).toBe(text);
  });

  it('decodes an empty payload', () => {
    const { matrix } = qr('', { ecLevel: 'M' });
    expect(decodeMatrix(matrix)).toBe('');
  });
});
