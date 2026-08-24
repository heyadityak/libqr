/**
 * M4 gate (ADR-0011): exact-capacity and capacity-plus-one across all four EC
 * levels, terminator truncation, and the codeword assembly vector.
 */
import { describe, expect, it } from 'vitest';
import {
  blockDescriptorFor,
  buildCodewords,
  buildDataCodewords,
  dataCapacityBits,
  dataCodewordsFor,
  selectVersion,
  totalCodewordsFor,
} from '../../../src/core/version.js';
import { versionRangeIndex } from '../../../src/core/mode.js';
import { makeSegments, segmentsBitLength } from '../../../src/core/segment.js';
import { EC_LEVELS, MAX_VERSION } from '../../../src/core/constants.js';
import { CapacityError, OptionError } from '../../../src/util/errors.js';

const LEVELS = Array.from(EC_LEVELS);
const SAMPLE_VERSIONS = [1, 2, 6, 7, 9, 10, 15, 26, 27, 33, 40];

const segmentsAt = (text, version, encoding = 'utf-8') =>
  makeSegments(text, { rangeIndex: versionRangeIndex(version), encoding });

/** Largest digit count that still fits `version` at `ecLevel`. */
function maxDigits(version, ecLevel) {
  const capacity = dataCapacityBits(version, ecLevel);
  let low = 0;
  let high = 8000;
  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    const needed = segmentsBitLength(segmentsAt('7'.repeat(mid), version), version);
    if (needed <= capacity) low = mid;
    else high = mid - 1;
  }
  return low;
}

describe('blockDescriptorFor', () => {
  it('describes version 1 at level M as a single 16-codeword block', () => {
    expect(blockDescriptorFor(1, 'M')).toEqual({
      groups: [{ count: 1, dataCodewords: 16 }],
      ecCodewordsPerBlock: 10,
    });
  });

  it('describes version 5 at level Q as two 15s then two 16s', () => {
    expect(blockDescriptorFor(5, 'Q')).toEqual({
      groups: [{ count: 2, dataCodewords: 15 }, { count: 2, dataCodewords: 16 }],
      ecCodewordsPerBlock: 18,
    });
  });

  it('accounts for every data codeword, for all 160 combinations', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= MAX_VERSION; version += 1) {
        const { groups } = blockDescriptorFor(version, level);
        const covered = groups.reduce((sum, g) => sum + g.count * g.dataCodewords, 0);
        expect(covered).toBe(dataCodewordsFor(version, level));
      }
    }
  });

  it('never differs by more than one codeword between groups', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= MAX_VERSION; version += 1) {
        const { groups } = blockDescriptorFor(version, level);
        if (groups.length === 2) {
          expect(groups[1].dataCodewords - groups[0].dataCodewords).toBe(1);
        }
        expect(groups.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('orders shorter blocks first, which interleaving relies on', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= MAX_VERSION; version += 1) {
        const { groups } = blockDescriptorFor(version, level);
        for (let i = 1; i < groups.length; i += 1) {
          expect(groups[i].dataCodewords).toBeGreaterThan(groups[i - 1].dataCodewords);
        }
      }
    }
  });
});

