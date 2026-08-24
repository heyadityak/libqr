/**
 * M4 gate (ADR-0011): the interleaving order.
 *
 * Per ADR-0012 this module takes a descriptor, so the tests use hand-written
 * ones and import nothing from core/.
 */
import { describe, expect, it } from 'vitest';
import { buildBlocks, encodeBlocks, interleave } from '../../../src/ec/blocks.js';
import { computeEcc } from '../../../src/ec/reed-solomon.js';

describe('interleave order', () => {
  it('takes codeword i from every block before moving to i + 1', () => {
    const data = [
      Uint8Array.of(1, 2, 3),
      Uint8Array.of(4, 5, 6),
    ];
    expect(Array.from(interleave(data, []))).toEqual([1, 4, 2, 5, 3, 6]);
  });

  it('skips blocks that have run out, so short blocks must come first', () => {
    const data = [
      Uint8Array.of(1, 2, 3),
      Uint8Array.of(4, 5, 6),
      Uint8Array.of(7, 8, 9, 10),
    ];
    expect(Array.from(interleave(data, []))).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9, 10]);
  });

  it('places all data before any error correction', () => {
    const data = [Uint8Array.of(1, 2), Uint8Array.of(3, 4)];
    const ec = [Uint8Array.of(9, 8), Uint8Array.of(7, 6)];
    expect(Array.from(interleave(data, ec))).toEqual([1, 3, 2, 4, 9, 7, 8, 6]);
  });

  it('interleaves the version 5-Q block shape correctly', () => {
    // Two 15-codeword blocks then two 16-codeword blocks, the real shape for
    // version 5 at level Q. Values are the published worked example.
    const data = [
      Uint8Array.of(67, 85, 70, 134, 87, 38, 85, 194, 119, 50, 6, 18, 6, 103, 38),
      Uint8Array.of(246, 246, 66, 7, 118, 134, 242, 7, 38, 86, 22, 198, 199, 146, 6),
      Uint8Array.of(182, 230, 247, 119, 50, 7, 118, 134, 87, 38, 82, 6, 134, 151, 50, 7),
      Uint8Array.of(70, 247, 118, 86, 194, 6, 151, 50, 16, 236, 17, 236, 17, 236, 17, 236),
    ];

    const result = interleave(data, []);
    expect(Array.from(result.subarray(0, 12)))
      .toEqual([67, 246, 182, 70, 85, 246, 230, 247, 70, 66, 247, 118]);

    // The last data round has only the two 16-codeword blocks left.
    expect(Array.from(result.subarray(result.length - 2))).toEqual([7, 236]);
    expect(result.length).toBe(15 + 15 + 16 + 16);
  });

  it('produces a sequence as long as all its inputs combined', () => {
    const data = [new Uint8Array(15), new Uint8Array(16), new Uint8Array(16)];
    const ec = [new Uint8Array(18), new Uint8Array(18), new Uint8Array(18)];
    expect(interleave(data, ec).length).toBe(15 + 16 + 16 + 54);
  });
});

describe('buildBlocks', () => {
  const descriptor = {
    groups: [{ count: 2, dataCodewords: 3 }, { count: 1, dataCodewords: 4 }],
    ecCodewordsPerBlock: 7,
  };

  it('splits in descriptor order, shorter groups first', () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const { dataBlocks } = buildBlocks(data, descriptor);
    expect(dataBlocks.map((b) => Array.from(b))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9, 10],
    ]);
  });

  it('gives every block the same number of error-correction codewords', () => {
    const { ecBlocks } = buildBlocks(new Uint8Array(10), descriptor);
    expect(ecBlocks.map((b) => b.length)).toEqual([7, 7, 7]);
  });

  it('computes error correction per block, not across the whole payload', () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const { dataBlocks, ecBlocks } = buildBlocks(data, descriptor);
    for (let i = 0; i < dataBlocks.length; i += 1) {
      expect(Array.from(ecBlocks[i])).toEqual(Array.from(computeEcc(dataBlocks[i], 7)));
    }
  });

  it('handles a single block', () => {
    const single = { groups: [{ count: 1, dataCodewords: 4 }], ecCodewordsPerBlock: 10 };
    const { dataBlocks, ecBlocks } = buildBlocks(Uint8Array.of(1, 2, 3, 4), single);
    expect(dataBlocks.length).toBe(1);
    expect(ecBlocks[0].length).toBe(10);
  });
});

describe('encodeBlocks', () => {
  it('is buildBlocks followed by interleave', () => {
    const descriptor = {
      groups: [{ count: 2, dataCodewords: 4 }],
      ecCodewordsPerBlock: 10,
    };
    const data = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const { dataBlocks, ecBlocks } = buildBlocks(data, descriptor);
    expect(Array.from(encodeBlocks(data, descriptor)))
      .toEqual(Array.from(interleave(dataBlocks, ecBlocks)));
  });

  it('returns data codewords plus error correction codewords', () => {
    const descriptor = {
      groups: [{ count: 2, dataCodewords: 15 }, { count: 2, dataCodewords: 16 }],
      ecCodewordsPerBlock: 18,
    };
    expect(encodeBlocks(new Uint8Array(62), descriptor).length).toBe(62 + 4 * 18);
  });
});
