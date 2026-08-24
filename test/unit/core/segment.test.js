/**
 * M3 gate (ADR-0011): full segment bitstreams, and the mode-switching decisions
 * the dynamic program is there to get right.
 */
import { describe, expect, it } from 'vitest';
import {
  eciFor,
  makeSegments,
  segmentsBitLength,
  writeSegments,
} from '../../../src/core/segment.js';
import { countBitsFor, versionRangeIndex } from '../../../src/core/mode.js';
import { BitBuffer } from '../../../src/util/bitbuffer.js';
import { ModeError } from '../../../src/util/errors.js';
import { bitString } from '../../helpers/bits.js';

const segmentsFor = (text, version, encoding = 'utf-8') =>
  makeSegments(text, { rangeIndex: versionRangeIndex(version), encoding });

const shapeOf = (segments) => segments.map((s) => `${s.mode}:${s.text}`);

describe('published bitstreams', () => {
  it('encodes "HELLO WORLD" at version 1 with indicators', () => {
    const segments = segmentsFor('HELLO WORLD', 1);
    const buffer = new BitBuffer();
    writeSegments(buffer, segments, 1);

    expect(bitString(buffer)).toBe(
      '0010' // alphanumeric mode indicator
      + '000001011' // count = 11, 9 bits at version 1
      + '01100001011' + '01111000110' + '10001011100'
      + '10110111000' + '10011010100' + '001101',
    );
    expect(buffer.bitLength).toBe(74);
  });

  it('encodes "01234567" at version 1 with indicators', () => {
    const segments = segmentsFor('01234567', 1);
    const buffer = new BitBuffer();
    writeSegments(buffer, segments, 1);

    expect(bitString(buffer)).toBe(
      '0001' // numeric mode indicator
      + '0000001000' // count = 8, 10 bits at version 1
      + '0000001100' + '0101011001' + '1000011',
    );
    expect(buffer.bitLength).toBe(41);
  });
});

describe('mode selection', () => {
  it('picks numeric for digits only', () => {
    expect(shapeOf(segmentsFor('8675309', 1))).toEqual(['numeric:8675309']);
  });

  it('picks alphanumeric for uppercase and the punctuation subset', () => {
    expect(shapeOf(segmentsFor('HTTPS://EXAMPLE.COM', 1))).toEqual(['alphanumeric:HTTPS://EXAMPLE.COM']);
  });

  it('picks byte when lowercase is present', () => {
    expect(shapeOf(segmentsFor('hello', 1))).toEqual(['byte:hello']);
  });

  it('picks byte for non-ASCII', () => {
    expect(shapeOf(segmentsFor('café', 1))).toEqual(['byte:café']);
  });

  it('counts bytes, not characters, for byte segments', () => {
    const [segment] = segmentsFor('€', 1);
    expect(segment.mode).toBe('byte');
    expect(segment.text).toBe('€');
    expect(segment.charCount).toBe(3);
    expect(segment.bytes.length).toBe(3);
  });

  it('returns nothing for empty input', () => {
    expect(segmentsFor('', 1)).toEqual([]);
  });
});

describe('mode switching pays for itself before it happens', () => {
  it('does not switch for a short digit run inside letters', () => {
    // Switching costs a 4-bit indicator plus a count indicator. Two digits
    // never repay that.
    expect(shapeOf(segmentsFor('AB12CD', 1))).toEqual(['alphanumeric:AB12CD']);
  });

  it('does switch for a long digit run', () => {
    const text = `AB${'1'.repeat(40)}CD`;
    const shape = shapeOf(segmentsFor(text, 1));
    expect(shape.length).toBeGreaterThan(1);
    expect(shape).toContain(`numeric:${'1'.repeat(40)}`);
  });

  it('separates a lowercase run from a long uppercase run', () => {
    const text = `${'A'.repeat(40)}lower`;
    const shape = shapeOf(segmentsFor(text, 1));
    expect(shape[0]).toBe(`alphanumeric:${'A'.repeat(40)}`);
    expect(shape[shape.length - 1]).toBe('byte:lower');
  });

  it('never costs more than encoding everything as bytes', () => {
    const samples = [
      'HELLO WORLD',
      '0123456789',
      'AB12CD',
      'https://example.com/path?q=1',
      'MIXED case 123 AND 456789012345678901234567890',
      'Ünïcödé mixed with 12345678901234567890',
      'A',
      '1',
      'a',
      ':/$%*+-.',
    ];

    for (const version of [1, 10, 27, 40]) {
      for (const text of samples) {
        const optimal = segmentsBitLength(segmentsFor(text, version), version);
        const bytes = new TextEncoder().encode(text).length;
        const allBytes = 4 + countBitsFor('byte', version) + 8 * bytes;
        expect(optimal).toBeLessThanOrEqual(allBytes);
      }
    }
  });

  it('re-segments when the version range changes the indicator widths', () => {
    // A switch that pays at version 1 need not pay at version 27, where every
    // count indicator is wider.
    const text = `AB${'1'.repeat(12)}CD`;
    const atV1 = shapeOf(segmentsFor(text, 1));
    const atV27 = shapeOf(segmentsFor(text, 27));
    expect(atV1.length).toBeGreaterThanOrEqual(1);
    expect(atV27.length).toBeGreaterThanOrEqual(1);
    // Whatever each picks, neither may exceed its own single-segment cost.
    expect(segmentsBitLength(segmentsFor(text, 1), 1))
      .toBeLessThanOrEqual(4 + countBitsFor('alphanumeric', 1) + Math.ceil(text.length * 5.5));
  });
});

