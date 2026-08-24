/**
 * M1 gate (ADR-0011): the generated tables are spot-checked against figures
 * published in ISO/IEC 18004, not against the generator's own arithmetic. A
 * generator that is self-consistently wrong has to fail here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALIGNMENT_CENTRES,
  DATA_CODEWORDS,
  ECC_PER_BLOCK,
  EC_BLOCKS,
  EC_FORMAT_BITS,
  EC_LEVELS,
  MAX_VERSION,
  MIN_VERSION,
  TOTAL_CODEWORDS,
  sizeForVersion,
} from '../../../src/core/constants.js';
import { CONSTANTS_PATH, buildConstants } from '../../../scripts/gen-tables.js';

describe('ADR-0007: the committed file matches the generator', () => {
  it('regenerating in memory produces the committed bytes', () => {
    expect(buildConstants()).toBe(readFileSync(CONSTANTS_PATH, 'utf8'));
  });
});

describe('symbol geometry', () => {
  it('spans versions 1 to 40', () => {
    expect(MIN_VERSION).toBe(1);
    expect(MAX_VERSION).toBe(40);
  });

  it('side length is 4V + 17', () => {
    expect(sizeForVersion(1)).toBe(21);
    expect(sizeForVersion(7)).toBe(45);
    expect(sizeForVersion(40)).toBe(177);
  });
});

describe('total codewords per version', () => {
  // ISO/IEC 18004 Table 1.
  const known = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 10: 346, 20: 1085, 26: 1706, 27: 1828, 40: 3706 };

  for (const [version, expected] of Object.entries(known)) {
    it(`v${version} has ${expected} codewords`, () => {
      expect(TOTAL_CODEWORDS[Number(version)]).toBe(expected);
    });
  }

  it('increases monotonically', () => {
    for (let v = 2; v <= MAX_VERSION; v += 1) {
      expect(TOTAL_CODEWORDS[v]).toBeGreaterThan(TOTAL_CODEWORDS[v - 1]);
    }
  });
});

describe('data codewords per version and level', () => {
  // ISO/IEC 18004 Table 7. The ADR-0011 M1 gate names v1-M = 16 and v40-L = 2956.
  const known = {
    1: { L: 19, M: 16, Q: 13, H: 9 },
    2: { L: 34, M: 28, Q: 22, H: 16 },
    3: { L: 55, M: 44, Q: 34, H: 26 },
    4: { L: 80, M: 64, Q: 48, H: 36 },
    5: { L: 108, M: 86, Q: 62, H: 46 },
    6: { L: 136, M: 108, Q: 76, H: 60 },
    7: { L: 156, M: 124, Q: 88, H: 66 },
    10: { L: 274, M: 216, Q: 154, H: 122 },
    // v26/v27 straddle the character-count-indicator width change. Each value
    // below was cross-checked against the published numeric capacity for that
    // combination, not taken from this library's own tables --
    // see .memory/investigations/2026-08-24-verifying-capacity-tables.md
    26: { L: 1370, M: 1062, Q: 754, H: 596 },
    27: { L: 1468, M: 1128, Q: 808, H: 628 },
    40: { L: 2956, M: 2334, Q: 1666, H: 1276 },
  };

  for (const [version, perLevel] of Object.entries(known)) {
    for (const [level, expected] of Object.entries(perLevel)) {
      it(`v${version}-${level} has ${expected} data codewords`, () => {
        expect(DATA_CODEWORDS[level][Number(version) - 1]).toBe(expected);
      });
    }
  }

  it('data + error correction equals the total, for all 160 combinations', () => {
    for (const level of EC_LEVELS) {
      for (let v = 1; v <= MAX_VERSION; v += 1) {
        const ecc = EC_BLOCKS[level][v - 1] * ECC_PER_BLOCK[level][v - 1];
        expect(DATA_CODEWORDS[level][v - 1] + ecc).toBe(TOTAL_CODEWORDS[v]);
      }
    }
  });

  it('stronger levels never carry more data than weaker ones', () => {
    for (let v = 1; v <= MAX_VERSION; v += 1) {
      const [l, m, q, h] = EC_LEVELS.map((level) => DATA_CODEWORDS[level][v - 1]);
      expect(l).toBeGreaterThan(m);
      expect(m).toBeGreaterThan(q);
      expect(q).toBeGreaterThan(h);
    }
  });

  it('every block split leaves at least one data codeword per block', () => {
    for (const level of EC_LEVELS) {
      for (let v = 1; v <= MAX_VERSION; v += 1) {
        const blocks = EC_BLOCKS[level][v - 1];
        expect(Math.floor(DATA_CODEWORDS[level][v - 1] / blocks)).toBeGreaterThan(0);
      }
    }
  });
});

describe('EC level format bits', () => {
  // ISO/IEC 18004 Table 12. Deliberately not in level order -- AGENTS.md section 11.
  it('are L=01, M=00, Q=11, H=10', () => {
    expect(EC_FORMAT_BITS.L).toBe(0b01);
    expect(EC_FORMAT_BITS.M).toBe(0b00);
    expect(EC_FORMAT_BITS.Q).toBe(0b11);
    expect(EC_FORMAT_BITS.H).toBe(0b10);
  });

  it('are not simply the level index', () => {
    // If someone "simplifies" this to EC_LEVELS.indexOf(level), this fails.
    expect(EC_FORMAT_BITS.L).not.toBe(EC_LEVELS.indexOf('L'));
    expect(EC_FORMAT_BITS.M).not.toBe(EC_LEVELS.indexOf('M'));
  });
});

describe('alignment pattern centres', () => {
  // ISO/IEC 18004 Annex E.
  const known = {
    1: [],
    2: [6, 18],
    6: [6, 34],
    7: [6, 22, 38],
    14: [6, 26, 46, 66],
    21: [6, 28, 50, 72, 94],
    32: [6, 34, 60, 86, 112, 138],
    40: [6, 30, 58, 86, 114, 142, 170],
  };

  for (const [version, expected] of Object.entries(known)) {
    it(`v${version} centres are [${expected.join(', ')}]`, () => {
      expect(ALIGNMENT_CENTRES[Number(version)]).toEqual(expected);
    });
  }

  it('always starts at 6 and ends 7 modules from the far edge', () => {
    for (let v = 2; v <= MAX_VERSION; v += 1) {
      const centres = ALIGNMENT_CENTRES[v];
      expect(centres[0]).toBe(6);
      expect(centres[centres.length - 1]).toBe(sizeForVersion(v) - 7);
    }
  });

  it('is strictly ascending with every centre inside the symbol', () => {
    for (let v = 2; v <= MAX_VERSION; v += 1) {
      const centres = ALIGNMENT_CENTRES[v];
      for (let i = 1; i < centres.length; i += 1) {
        expect(centres[i]).toBeGreaterThan(centres[i - 1]);
      }
      expect(centres[centres.length - 1]).toBeLessThan(sizeForVersion(v) - 2);
    }
  });

  it('has count floor(V/7) + 2 for V >= 2', () => {
    for (let v = 2; v <= MAX_VERSION; v += 1) {
      expect(ALIGNMENT_CENTRES[v].length).toBe(Math.floor(v / 7) + 2);
    }
  });
});