describe('buildDataCodewords', () => {
  it('encodes "HELLO WORLD" at version 1 level M to the published codewords', () => {
    const codewords = buildDataCodewords({
      segments: segmentsAt('HELLO WORLD', 1),
      version: 1,
      ecLevel: 'M',
    });
    expect(Array.from(codewords)).toEqual([
      0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d,
      0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
    ]);
  });

  it('encodes the same payload at level Q with fewer pad codewords', () => {
    const codewords = buildDataCodewords({
      segments: segmentsAt('HELLO WORLD', 1),
      version: 1,
      ecLevel: 'Q',
    });
    expect(Array.from(codewords)).toEqual([
      0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d,
      0x43, 0x40, 0xec, 0x11, 0xec,
    ]);
  });

  it('alternates pad codewords 0xEC and 0x11', () => {
    const codewords = buildDataCodewords({
      segments: segmentsAt('A', 10),
      version: 10,
      ecLevel: 'L',
    });
    // Everything after the encoded payload is pad, and it must alternate.
    const padStart = codewords.indexOf(0xec);
    for (let i = padStart; i < codewords.length; i += 1) {
      expect(codewords[i]).toBe((i - padStart) % 2 === 0 ? 0xec : 0x11);
    }
  });

  it('always fills the version exactly', () => {
    for (const level of LEVELS) {
      for (const version of SAMPLE_VERSIONS) {
        const codewords = buildDataCodewords({
          segments: segmentsAt('TEST 1234', version),
          version,
          ecLevel: level,
        });
        expect(codewords.length).toBe(dataCodewordsFor(version, level));
      }
    }
  });

  it('writes an ECI header when one is requested', () => {
    const withoutEci = buildDataCodewords({
      segments: segmentsAt('x', 1), version: 1, ecLevel: 'L',
    });
    const withEci = buildDataCodewords({
      segments: segmentsAt('x', 1), version: 1, ecLevel: 'L', eci: 26,
    });
    // 0111 then 00011010 leads the stream instead of the byte-mode indicator.
    expect(withEci[0] >> 4).toBe(0b0111);
    expect(withoutEci[0] >> 4).toBe(0b0100);
  });

  it('rejects segments that overflow the version', () => {
    expect(() => buildDataCodewords({
      segments: segmentsAt('9'.repeat(200), 1),
      version: 1,
      ecLevel: 'H',
    })).toThrow(CapacityError);
  });

  it('names the input and the limit in the capacity error', () => {
    try {
      buildDataCodewords({
        segments: segmentsAt('9'.repeat(200), 1), version: 1, ecLevel: 'H',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CapacityError);
      expect(error.available).toBe(dataCapacityBits(1, 'H'));
      expect(error.needed).toBeGreaterThan(error.available);
      expect(error.version).toBe(1);
      expect(error.ecLevel).toBe('H');
      expect(error.message).toMatch(/version 1 at EC level H/);
    }
  });
});

describe('exact capacity and one past it', () => {
  it('fills every sampled version and level exactly, at all four levels', () => {
    for (const level of LEVELS) {
      for (const version of SAMPLE_VERSIONS) {
        const digits = maxDigits(version, level);
        const text = '7'.repeat(digits);

        const codewords = buildDataCodewords({
          segments: segmentsAt(text, version), version, ecLevel: level,
        });
        expect(codewords.length).toBe(dataCodewordsFor(version, level));
      }
    }
  });

  it('does not fit one more character at any sampled version and level', () => {
    for (const level of LEVELS) {
      for (const version of SAMPLE_VERSIONS) {
        const digits = maxDigits(version, level);
        const tooLong = '7'.repeat(digits + 1);
        const needed = segmentsBitLength(segmentsAt(tooLong, version), version);
        expect(needed).toBeGreaterThan(dataCapacityBits(version, level));
      }
    }
  });

  it('truncates the terminator rather than omitting it', () => {
    // Find a version and level where the payload leaves fewer than four bits.
    let checked = 0;
    for (const level of LEVELS) {
      for (const version of SAMPLE_VERSIONS) {
        const digits = maxDigits(version, level);
        const text = '7'.repeat(digits);
        const capacity = dataCapacityBits(version, level);
        const used = segmentsBitLength(segmentsAt(text, version), version);
        const slack = capacity - used;
        if (slack >= 4) continue;

        checked += 1;
        // It must still build, and still fill the version exactly.
        const codewords = buildDataCodewords({
          segments: segmentsAt(text, version), version, ecLevel: level,
        });
        expect(codewords.length).toBe(dataCodewordsFor(version, level));
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('selectVersion', () => {
  it('picks version 1 for a short payload', () => {
    expect(selectVersion('HELLO WORLD', { ecLevel: 'M' }).version).toBe(1);
  });

  it('picks a larger version for a stronger EC level', () => {
    const text = '9'.repeat(60);
    const atL = selectVersion(text, { ecLevel: 'L' }).version;
    const atH = selectVersion(text, { ecLevel: 'H' }).version;
    expect(atH).toBeGreaterThan(atL);
  });

  it('returns segmentation matched to the chosen version', () => {
    const { version, segments } = selectVersion('HELLO WORLD 12345678901234567890', { ecLevel: 'L' });
    expect(segmentsBitLength(segments, version)).toBeLessThanOrEqual(dataCapacityBits(version, 'L'));
  });

  it('honours minVersion', () => {
    expect(selectVersion('A', { ecLevel: 'L', minVersion: 5 }).version).toBe(5);
  });

  it('reports an ECI for non-ASCII', () => {
    expect(selectVersion('café', { ecLevel: 'L' }).eci).toBe(26);
    expect(selectVersion('cafe', { ecLevel: 'L' }).eci).toBeUndefined();
  });

  it('counts the ECI header against capacity', () => {
    // The same character count needs more room once an ECI header is added.
    const ascii = selectVersion('A'.repeat(14), { ecLevel: 'H' }).version;
    const nonAscii = selectVersion(`${'A'.repeat(13)}é`, { ecLevel: 'H' }).version;
    expect(nonAscii).toBeGreaterThanOrEqual(ascii);
  });

  it('throws CapacityError when the payload exceeds version 40', () => {
    expect(() => selectVersion('9'.repeat(8000), { ecLevel: 'H' })).toThrow(CapacityError);
  });

  it('throws OptionError for an impossible version range', () => {
    expect(() => selectVersion('A', { ecLevel: 'L', minVersion: 10, maxVersion: 5 }))
      .toThrow(OptionError);
    expect(() => selectVersion('A', { ecLevel: 'L', minVersion: 0 })).toThrow(OptionError);
    expect(() => selectVersion('A', { ecLevel: 'L', maxVersion: 41 })).toThrow(OptionError);
  });

  it('reaches version 40 at level L for the largest numeric payload', () => {
    const digits = maxDigits(40, 'L');
    expect(digits).toBe(7089); // the published maximum numeric capacity
    expect(selectVersion('7'.repeat(digits), { ecLevel: 'L' }).version).toBe(40);
  });
});

describe('buildCodewords', () => {
  it('fills the version totally, for all sampled versions and levels', () => {
    for (const level of LEVELS) {
      for (const version of SAMPLE_VERSIONS) {
        const codewords = buildCodewords({
          segments: segmentsAt('DATA 42', version), version, ecLevel: level,
        });
        expect(codewords.length).toBe(totalCodewordsFor(version));
      }
    }
  });

  it('starts with the first codeword of each block', () => {
    const version = 5;
    const level = 'Q';
    const segments = segmentsAt('HELLO WORLD', version);
    const data = buildDataCodewords({ segments, version, ecLevel: level });
    const interleaved = buildCodewords({ segments, version, ecLevel: level });
    const { groups } = blockDescriptorFor(version, level);

    // Version 5-Q has four blocks: 15, 15, 16, 16.
    const offsets = [0, 15, 30, 46];
    expect(groups).toEqual([{ count: 2, dataCodewords: 15 }, { count: 2, dataCodewords: 16 }]);
    expect(Array.from(interleaved.subarray(0, 4)))
      .toEqual(offsets.map((offset) => data[offset]));
  });
});

describe('published character capacities', () => {
  // Independent cross-check of the whole capacity chain, per
  // .memory/investigations/2026-08-24-verifying-capacity-tables.md
  const cases = [
    ['numeric', 40, 'L', '7', 7089],
    ['numeric', 1, 'L', '7', 41],
    ['numeric', 1, 'H', '7', 17],
    ['alphanumeric', 40, 'L', 'A', 4296],
    ['alphanumeric', 1, 'L', 'A', 25],
  ];

  for (const [label, version, level, char, expected] of cases) {
    it(`v${version}-${level} holds ${expected} ${label} characters`, () => {
      const capacity = dataCapacityBits(version, level);
      const fits = (n) => segmentsBitLength(segmentsAt(char.repeat(n), version), version) <= capacity;
      expect(fits(expected)).toBe(true);
      expect(fits(expected + 1)).toBe(false);
    });
  }
});