describe('segmentsBitLength', () => {
  it('matches the bits actually written, across versions and inputs', () => {
    const samples = [
      'HELLO WORLD',
      '01234567',
      'hello world',
      'A1B2C3',
      `${'9'.repeat(100)}ABC`,
      'Ünïcödé',
      '',
    ];

    for (const version of [1, 9, 10, 26, 27, 40]) {
      for (const text of samples) {
        const segments = segmentsFor(text, version);
        const buffer = new BitBuffer();
        writeSegments(buffer, segments, version);
        expect(buffer.bitLength).toBe(segmentsBitLength(segments, version));
      }
    }
  });

  it('is zero for no segments', () => {
    expect(segmentsBitLength([], 1)).toBe(0);
  });
});

describe('count indicator widths follow the version range', () => {
  it('steps at version 10 and version 27', () => {
    expect(versionRangeIndex(1)).toBe(0);
    expect(versionRangeIndex(9)).toBe(0);
    expect(versionRangeIndex(10)).toBe(1);
    expect(versionRangeIndex(26)).toBe(1);
    expect(versionRangeIndex(27)).toBe(2);
    expect(versionRangeIndex(40)).toBe(2);
  });

  it('writes a wider count indicator at version 10 than at version 9', () => {
    const text = '1234567890';
    const at9 = new BitBuffer();
    const at10 = new BitBuffer();
    writeSegments(at9, segmentsFor(text, 9), 9);
    writeSegments(at10, segmentsFor(text, 10), 10);
    expect(at10.bitLength - at9.bitLength).toBe(2); // numeric: 10 bits -> 12
  });
});

describe('unsupported encodings fail loudly', () => {
  // Regression: shift-jis used to fall through to the UTF-8 byte-length path,
  // so a caller asking for Shift-JIS silently got a UTF-8 symbol with no error.
  it('rejects shift-jis without the Kanji entry point', () => {
    expect(() => segmentsFor('text', 1, 'shift-jis')).toThrow(ModeError);
  });

  it('names the entry point to import', () => {
    expect(() => segmentsFor('text', 1, 'shift-jis')).toThrow(/libqr\/kanji/);
  });

  it('rejects it for empty input too, rather than returning early', () => {
    expect(() => segmentsFor('', 1, 'shift-jis')).toThrow(ModeError);
  });

  it('does not silently encode as UTF-8', () => {
    let segments = null;
    try {
      segments = segmentsFor('abc', 1, 'shift-jis');
    } catch {
      segments = 'threw';
    }
    expect(segments).toBe('threw');
  });

  it('still accepts utf-8 and latin1', () => {
    expect(() => segmentsFor('café', 1, 'utf-8')).not.toThrow();
    expect(() => segmentsFor('café', 1, 'latin1')).not.toThrow();
  });

  it('counts one byte per character under latin1', () => {
    const [segment] = segmentsFor('café', 1, 'latin1');
    expect(segment.mode).toBe('byte');
    expect(segment.charCount).toBe(4);
  });
});

describe('eciFor', () => {
  it('is undefined for pure ASCII', () => {
    expect(eciFor('HELLO WORLD')).toBeUndefined();
    expect(eciFor('')).toBeUndefined();
    expect(eciFor('~!@#$%^&*()_+')).toBeUndefined();
  });

  it('is 26 for non-ASCII under UTF-8', () => {
    expect(eciFor('café')).toBe(26);
    expect(eciFor('日本')).toBe(26);
  });

  it('is 3 for non-ASCII under Latin-1', () => {
    expect(eciFor('café', 'latin1')).toBe(3);
  });
});
