/**
 * Block splitting, error correction, and codeword interleaving.
 * ISO/IEC 18004 section 8.6.
 *
 * Per ADR-0012 this module holds no version or EC-level tables. It takes a
 * block descriptor and does arithmetic, which is what makes it testable against
 * hand-written descriptors -- including shapes no real version uses.
 */
import { computeEcc } from './reed-solomon.js';

/**
 * @typedef {object} BlockGroup
 * @property {number} count how many blocks in this group
 * @property {number} dataCodewords data codewords per block in this group
 */

/**
 * @typedef {object} BlockDescriptor
 * @property {BlockGroup[]} groups block groups, shorter blocks first
 * @property {number} ecCodewordsPerBlock error-correction codewords per block,
 *   the same for every block regardless of group
 */

/**
 * Splits data codewords into blocks and computes error correction for each.
 *
 * Shorter blocks come first, which is the order the spec interleaves in.
 *
 * @param {Uint8Array} data all data codewords, in payload order
 * @param {BlockDescriptor} descriptor block structure for the target version and level
 * @returns {{dataBlocks: Uint8Array[], ecBlocks: Uint8Array[]}} per-block data and
 *   error-correction codewords, index-aligned
 */
export function buildBlocks(data, descriptor) {
  const dataBlocks = [];
  const ecBlocks = [];

  let offset = 0;
  for (const group of descriptor.groups) {
    for (let i = 0; i < group.count; i += 1) {
      const block = data.subarray(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(computeEcc(block, descriptor.ecCodewordsPerBlock));
    }
  }

  return { dataBlocks, ecBlocks };
}

/**
 * Interleaves blocks into the final codeword sequence.
 *
 * Data first, taking codeword *i* from every block in turn before moving to
 * *i + 1*; blocks that have run out are skipped, which is why short blocks come
 * first. Error-correction codewords follow, interleaved the same way. This
 * spreading is what lets a burst of damage be spread across blocks rather than
 * destroying one block entirely.
 *
 * @param {Uint8Array[]} dataBlocks per-block data codewords
 * @param {Uint8Array[]} ecBlocks per-block error-correction codewords
 * @returns {Uint8Array} interleaved codeword sequence
 */
export function interleave(dataBlocks, ecBlocks) {
  let total = 0;
  let longestData = 0;
  for (const block of dataBlocks) {
    total += block.length;
    if (block.length > longestData) longestData = block.length;
  }
  let longestEc = 0;
  for (const block of ecBlocks) {
    total += block.length;
    if (block.length > longestEc) longestEc = block.length;
  }

  const result = new Uint8Array(total);
  let at = 0;

  for (let i = 0; i < longestData; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result[at++] = block[i];
    }
  }
  for (let i = 0; i < longestEc; i += 1) {
    for (const block of ecBlocks) {
      if (i < block.length) result[at++] = block[i];
    }
  }

  return result;
}

/**
 * Data codewords, error correction, and interleaving in one step.
 *
 * @param {Uint8Array} data all data codewords, in payload order
 * @param {BlockDescriptor} descriptor block structure for the target version and level
 * @returns {Uint8Array} final codeword sequence, ready for matrix placement
 */
export function encodeBlocks(data, descriptor) {
  const { dataBlocks, ecBlocks } = buildBlocks(data, descriptor);
  return interleave(dataBlocks, ecBlocks);
}
