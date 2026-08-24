/**
 * Version selection, capacity arithmetic, and final codeword assembly.
 *
 * This module owns the version-indexed tables, and hands `ec/` a descriptor
 * rather than letting it read them (ADR-0012).
 */
import { encodeBlocks } from '../ec/blocks.js';
import { bitLength as eciBitLength, write as writeEci } from '../encode/eci.js';
import { BitBuffer } from '../util/bitbuffer.js';
import { CapacityError, OptionError } from '../util/errors.js';
import {
  DATA_CODEWORDS,
  ECC_PER_BLOCK,
  EC_BLOCKS,
  MAX_VERSION,
  MIN_VERSION,
  TOTAL_CODEWORDS,
} from './constants.js';
import { versionRangeIndex } from './mode.js';
import { eciFor, makeSegments, segmentsBitLength, writeSegments } from './segment.js';

/** Alternating pad codewords appended after the terminator. ISO/IEC 18004 section 8.4.9. */
const PAD_CODEWORDS = Object.freeze([0xec, 0x11]);

/** Terminator length in bits, truncated when the symbol has less room left. */
const TERMINATOR_BITS = 4;

/**
 * Data codewords available at a version and error-correction level.
 *
 * @param {number} version symbol version 1..40
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @returns {number} data codeword count
 */
export function dataCodewordsFor(version, ecLevel) {
  return DATA_CODEWORDS[ecLevel][version - 1];
}

/**
 * Data capacity in bits at a version and error-correction level.
 *
 * @param {number} version symbol version 1..40
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @returns {number} bit capacity
 */
export function dataCapacityBits(version, ecLevel) {
  return dataCodewordsFor(version, ecLevel) * 8;
}

/**
 * Block structure for a version and error-correction level.
 *
 * The split follows from three published numbers -- total codewords, blocks, and
 * error-correction codewords per block -- rather than being a fourth table.
 * Shorter blocks come first, which is the order interleaving expects.
 *
 * @param {number} version symbol version 1..40
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @returns {import('../ec/blocks.js').BlockDescriptor} descriptor for `ec/blocks.js`
 */
export function blockDescriptorFor(version, ecLevel) {
  const blocks = EC_BLOCKS[ecLevel][version - 1];
  const ecCodewordsPerBlock = ECC_PER_BLOCK[ecLevel][version - 1];
  const totalData = dataCodewordsFor(version, ecLevel);

  const shortLength = Math.floor(totalData / blocks);
  const longBlocks = totalData % blocks;
  const shortBlocks = blocks - longBlocks;

  const groups = [{ count: shortBlocks, dataCodewords: shortLength }];
  if (longBlocks > 0) {
    groups.push({ count: longBlocks, dataCodewords: shortLength + 1 });
  }

  return { groups, ecCodewordsPerBlock };
}

/**
 * Smallest version that fits the payload, with the segmentation chosen for it.
 *
 * Segmentation and version selection are mutually dependent: count-indicator
 * widths change at versions 10 and 27, which changes the optimal segmentation,
 * which changes the size. Resolved by re-segmenting once per version range
 * rather than once per version.
 *
 * @param {string} text payload
 * @param {object} options
 * @param {string} options.ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} [options.minVersion] lowest version to consider
 * @param {number} [options.maxVersion] highest version to consider
 * @param {string} [options.encoding] 'utf-8' or 'latin1'
 * @returns {{version: number, segments: import('./segment.js').Segment[], eci: number|undefined}}
 * @throws {CapacityError} if the payload does not fit `maxVersion`
 * @throws {OptionError} if the version bounds are invalid
 */
export function selectVersion(text, {
  ecLevel,
  minVersion = MIN_VERSION,
  maxVersion = MAX_VERSION,
  encoding = 'utf-8',
}) {
  if (minVersion < MIN_VERSION || maxVersion > MAX_VERSION || minVersion > maxVersion) {
    throw new OptionError(
      `Invalid version range ${minVersion}..${maxVersion}; must be within ${MIN_VERSION}..${MAX_VERSION}`,
      { option: 'version', value: [minVersion, maxVersion] },
    );
  }

  const eci = eciFor(text, encoding);
  const eciBits = eci === undefined ? 0 : eciBitLength(eci);

  let cachedRange = -1;
  let segments = [];
  let lastNeeded = 0;

  for (let version = minVersion; version <= maxVersion; version += 1) {
    const range = versionRangeIndex(version);
    if (range !== cachedRange) {
      segments = makeSegments(text, { rangeIndex: range, encoding });
      cachedRange = range;
    }

    lastNeeded = eciBits + segmentsBitLength(segments, version);
    if (lastNeeded <= dataCapacityBits(version, ecLevel)) {
      return { version, segments, eci };
    }
  }

  throw new CapacityError({
    needed: lastNeeded,
    available: dataCapacityBits(maxVersion, ecLevel),
    version: maxVersion,
    ecLevel,
  });
}

/**
 * Assembles the data codewords for a symbol: ECI header, segments, terminator,
 * byte alignment, then alternating pad codewords.
 *
 * The terminator is **truncated, not omitted**, when fewer than four bits
 * remain. Skipping it entirely at exact capacity is a spec violation that only
 * shows up on inputs that happen to fill a symbol precisely, so exact-capacity
 * inputs are a required test case (AGENTS.md section 6).
 *
 * @param {object} input
 * @param {import('./segment.js').Segment[]} input.segments segments to encode
 * @param {number} input.version symbol version 1..40
 * @param {string} input.ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} [input.eci] ECI assignment number to declare first
 * @returns {Uint8Array} data codewords, exactly `dataCodewordsFor(version, ecLevel)` long
 * @throws {CapacityError} if the segments do not fit
 */
export function buildDataCodewords({ segments, version, ecLevel, eci }) {
  const capacityBits = dataCapacityBits(version, ecLevel);
  const buffer = new BitBuffer(dataCodewordsFor(version, ecLevel));

  if (eci !== undefined) writeEci(buffer, eci);
  writeSegments(buffer, segments, version);

  if (buffer.bitLength > capacityBits) {
    throw new CapacityError({
      needed: buffer.bitLength,
      available: capacityBits,
      version,
      ecLevel,
    });
  }

  const terminator = Math.min(TERMINATOR_BITS, capacityBits - buffer.bitLength);
  buffer.put(0, terminator);
  buffer.padToByteBoundary();

  const codewords = new Uint8Array(dataCodewordsFor(version, ecLevel));
  codewords.set(buffer.toBytes());
  for (let i = buffer.byteLength; i < codewords.length; i += 1) {
    codewords[i] = PAD_CODEWORDS[(i - buffer.byteLength) % PAD_CODEWORDS.length];
  }

  return codewords;
}

/**
 * Full codeword sequence for a symbol, error correction included and
 * interleaved, ready for matrix placement.
 *
 * @param {object} input
 * @param {import('./segment.js').Segment[]} input.segments segments to encode
 * @param {number} input.version symbol version 1..40
 * @param {string} input.ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} [input.eci] ECI assignment number to declare first
 * @returns {Uint8Array} interleaved codewords, `TOTAL_CODEWORDS[version]` long
 */
export function buildCodewords({ segments, version, ecLevel, eci }) {
  const data = buildDataCodewords({ segments, version, ecLevel, eci });
  return encodeBlocks(data, blockDescriptorFor(version, ecLevel));
}

/**
 * Total codewords a version carries, data and error correction combined.
 *
 * @param {number} version symbol version 1..40
 * @returns {number} codeword count
 */
export function totalCodewordsFor(version) {
  return TOTAL_CODEWORDS[version];
}
