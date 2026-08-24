/**
 * M10 gate (ADR-0011): Kanji mode.
 *
 * This file lives on its own because importing `src/encode/kanji.js` registers
 * the mode process-wide, which changes segmentation for every other test in the
 * same module graph. Vitest isolates per file, so the registration stays here.
 */
import { describe, expect, it } from 'vitest';
import * as kanji from '../../../src/encode/kanji.js';
import { BitBuffer } from '../../../src/util/bitbuffer.js';
import { encoderFor, countBitsFor, Mode } from '../../../src/core/mode.js';
import { makeSegments, segmentsBitLength, writeSegments } from '../../../src/core/segment.js';
import { ModeError } from '../../../src/util/errors.js';
import { bitString } from '../../helpers/bits.js';

const segmentsFor = (text, encoding = 'utf-8') =>
  makeSegments(text, { rangeIndex: 0, encoding });

const shapeOf = (segments) => segments.map((s) => `${s.mode}:${s.text}`);

describe('mode constants', () => {
  it('match ISO/IEC 18004', () => {
    expect(kanji.NAME).toBe('kanji');
    expect(kanji.MODE_INDICATOR).toBe(0b1000);
    expect(Array.from(kanji.COUNT_BITS)).toEqual([8, 10, 12]);
    expect(kanji.BITS_PER_CHAR).toBe(13);
  });

  it('costs a flat 13 bits per character', () => {
    expect(kanji.dataBitLength(0)).toBe(0);
    expect(kanji.dataBitLength(1)).toBe(13);
    expect(kanji.dataBitLength(10)).toBe(130);
  });
});

describe('the ISO/IEC 18004 section 8.4.5 worked examples', () => {
  // The two characters the specification works through by hand, with the exact
  // bit strings it states. These are the independent conformance evidence for
  // this mode -- everything else here is structural.
  const cases = [
    ['点', '0110110011111'], // U+70B9, Shift-JIS 0x935F
    ['茗', '1101010101010'], // U+8317, Shift-JIS 0xE4AA
  ];

  for (const [char, expected] of cases) {
    it(`U+${char.codePointAt(0).toString(16).toUpperCase()} packs to ${expected}`, () => {
      const buffer = new BitBuffer();
      kanji.write(buffer, char);
      expect(bitString(buffer)).toBe(expected);
      expect(buffer.bitLength).toBe(13);
    });
  }

  it('writes both together as 26 bits', () => {
    const buffer = new BitBuffer();
    kanji.write(buffer, '点茗');
    expect(bitString(buffer)).toBe('0110110011111' + '1101010101010');
  });
});

describe('canEncode', () => {
  it('accepts characters in the two Shift-JIS ranges', () => {
    for (const char of '漢字日本語点茗あアー、。') {
      expect(kanji.canEncode(char.codePointAt(0))).toBe(true);
    }
  });

  it('rejects ASCII', () => {
    for (const char of 'Aa0 -/:') {
      expect(kanji.canEncode(char.codePointAt(0))).toBe(false);
    }
  });

  it('rejects characters with no Shift-JIS representation', () => {
    for (const char of ['€', 'é', '😀', '한', 'Á', 'ß']) {
      expect(kanji.canEncode(char.codePointAt(0))).toBe(false);
    }
  });

  it('accepts the Greek, Cyrillic and enclosed characters JIS X 0208 includes', () => {
    // Easy to assume Kanji mode is kanji only. It is not -- JIS X 0208 carries
    // Greek in row 6, Cyrillic in row 7, and a block of enclosed and
    // CJK-compatibility symbols.
    for (const char of 'Ωαюя①㈱') {
      expect(kanji.canEncode(char.codePointAt(0))).toBe(true);
    }
  });

  it('covers a realistic slice of JIS X 0208', () => {
    // Roughly 7,000 characters are reachable; a table that silently came back
    // near-empty would still pass every test above.
    expect(kanji.countEncodable(Array.from({ length: 0x9fff - 0x4e00 }, (_, i) =>
      String.fromCodePoint(0x4e00 + i)).join(''))).toBeGreaterThan(6000);
  });
});

describe('countEncodable', () => {
  it('counts only the encodable characters', () => {
    expect(kanji.countEncodable('漢字ABC')).toBe(2);
    expect(kanji.countEncodable('ABC')).toBe(0);
    expect(kanji.countEncodable('')).toBe(0);
  });
});

describe('registration', () => {
  it('makes the mode resolvable through core', () => {
    expect(encoderFor(Mode.KANJI).NAME).toBe('kanji');
  });

  it('no longer throws the missing-entry-point error', () => {
    expect(() => encoderFor(Mode.KANJI)).not.toThrow();
  });

  it('reports the count widths through core', () => {
    expect(countBitsFor(Mode.KANJI, 1)).toBe(8);
    expect(countBitsFor(Mode.KANJI, 10)).toBe(10);
    expect(countBitsFor(Mode.KANJI, 27)).toBe(12);
  });
});

