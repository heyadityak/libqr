/**
 * Segment model and optimal mode segmentation.
 *
 * A QR payload is a sequence of segments, each in one mode. Choosing where to
 * switch modes is a real optimisation: numeric mode costs 3 1/3 bits per digit
 * against byte mode's 8, but every switch pays a mode indicator plus a
 * character-count indicator. Greedy switching loses to byte mode on short digit
 * runs, and never switching loses badly on long ones.
 *
 * The solution here is exact rather than heuristic: a dynamic program over
 * (position, mode) with costs in sixths of a bit, so that numeric's 10-bits-per-
 * 3-digits and alphanumeric's 11-bits-per-2-characters are both exact integers
 * (20 and 33 sixths respectively) instead of rounding at every step.
 */
import * as alphanumeric from '../encode/alphanumeric.js';
import * as byteMode from '../encode/byte.js';
import * as numeric from '../encode/numeric.js';
import { ECI_LATIN1, ECI_UTF8 } from '../encode/eci.js';
import { assert } from '../util/assert.js';
import { latin1Bytes, utf8Bytes, utf8LengthOf } from '../util/text.js';
import { Mode, countBitsFor, encoderFor } from './mode.js';

/** Candidate modes, indexed by the dynamic program. Order is cheapest-first. */
const CANDIDATES = [numeric, alphanumeric, byteMode];

const NUMERIC = 0;
const ALPHANUMERIC = 1;
const BYTE = 2;

/** Cost units per bit. Six makes 10/3 and 11/2 bits per character exact. */
const UNITS_PER_BIT = 6;

const NUMERIC_UNITS = (10 / 3) * UNITS_PER_BIT; // 20
const ALPHANUMERIC_UNITS = (11 / 2) * UNITS_PER_BIT; // 33

/**
 * @typedef {object} Segment
 * @property {string} mode mode name
 * @property {string} text the characters this segment covers
 * @property {number} charCount value for the character-count indicator --
 *   characters for numeric and alphanumeric, **bytes** for byte mode
 * @property {Uint8Array} [bytes] encoded bytes, byte mode only
 */

/** @returns {(codePoint: number) => number} bytes a code point occupies */
function byteLengthFor(encoding) {
  return encoding === 'latin1' ? () => 1 : utf8LengthOf;
}

/**
 * Fails loudly if the requested encoding needs a mode that is not loaded.
 *
 * Without this, `encoding: 'shift-jis'` fell through to the UTF-8 byte-length
 * path and silently produced a UTF-8 symbol -- the caller asked for one
 * character set and got another, with no error. Exactly the silent-wrong-output
 * failure ADR-0009 exists to prevent.
 */
function requireEncodingSupport(encoding) {
  if (encoding === 'shift-jis') {
    // Throws a ModeError naming the entry point to import (ADR-0006).
    encoderFor(Mode.KANJI);
  }
}

/** @returns {Uint8Array} text encoded under the given encoding */
function encodeBytes(text, encoding) {
  return encoding === 'latin1' ? latin1Bytes(text).bytes : utf8Bytes(text);
}

/**
 * Cost in units of encoding one code point in one mode, or Infinity if that
 * mode cannot represent it.
 */
function charUnits(modeIndex, codePoint, byteLength) {
  if (modeIndex === NUMERIC) {
    return numeric.canEncode(codePoint) ? NUMERIC_UNITS : Infinity;
  }
  if (modeIndex === ALPHANUMERIC) {
    return alphanumeric.canEncode(codePoint) ? ALPHANUMERIC_UNITS : Infinity;
  }
  return byteLength(codePoint) * 8 * UNITS_PER_BIT;
}

/**
 * Splits text into segments that minimise total encoded bits.
 *
 * Segmentation depends on the version range, because the character-count
 * indicator widths do -- a switch that pays for itself at version 1 may not at
 * version 27. Callers that are still choosing a version should segment once per
 * range and compare.
 *
 * @param {string} text payload
 * @param {object} options
 * @param {number} options.rangeIndex 0 for versions 1-9, 1 for 10-26, 2 for 27-40
 * @param {string} [options.encoding] 'utf-8' or 'latin1'; 'shift-jis' requires
 *   the Kanji entry point and throws a ModeError without it
 * @returns {Segment[]} segments in payload order; empty for empty input
 * @throws {import('../util/errors.js').ModeError} if the encoding needs an
 *   unloaded mode
 */
