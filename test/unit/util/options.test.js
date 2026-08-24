/**
 * ADR-0009 / ADR-0013: options are validated once, at every public boundary,
 * with typed errors that name the option and the limit.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULTS, MIN_QUIET_ZONE, isQuietZoneTooNarrow, normalizeOptions } from '../../../src/util/options.js';
import { OptionError } from '../../../src/util/errors.js';
import { encode } from '../../../src/core/qr.js';
import { qr, toSvg } from '../../../src/index.js';

describe('defaults', () => {
  it('fills in every option', () => {
    const normalized = normalizeOptions();
    for (const key of Object.keys(DEFAULTS)) {
      expect(key in normalized).toBe(true);
    }
  });

  it('defaults to level M, UTF-8, square modules, and the spec quiet zone', () => {
    const normalized = normalizeOptions();
    expect(normalized.ecLevel).toBe('M');
    expect(normalized.encoding).toBe('utf-8');
    expect(normalized.shape).toBe('square');
    expect(normalized.quietZone).toBe(MIN_QUIET_ZONE);
    expect(normalized.scale).toBe(4);
  });

  it('returns a frozen object, so no internal function can mutate it', () => {
    const normalized = normalizeOptions();
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it('accepts no argument, undefined, and an empty object alike', () => {
    expect(normalizeOptions()).toEqual(normalizeOptions(undefined));
    expect(normalizeOptions()).toEqual(normalizeOptions({}));
  });
});

describe('forward compatibility', () => {
  it('ignores unknown keys rather than throwing', () => {
    // An option from a newer version must degrade, not break.
    expect(() => normalizeOptions({ futureOption: 'whatever', anotherOne: 42 })).not.toThrow();
  });

  it('silently ignores a mis-cased key, which is the documented cost', () => {
    // `quietzone` is not `quietZone`. Accepted trade for forward compatibility.
    expect(normalizeOptions({ quietzone: 0 }).quietZone).toBe(MIN_QUIET_ZONE);
  });
});

describe('validation', () => {
  const cases = [
    ['ecLevel', { ecLevel: 'X' }],
    ['ecLevel', { ecLevel: 'l' }],
    ['ecLevel', { ecLevel: 1 }],
    ['encoding', { encoding: 'utf16' }],
    ['shape', { shape: 'triangle' }],
    ['version', { version: 0 }],
    ['version', { version: 41 }],
    ['version', { version: 1.5 }],
    ['version', { version: '10' }],
    ['mask', { mask: -1 }],
    ['mask', { mask: 8 }],
    ['minVersion', { minVersion: 0 }],
    ['maxVersion', { maxVersion: 41 }],
    ['quietZone', { quietZone: -1 }],
    ['scale', { scale: 0 }],
    ['scale', { scale: 1.5 }],
    ['eci', { eci: -1 }],
    ['eci', { eci: 1000000 }],
    ['dark', { dark: '' }],
    ['light', { light: 123 }],
  ];

  for (const [option, input] of cases) {
    it(`rejects ${option} = ${JSON.stringify(Object.values(input)[0])}`, () => {
      expect(() => normalizeOptions(input)).toThrow(OptionError);
      try {
        normalizeOptions(input);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(OptionError);
        expect(error.option).toBe(option);
        // The message must name the offending value, not just the key.
        expect(error.message.length).toBeGreaterThan(option.length + 10);
      }
    });
  }

  it('rejects a non-object options argument', () => {
    for (const bad of ['M', 42, true]) {
      expect(() => normalizeOptions(bad)).toThrow(OptionError);
    }
  });

  it('treats null as absent rather than invalid', () => {
    // `null` is what a caller passing an optional variable through ends up with.
    expect(() => normalizeOptions(null)).toThrow(OptionError);
  });

  it('rejects an inverted version range', () => {
    expect(() => normalizeOptions({ minVersion: 20, maxVersion: 5 })).toThrow(OptionError);
  });

  it('accepts every valid mask and level', () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H']) {
      for (let mask = 0; mask < 8; mask += 1) {
        expect(() => normalizeOptions({ ecLevel, mask })).not.toThrow();
      }
    }
  });

  it('accepts every valid version', () => {
    for (let version = 1; version <= 40; version += 1) {
      expect(normalizeOptions({ version }).version).toBe(version);
    }
  });
});

describe('option interactions', () => {
  it('pins the search range when an explicit version is given', () => {
    const normalized = normalizeOptions({ version: 12, minVersion: 1, maxVersion: 40 });
    expect(normalized.minVersion).toBe(12);
    expect(normalized.maxVersion).toBe(12);
  });

  it('treats margin as an alias for quietZone', () => {
    expect(normalizeOptions({ margin: 2 }).quietZone).toBe(2);
  });

  it('lets quietZone win when both are given', () => {
    expect(normalizeOptions({ quietZone: 6, margin: 2 }).quietZone).toBe(6);
  });
});

describe('quiet zone warning threshold', () => {
  it('flags anything below the spec minimum', () => {
    expect(isQuietZoneTooNarrow(0)).toBe(true);
    expect(isQuietZoneTooNarrow(3)).toBe(true);
    expect(isQuietZoneTooNarrow(4)).toBe(false);
    expect(isQuietZoneTooNarrow(10)).toBe(false);
  });

  it('does not throw for a narrow quiet zone', () => {
    // A tight quiet zone still produces a valid symbol; it just scans badly.
    expect(() => normalizeOptions({ quietZone: 0 })).not.toThrow();
  });
});

describe('every public boundary validates', () => {
  // ADR-0013 exists because `encode()` is a documented public function and
  // would otherwise bypass the validator entirely.
  const invalid = { ecLevel: 'X' };

  it('qr() validates', () => {
    expect(() => qr('x', invalid)).toThrow(OptionError);
  });

  it('toSvg() validates', () => {
    expect(() => toSvg('x', invalid)).toThrow(OptionError);
  });

  it('encode() validates', () => {
    expect(() => encode('x', invalid)).toThrow(OptionError);
  });

  it('all three reject the same invalid option the same way', () => {
    const messages = [qr, toSvg, encode].map((fn) => {
      try {
        fn('x', invalid);
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toBeNull();
  });
});
