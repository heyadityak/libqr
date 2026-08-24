import { describe, expect, it } from 'vitest';
import {
  DENSITY_ORDER,
  Mode,
  countBitsFor,
  encoderFor,
  modeIndicatorFor,
  versionRangeIndex,
} from '../../../src/core/mode.js';
import { ModeError } from '../../../src/util/errors.js';

describe('encoderFor', () => {
  it('resolves the three built-in modes', () => {
    expect(encoderFor(Mode.NUMERIC).NAME).toBe('numeric');
    expect(encoderFor(Mode.ALPHANUMERIC).NAME).toBe('alphanumeric');
    expect(encoderFor(Mode.BYTE).NAME).toBe('byte');
  });

  it('throws a ModeError naming the entry point when Kanji is not loaded', () => {
    // ADR-0006: Kanji lives behind its own entry point so its Shift-JIS table
    // stays out of the default bundle. The error has to say so.
    expect(() => encoderFor(Mode.KANJI)).toThrow(ModeError);
    expect(() => encoderFor(Mode.KANJI)).toThrow(/libqr\/kanji/);
  });

  it('throws a ModeError for an unknown mode', () => {
    expect(() => encoderFor('base64')).toThrow(ModeError);
    try {
      encoderFor('base64');
    } catch (error) {
      expect(error.mode).toBe('base64');
    }
  });
});

describe('countBitsFor', () => {
  // ISO/IEC 18004 Table 3.
  const expected = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
  };

  for (const [mode, [low, mid, high]] of Object.entries(expected)) {
    it(`${mode} is ${low}/${mid}/${high} across the three ranges`, () => {
      expect(countBitsFor(mode, 1)).toBe(low);
      expect(countBitsFor(mode, 9)).toBe(low);
      expect(countBitsFor(mode, 10)).toBe(mid);
      expect(countBitsFor(mode, 26)).toBe(mid);
      expect(countBitsFor(mode, 27)).toBe(high);
      expect(countBitsFor(mode, 40)).toBe(high);
    });
  }
});

describe('modeIndicatorFor', () => {
  it('matches ISO/IEC 18004 Table 2', () => {
    expect(modeIndicatorFor(Mode.NUMERIC)).toBe(0b0001);
    expect(modeIndicatorFor(Mode.ALPHANUMERIC)).toBe(0b0010);
    expect(modeIndicatorFor(Mode.BYTE)).toBe(0b0100);
  });

  it('gives every built-in mode a distinct indicator', () => {
    const indicators = DENSITY_ORDER.map((mode) => mode.MODE_INDICATOR);
    expect(new Set(indicators).size).toBe(indicators.length);
  });
});

describe('versionRangeIndex', () => {
  it('covers every version exactly once', () => {
    for (let version = 1; version <= 40; version += 1) {
      const index = versionRangeIndex(version);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(2);
    }
  });

  it('is monotonic', () => {
    let previous = 0;
    for (let version = 1; version <= 40; version += 1) {
      const index = versionRangeIndex(version);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });
});

describe('DENSITY_ORDER', () => {
  it('lists modes cheapest per character first', () => {
    expect(DENSITY_ORDER.map((mode) => mode.NAME)).toEqual(['numeric', 'alphanumeric', 'byte']);
  });
});