export function makeSegments(text, { rangeIndex, encoding = 'utf-8' }) {
  requireEncodingSupport(encoding);

  const chars = Array.from(text);
  if (chars.length === 0) return [];

  const codePoints = chars.map((char) => char.codePointAt(0));
  const byteLength = byteLengthFor(encoding);
  const headUnits = CANDIDATES.map((mode) => (4 + mode.COUNT_BITS[rangeIndex]) * UNITS_PER_BIT);

  // predecessor[i][k] = mode used at character i - 1, given character i is in mode k.
  const predecessor = new Array(codePoints.length);
  let prevCosts = headUnits.slice();

  for (let i = 0; i < codePoints.length; i += 1) {
    const costs = [Infinity, Infinity, Infinity];
    const from = [-1, -1, -1];

    for (let k = 0; k < CANDIDATES.length; k += 1) {
      const perChar = charUnits(k, codePoints[i], byteLength);
      if (perChar === Infinity) continue;

      // Staying in mode k. Cheaper than any switch, since a switch also pays a
      // header, so this is tried first and strict comparison keeps it.
      if (prevCosts[k] !== Infinity) {
        costs[k] = prevCosts[k] + perChar;
        from[k] = k;
      }

      // Switching into mode k. The previous segment's bit count is rounded up
      // to a whole bit before the new header, because segments do not share
      // partial bits.
      for (let j = 0; j < CANDIDATES.length; j += 1) {
        if (prevCosts[j] === Infinity) continue;
        const candidate = Math.ceil(prevCosts[j] / UNITS_PER_BIT) * UNITS_PER_BIT
          + headUnits[k] + perChar;
        if (candidate < costs[k]) {
          costs[k] = candidate;
          from[k] = j;
        }
      }
    }

    predecessor[i] = from;
    prevCosts = costs;
  }

  // Byte mode encodes anything, so at least one finite path always exists.
  let best = BYTE;
  for (let k = 0; k < CANDIDATES.length; k += 1) {
    if (prevCosts[k] < prevCosts[best]) best = k;
  }
  assert(prevCosts[best] !== Infinity, 'no viable segmentation; byte mode should always apply');

  const modeAt = new Array(codePoints.length);
  let cursor = best;
  for (let i = codePoints.length - 1; i >= 0; i -= 1) {
    modeAt[i] = cursor;
    cursor = predecessor[i][cursor];
  }

  return groupRuns(chars, modeAt, encoding);
}

/** Collapses per-character mode choices into segments. */
function groupRuns(chars, modeAt, encoding) {
  const segments = [];
  let start = 0;

  for (let i = 1; i <= modeAt.length; i += 1) {
    if (i < modeAt.length && modeAt[i] === modeAt[start]) continue;

    const modeIndex = modeAt[start];
    const runText = chars.slice(start, i).join('');

    if (modeIndex === BYTE) {
      const bytes = encodeBytes(runText, encoding);
      segments.push({ mode: byteMode.NAME, text: runText, charCount: bytes.length, bytes });
    } else {
      segments.push({
        mode: CANDIDATES[modeIndex].NAME,
        text: runText,
        charCount: runText.length,
      });
    }

    start = i;
  }

  return segments;
}

/**
 * Total bits the segments occupy at a version, indicators included.
 *
 * @param {Segment[]} segments segments to measure
 * @param {number} version symbol version 1..40
 * @returns {number} bit count, excluding any ECI header and terminator
 */
export function segmentsBitLength(segments, version) {
  let bits = 0;
  for (const segment of segments) {
    const encoder = CANDIDATES.find((mode) => mode.NAME === segment.mode);
    const dataBits = encoder === undefined
      ? byteMode.dataBitLength(segment.charCount)
      : encoder.dataBitLength(segment.charCount);
    bits += 4 + countBitsFor(segment.mode, version) + dataBits;
  }
  return bits;
}

/**
 * Writes every segment into the buffer: mode indicator, character count, data.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {Segment[]} segments segments to write
 * @param {number} version symbol version 1..40
 * @returns {void}
 */
export function writeSegments(buffer, segments, version) {
  for (const segment of segments) {
    const encoder = CANDIDATES.find((mode) => mode.NAME === segment.mode);
    assert(encoder !== undefined, `no encoder for mode "${segment.mode}"`);

    const countBits = countBitsFor(segment.mode, version);
    assert(
      segment.charCount < 2 ** countBits,
      `character count ${segment.charCount} does not fit ${countBits} bits at version ${version}`,
    );

    buffer.put(encoder.MODE_INDICATOR, 4);
    buffer.put(segment.charCount, countBits);
    if (segment.mode === byteMode.NAME) {
      encoder.write(buffer, segment.bytes);
    } else {
      encoder.write(buffer, segment.text);
    }
  }
}

/**
 * ECI assignment number the payload needs, if any.
 *
 * Pure ASCII needs no designator: every decoder reads it the same way. Anything
 * beyond ASCII does, because a decoder's default character set is
 * reader-dependent.
 *
 * @param {string} text payload
 * @param {string} [encoding] 'utf-8' or 'latin1'
 * @returns {number|undefined} ECI number, or undefined if none is needed
 */
export function eciFor(text, encoding = 'utf-8') {
  for (const char of text) {
    if (char.codePointAt(0) > 0x7f) {
      return encoding === 'latin1' ? ECI_LATIN1 : ECI_UTF8;
    }
  }
  return undefined;
}
