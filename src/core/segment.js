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
 * instead of rounding at every step.
 *
 * Kanji mode joins the candidate set only when `libqr/kanji` has been imported
 * (ADR-0006). The set is therefore built per call rather than being a module
 * constant -- that is what keeps the Shift-JIS machinery out of the default
 * bundle while still letting the optimiser use it when present.
 */
import * as alphanumeric from '../encode/alphanumeric.js';
import * as byteMode from '../encode/byte.js';
import * as numeric from '../encode/numeric.js';
import { ECI_LATIN1, ECI_UTF8 } from '../encode/eci.js';
import { assert } from '../util/assert.js';
import { ModeError } from '../util/errors.js';
import { getRegisteredMode } from '../util/mode-registry.js';
import { latin1Bytes, utf8Bytes, utf8LengthOf } from '../util/text.js';
import { Mode, countBitsFor, encoderFor } from './mode.js';

/** Always-available candidates. Byte mode sits last so it is the fallback. */
const BUILT_IN = Object.freeze([numeric, alphanumeric, byteMode]);

/** Index of byte mode within the candidate list. Fixed, since optionals append. */
const BYTE = 2;

/** Cost units per bit. Six makes 10/3 and 11/2 bits per character exact. */
const UNITS_PER_BIT = 6;

/**
 * Sample length for amortising a mode's per-character cost. Six is divisible by
 * both numeric's group of three and alphanumeric's pair, so the amortised cost
 * is exact rather than rounded.
 */
const AMORTISE_OVER = 6;

/**
 * @typedef {object} Segment
 * @property {string} mode mode name
 * @property {string} text the characters this segment covers
 * @property {number} charCount value for the character-count indicator --
 *   characters for numeric, alphanumeric and Kanji, **bytes** for byte mode
 * @property {Uint8Array} [bytes] encoded bytes, byte mode only
 */

/**
 * Candidate modes for this call: the three built-ins, plus Kanji when its entry
 * point has been imported.
 *
 * @returns {object[]} encoder namespaces, byte mode at index `BYTE`
 */
function candidates() {
  const kanji = getRegisteredMode(Mode.KANJI);
  return kanji === undefined ? BUILT_IN : [...BUILT_IN, kanji];
}

/**
 * Per-character cost in units, derived from the mode's own `dataBitLength` so
 * there are no per-mode constants to keep in step.
 */
function unitsPerChar(mode) {
  return (mode.dataBitLength(AMORTISE_OVER) * UNITS_PER_BIT) / AMORTISE_OVER;
}

/**
 * Bytes a code point occupies in a byte-mode segment, or Infinity when the
 * encoding cannot represent it at all.
 *
 * Returning Infinity is what keeps the optimiser honest. Under Shift-JIS a kanji
 * is two bytes and cannot go in a byte segment, so costing it at one byte would
 * make byte mode look cheaper than Kanji mode and route it to a path that then
 * fails. Under Latin-1 anything above 0xFF has no representation at all, and
 * substituting `?` would produce a symbol that decodes to different text than
 * was encoded -- silently.
 *
 * @param {string} encoding 'utf-8', 'latin1', or 'shift-jis'
 * @returns {(codePoint: number) => number} byte cost, or Infinity
 */
function byteLengthFor(encoding) {
  if (encoding === 'utf-8') return utf8LengthOf;
  if (encoding === 'shift-jis') {
    // Byte segments alongside Kanji ones are single-byte only.
    return (codePoint) => (codePoint > 0x7f ? Infinity : 1);
  }
  return (codePoint) => (codePoint > 0xff ? Infinity : 1);
}

/**
 * @returns {Uint8Array} text encoded under the given encoding
 *
 * Shift-JIS is delegated to the Kanji entry point, which owns everything
 * Shift-JIS specific -- keeping that logic and its error message out of the
 * default bundle, where neither is reachable.
 */
