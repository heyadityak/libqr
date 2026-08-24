/**
 * M10 gate (ADR-0011): Kanji mode round-trips.
 *
 * Separate file because importing the Kanji entry point registers the mode
 * process-wide; vitest isolates per file.
 *
 * Supplementary to the golden vectors, per ADR-0008 -- but for Kanji it carries
 * more weight than usual, because it is the only check that an independent
 * decoder agrees with our reading of the Shift-JIS mapping.
 */
import { describe, expect, it } from 'vitest';
import '../../src/encode/kanji.js';
import { qr } from '../../src/index.js';
import { decodeMatrix } from '../helpers/decode.js';

describe('Kanji mode round-trips', () => {
  const samples = [
    ['the spec worked examples', '点茗'],
    ['a common word', '漢字'],
    ['a sentence', '日本語のテキストです'],
    ['hiragana', 'ひらがなのぶんしょう'],
    ['katakana', 'カタカナノブンショウ'],
    ['mixed scripts', '漢字とひらがなとカタカナ'],
    ['punctuation', '「こんにちは、世界。」'],
    ['greek from JIS X 0208', 'ΑΒΓΔΕ'],
    ['a single character', '点'],
  ];

  for (const [label, text] of samples) {
    it(`${label}: "${text}"`, () => {
      const { matrix, segments } = qr(text, { ecLevel: 'M' });
      expect(segments.some((s) => s.mode === 'kanji')).toBe(true);
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }
});

describe('mixed Kanji and other modes round-trip', () => {
  const samples = [
    ['kanji then digits', `${'漢'.repeat(20)}1234567890123456789012345678901234567890`],
    ['kanji then uppercase', `${'漢'.repeat(20)}ABCDEFGHIJKLMNOPQRST`],
    ['kanji then lowercase', `${'漢'.repeat(20)}abcdefghijklmnopqrst`],
    ['digits then kanji', `${'9'.repeat(40)}${'字'.repeat(20)}`],
    ['a realistic label', '製品コード: AB-1234 数量 56'],
  ];

  for (const [label, text] of samples) {
    it(label, () => {
      const { matrix, segments } = qr(text, { ecLevel: 'M' });
      expect(new Set(segments.map((s) => s.mode)).size).toBeGreaterThan(1);
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }
});

describe('Kanji mode across error-correction levels and versions', () => {
  for (const ecLevel of ['L', 'M', 'Q', 'H']) {
    it(`level ${ecLevel}`, () => {
      const text = '日本語テキスト';
      const { matrix } = qr(text, { ecLevel });
      expect(decodeMatrix(matrix)).toBe(text);
    });
  }

  for (const version of [1, 7, 10, 27, 40]) {
    it(`version ${version}`, () => {
      // Fill a meaningful fraction of the symbol so the version is really used.
      const text = '漢字'.repeat(Math.max(1, version * 3));
      const result = qr(text, { ecLevel: 'L', version });
      expect(result.version).toBe(version);
      expect(decodeMatrix(result.matrix)).toBe(text);
    });
  }
});

describe("encoding: 'shift-jis' round-trips", () => {
  it('encodes Japanese text with no ECI header', () => {
    const text = '日本語';
    const result = qr(text, { ecLevel: 'M', encoding: 'shift-jis' });
    expect(result.eci).toBeUndefined();
    expect(decodeMatrix(result.matrix)).toBe(text);
  });

  it('encodes Japanese text mixed with ASCII', () => {
    const text = `${'漢'.repeat(20)}CODE-42`;
    const result = qr(text, { ecLevel: 'M', encoding: 'shift-jis' });
    expect(decodeMatrix(result.matrix)).toBe(text);
  });
});

describe('Kanji mode is chosen because it is smaller', () => {
  it('produces a lower version than byte mode would need', () => {
    // The clearest evidence the optimiser is doing its job: the same payload
    // needs a smaller symbol once Kanji mode is available.
    const text = '日本語'.repeat(12);
    const withKanji = qr(text, { ecLevel: 'M' });
    // Force byte mode by asking for a character Kanji cannot represent, which
    // has a comparable UTF-8 cost.
    const asBytes = qr('é'.repeat(36), { ecLevel: 'M' });
    expect(withKanji.segments.some((s) => s.mode === 'kanji')).toBe(true);
    expect(withKanji.version).toBeLessThan(asBytes.version);
    expect(decodeMatrix(withKanji.matrix)).toBe(text);
  });
});