describe('segmentation now considers Kanji mode', () => {
  it('picks Kanji for Japanese text', () => {
    expect(shapeOf(segmentsFor('漢字漢字'))).toEqual(['kanji:漢字漢字']);
  });

  it('beats byte mode on bits for the same text', () => {
    // 13 bits per character against 24 for the same character in UTF-8.
    const text = '日本語のテキスト';
    const withKanji = segmentsBitLength(segmentsFor(text), 1);
    const asBytes = 4 + countBitsFor('byte', 1) + 8 * new TextEncoder().encode(text).length;
    expect(withKanji).toBeLessThan(asBytes);
  });

  it('splits Kanji from ASCII when the run is long enough', () => {
    const shape = shapeOf(segmentsFor(`${'漢'.repeat(20)}ABCDEFGHIJ`));
    expect(shape[0]).toBe(`kanji:${'漢'.repeat(20)}`);
    expect(shape[shape.length - 1]).toBe('alphanumeric:ABCDEFGHIJ');
  });

  it('switches even for a single Kanji character, because byte mode is worse', () => {
    // Alphanumeric cannot represent it, so the alternatives are Kanji at
    // 4 + 8 + 13 = 25 bits, or byte mode at 4 + 8 + 24 = 36 for the same
    // character in UTF-8. Kanji wins outright.
    const shape = shapeOf(segmentsFor('ABCDEFGHIJKLMNOP漢ABCDEFGHIJKLMNOP'));
    expect(shape).toContain('kanji:漢');
  });

  it('still writes a consistent bit length', () => {
    for (const text of ['漢字', '漢字ABC123', 'ABC漢字123', '日本語', '漢']) {
      for (const version of [1, 10, 27, 40]) {
        const segments = makeSegments(text, { rangeIndex: version <= 9 ? 0 : version <= 26 ? 1 : 2 });
        const buffer = new BitBuffer();
        writeSegments(buffer, segments, version);
        expect(buffer.bitLength).toBe(segmentsBitLength(segments, version));
      }
    }
  });

  it('writes the Kanji mode indicator', () => {
    const buffer = new BitBuffer();
    writeSegments(buffer, segmentsFor('漢字漢字'), 1);
    expect(bitString(buffer).slice(0, 4)).toBe('1000');
    expect(bitString(buffer).slice(4, 12)).toBe('00000100'); // 4 characters, 8 bits
  });

  it('never costs more than encoding everything as bytes', () => {
    const samples = ['漢字', '日本語のテキスト', '漢字ABC123', 'ABC', '123', '漢1A'];
    for (const text of samples) {
      const optimal = segmentsBitLength(segmentsFor(text), 1);
      const asBytes = 4 + countBitsFor('byte', 1) + 8 * new TextEncoder().encode(text).length;
      expect(optimal).toBeLessThanOrEqual(asBytes);
    }
  });
});

describe("encoding: 'shift-jis'", () => {
  it('is accepted now that the mode is registered', () => {
    expect(() => segmentsFor('漢字', 'shift-jis')).not.toThrow();
  });

  it('needs no ECI, since Kanji mode carries its own character set', () => {
    const buffer = new BitBuffer();
    writeSegments(buffer, segmentsFor('漢字', 'shift-jis'), 1);
    expect(bitString(buffer).slice(0, 4)).toBe('1000');
  });

  it('encodes ASCII alongside Kanji as single bytes', () => {
    const segments = segmentsFor(`${'漢'.repeat(20)}abcdefghij`, 'shift-jis');
    const byteSegment = segments.find((s) => s.mode === 'byte');
    expect(byteSegment.charCount).toBe(10);
    expect(Array.from(byteSegment.bytes)).toEqual([...'abcdefghij'].map((c) => c.codePointAt(0)));
  });

  it('refuses a character that is neither Kanji nor single-byte', () => {
    // é has no Kanji-mode representation and is not single-byte Shift-JIS.
    // Silently substituting it would produce a symbol decoding to wrong text.
    expect(() => segmentsFor(`${'漢'.repeat(20)}éééééééééé`, 'shift-jis')).toThrow(ModeError);
  });

  it('names the offending character', () => {
    expect(() => segmentsFor(`${'漢'.repeat(20)}éééééééééé`, 'shift-jis')).toThrow(/"é"/);
  });

  it("suggests 'utf-8' instead, naming the option value", () => {
    expect(() => segmentsFor(`${'漢'.repeat(20)}éééééééééé`, 'shift-jis')).toThrow(/'utf-8'/);
  });

  it('routes kanji to Kanji mode rather than costing it as one byte', () => {
    // Regression: byte cost under shift-jis was one byte per character, which
    // made byte mode look cheaper than Kanji for a short run and then failed
    // when the bytes were actually produced.
    expect(shapeOf(segmentsFor('漢字', 'shift-jis'))).toEqual(['kanji:漢字']);
  });
});

describe('shift-jis byte encoding', () => {
  it('is exposed on the encoder for core to delegate to', () => {
    expect(typeof encoderFor(Mode.KANJI).encodeBytes).toBe('function');
  });

  it('passes ASCII through unchanged', () => {
    expect(Array.from(kanji.encodeBytes('Hi!'))).toEqual([0x48, 0x69, 0x21]);
  });

  it('accepts an empty string', () => {
    expect(kanji.encodeBytes('').length).toBe(0);
  });

  it('throws a ModeError above 0x7F', () => {
    expect(() => kanji.encodeBytes('café')).toThrow(ModeError);
  });
});