function encodeBytes(text, encoding) {
  if (encoding === 'latin1') return latin1Bytes(text).bytes;
  if (encoding === 'shift-jis') return encoderFor(Mode.KANJI).encodeBytes(text);
  return utf8Bytes(text);
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

/**
 * Cost in units of encoding one code point in one mode, or Infinity if that mode
 * cannot represent it.
 */
function charUnits(modes, index, perChar, codePoint, byteLength) {
  if (index === BYTE) return byteLength(codePoint) * 8 * UNITS_PER_BIT;
  return modes[index].canEncode(codePoint) ? perChar[index] : Infinity;
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
 * @param {string} [options.encoding] 'utf-8', 'latin1', or 'shift-jis'; the last
 *   requires the Kanji entry point and throws a ModeError without it
 * @returns {Segment[]} segments in payload order; empty for empty input
 * @throws {ModeError} if the encoding needs an unloaded mode, or a character
 *   cannot be represented under it
 */
export function makeSegments(text, { rangeIndex, encoding = 'utf-8' }) {
  requireEncodingSupport(encoding);

  const chars = Array.from(text);
  if (chars.length === 0) return [];

  const modes = candidates();
  const perChar = modes.map(unitsPerChar);
  const codePoints = chars.map((char) => char.codePointAt(0));
  const byteLength = byteLengthFor(encoding);
  const headUnits = modes.map((mode) => (4 + mode.COUNT_BITS[rangeIndex]) * UNITS_PER_BIT);

  // predecessor[i][k] = mode used at character i - 1, given character i is in mode k.
  const predecessor = new Array(codePoints.length);
  let prevCosts = headUnits.slice();

  for (let i = 0; i < codePoints.length; i += 1) {
    const costs = new Array(modes.length).fill(Infinity);
    const from = new Array(modes.length).fill(-1);

    for (let k = 0; k < modes.length; k += 1) {
      const cost = charUnits(modes, k, perChar, codePoints[i], byteLength);
      if (cost === Infinity) continue;

      // Staying in mode k. Cheaper than any switch, since a switch also pays a
      // header, so this is tried first and strict comparison keeps it.
      if (prevCosts[k] !== Infinity) {
        costs[k] = prevCosts[k] + cost;
        from[k] = k;
      }

      // Switching into mode k. The previous segment's bit count is rounded up
      // to a whole bit before the new header, because segments do not share
      // partial bits.
      for (let j = 0; j < modes.length; j += 1) {
        if (prevCosts[j] === Infinity) continue;
        const candidate = Math.ceil(prevCosts[j] / UNITS_PER_BIT) * UNITS_PER_BIT
          + headUnits[k] + cost;
        if (candidate < costs[k]) {
          costs[k] = candidate;
          from[k] = j;
        }
      }
    }

    // Every mode reported Infinity, so no segmentation exists. Fail here, where
    // the offending character is still in hand, rather than letting an internal
    // invariant trip later with nothing useful to say.
    if (from.every((source) => source === -1)) {
      throw new ModeError(
        `Cannot encode "${chars[i]}" under encoding '${encoding}': no mode can represent it. `
        + "Use the default 'utf-8' encoding, which represents any character.",
        { mode: byteMode.NAME },
      );
    }

    predecessor[i] = from;
    prevCosts = costs;
  }

  // Byte mode encodes anything, so at least one finite path always exists.
  let best = BYTE;
  for (let k = 0; k < modes.length; k += 1) {
    if (prevCosts[k] < prevCosts[best]) best = k;
  }
  assert(prevCosts[best] !== Infinity, 'no viable segmentation; byte mode should always apply');

  const modeAt = new Array(codePoints.length);
  let cursor = best;
  for (let i = codePoints.length - 1; i >= 0; i -= 1) {
    modeAt[i] = cursor;
    cursor = predecessor[i][cursor];
  }

  return groupRuns(chars, modeAt, modes, encoding);
}

/** Collapses per-character mode choices into segments. */
function groupRuns(chars, modeAt, modes, encoding) {
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
        mode: modes[modeIndex].NAME,
        text: runText,
        charCount: Array.from(runText).length,
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
    const encoder = encoderFor(segment.mode);
    bits += 4 + countBitsFor(segment.mode, version) + encoder.dataBitLength(segment.charCount);
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
    const encoder = encoderFor(segment.mode);
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
 * Shift-JIS needs none either: Kanji mode carries its own character set in the
 * mode indicator, and its byte-mode segments are single-byte ASCII.
 *
 * @param {string} text payload
 * @param {string} [encoding] 'utf-8', 'latin1', or 'shift-jis'
 * @returns {number|undefined} ECI number, or undefined if none is needed
 */
export function eciFor(text, encoding = 'utf-8') {
  if (encoding === 'shift-jis') return undefined;

  for (const char of text) {
    if (char.codePointAt(0) > 0x7f) {
      return encoding === 'latin1' ? ECI_LATIN1 : ECI_UTF8;
    }
  }
  return undefined;
}
