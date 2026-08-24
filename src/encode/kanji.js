/**
 * Kanji mode. ISO/IEC 18004 section 8.4.5.
 *
 * Thirteen bits per character, against byte mode's 24 for the same character in
 * UTF-8 -- so for Japanese text this is close to a 2x saving.
 *
 * Behind its own entry point (ADR-0006) and **not** imported by `core/`.
 * Importing this module registers the mode; that side effect is why the file is
 * listed in the package's `sideEffects` array.
 *
 *   import 'libqr/kanji';
 *   toSvg('漢字', { encoding: 'shift-jis' });
 *
 * The Shift-JIS mapping is derived from the platform's own decoder rather than
 * shipped as a table -- see ADR-0016. That keeps this entry point around a
 * kilobyte instead of fourteen, and takes the data from an authoritative source
 * instead of a hand-transcribed one.
 */
import { ModeError, QrError } from '../util/errors.js';
import { registerMode } from '../util/mode-registry.js';

/** Mode name used across the library. */
export const NAME = 'kanji';

/** Four-bit mode indicator. */
export const MODE_INDICATOR = 0b1000;

/** Character-count indicator width for version ranges 1-9, 10-26, 27-40. */
export const COUNT_BITS = Object.freeze([8, 10, 12]);

/** Bits per character. Fixed, unlike every other mode. */
export const BITS_PER_CHAR = 13;

/**
 * The two Shift-JIS ranges Kanji mode covers, with the offset subtracted from
 * each before packing. ISO/IEC 18004 section 8.4.5.
 */
const RANGES = Object.freeze([
  { min: 0x8140, max: 0x9ffc, offset: 0x8140 },
  { min: 0xe040, max: 0xebbf, offset: 0xc140 },
]);

/** Multiplier for the high byte when packing to 13 bits. */
const HIGH_BYTE_MULTIPLIER = 0xc0;

/** Built on first use, then cached. See ADR-0016 for why it is not shipped. */
let table = null;

/**
 * Packs a Shift-JIS value into its 13-bit Kanji-mode representation.
 *
 * @param {number} sjis two-byte Shift-JIS value
 * @param {number} offset range offset to subtract
 * @returns {number} 13-bit value
 */
function pack(sjis, offset) {
  const shifted = sjis - offset;
  return ((shifted >> 8) * HIGH_BYTE_MULTIPLIER) + (shifted & 0xff);
}

/**
 * Builds the code point to 13-bit value map from the platform's Shift-JIS
 * decoder.
 *
 * Roughly 7,000 two-byte decodes, done once and cached. Deferred to first use so
 * a page that imports this entry point but encodes nothing Japanese pays
 * nothing.
 *
 * @returns {Map<number, number>} code point to 13-bit value
 * @throws {QrError} if the platform cannot decode Shift-JIS
 */
function ensureTable() {
  if (table !== null) return table;

  let decoder;
  try {
    decoder = new TextDecoder('shift_jis', { fatal: true });
  } catch (cause) {
    throw new QrError(
      'Kanji mode needs a Shift-JIS decoder, and this platform has none. '
      + 'Browsers are required to support it; a Node build compiled with small-icu '
      + 'is not. Either use a full-icu Node build, or encode as UTF-8 byte mode '
      + `instead by omitting encoding: 'shift-jis'. (${cause?.message ?? cause})`,
    );
  }

  const built = new Map();
  const pair = new Uint8Array(2);

  for (const { min, max, offset } of RANGES) {
    for (let sjis = min; sjis <= max; sjis += 1) {
      const low = sjis & 0xff;
      // 0x7F is not a valid trail byte, and neither is anything below 0x40.
      if (low < 0x40 || low === 0x7f || low > 0xfc) continue;

      pair[0] = sjis >> 8;
      pair[1] = low;

      let decoded;
      try {
        decoded = decoder.decode(pair);
      } catch {
        continue; // unassigned in this range
      }

      // A surrogate pair would be two units; Kanji mode covers only the BMP.
      if (decoded.length !== 1) continue;

      const codePoint = decoded.codePointAt(0);
      // First mapping wins, so a character with duplicate encodings gets the
      // lower Shift-JIS value -- which is the canonical one.
      if (!built.has(codePoint)) built.set(codePoint, pack(sjis, offset));
    }
  }

  table = built;
  return table;
}

/**
 * Whether a code point can be encoded in Kanji mode.
 *
 * @param {number} codePoint Unicode code point
 * @returns {boolean} true if it has a Shift-JIS representation in range
 */
export function canEncode(codePoint) {
  return ensureTable().has(codePoint);
}

/**
 * Data bits for a run of Kanji characters, excluding indicators.
 *
 * @param {number} charCount number of characters
 * @returns {number} data bit count
 */
export function dataBitLength(charCount) {
  return BITS_PER_CHAR * charCount;
}

/**
 * Writes the data bits for a run of Kanji characters.
 *
 * @param {import('../util/bitbuffer.js').BitBuffer} buffer destination
 * @param {string} text characters that all satisfy `canEncode`
 * @returns {void}
 */
export function write(buffer, text) {
  const map = ensureTable();
  for (const char of text) {
    buffer.put(map.get(char.codePointAt(0)), BITS_PER_CHAR);
  }
}

/**
 * How many of a string's characters Kanji mode can represent.
 *
 * Lets a caller decide whether requesting Shift-JIS is worthwhile before doing
 * it, without catching an exception.
 *
 * @param {string} text text to inspect
 * @returns {number} count of encodable characters
 */
export function countEncodable(text) {
  const map = ensureTable();
  let count = 0;
  for (const char of text) {
    if (map.has(char.codePointAt(0))) count += 1;
  }
  return count;
}

/**
 * Encodes a byte-mode segment under `encoding: 'shift-jis'`.
 *
 * Byte segments alongside Kanji ones are single-byte Shift-JIS, which below 0x80
 * is identical to ASCII. Anything above that either belongs in a Kanji segment
 * or cannot be represented -- the platform gives us a Shift-JIS *decoder*
 * (ADR-0016), not an encoder, so there is no way to emit multi-byte Shift-JIS.
 *
 * This lives here rather than in `core/segment.js` so that no Shift-JIS logic --
 * and no Shift-JIS error message -- sits in the default bundle, where it would be
 * unreachable weight.
 *
 * @param {string} text characters for one byte-mode segment
 * @returns {Uint8Array} single-byte Shift-JIS bytes
 * @throws {ModeError} naming the first character that cannot be represented
 */
export function encodeBytes(text) {
  const chars = Array.from(text);
  const bytes = new Uint8Array(chars.length);

  for (let i = 0; i < chars.length; i += 1) {
    const code = chars[i].codePointAt(0);
    if (code > 0x7f) {
      throw new ModeError(
        `Cannot encode "${chars[i]}" under encoding 'shift-jis': it is neither a `
        + "Kanji-mode character nor a single-byte one. Use the default 'utf-8' "
        + 'encoding, which represents any character.',
        { mode: NAME },
      );
    }
    bytes[i] = code;
  }

  return bytes;
}

/** The encoder interface `core/mode.js` and `core/segment.js` consume. */
const encoder = Object.freeze({
  NAME,
  MODE_INDICATOR,
  COUNT_BITS,
  canEncode,
  dataBitLength,
  write,
  encodeBytes,
});

registerMode(encoder);

export { encoder };
