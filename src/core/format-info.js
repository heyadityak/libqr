/**
 * Format and version information. ISO/IEC 18004 sections 8.9 and 8.10.
 *
 * Both fields are BCH codes, chosen so that a decoder can recover them even
 * when damaged -- they are the only part of the symbol that is not itself
 * protected by Reed-Solomon.
 */
import { EC_FORMAT_BITS } from './constants.js';
import { formatInfoPositions, versionInfoPositions } from './patterns.js';

/** Generator polynomial for the BCH(15, 5) format code. */
export const FORMAT_GENERATOR = 0b101_0011_0111; // 0x537

/**
 * Fixed mask XORed into the format field.
 *
 * Without it, an all-zero format value -- level M with mask 0 -- would produce
 * 15 light modules, which a decoder cannot distinguish from an unwritten area.
 */
export const FORMAT_MASK = 0b101_0100_0001_0010; // 0x5412

/** Generator polynomial for the BCH(18, 6) version code. */
export const VERSION_GENERATOR = 0b1_1111_0010_0101; // 0x1F25

/** Lowest version that carries version information. */
export const MIN_VERSION_INFO = 7;

/**
 * The 15-bit format information field.
 *
 * Five data bits -- two for the error-correction level, three for the mask --
 * followed by ten BCH check bits, all XORed with `FORMAT_MASK`.
 *
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} mask mask pattern 0..7
 * @returns {number} 15-bit field, most significant bit first
 */
export function formatBits(ecLevel, mask) {
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | mask;

  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * FORMAT_GENERATOR);
  }

  return (((data << 10) | remainder) ^ FORMAT_MASK) & 0x7fff;
}

/**
 * The 18-bit version information field, for versions 7 and above.
 *
 * Six data bits for the version, followed by twelve BCH check bits. No XOR mask
 * here: version 0 does not exist, so an all-zero field is already impossible.
 *
 * @param {number} version symbol version 7..40
 * @returns {number} 18-bit field, most significant bit first
 */
export function versionBits(version) {
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * VERSION_GENERATOR);
  }

  return ((version << 12) | remainder) & 0x3ffff;
}

/**
 * Writes both copies of the format information into a matrix.
 *
 * @param {import('./matrix.js').Matrix} matrix matrix with reserved format areas
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @param {number} mask mask pattern 0..7
 * @returns {void}
 */
export function writeFormatInfo(matrix, ecLevel, mask) {
  const bits = formatBits(ecLevel, mask);
  const positions = formatInfoPositions(matrix.size);

  for (let i = 0; i < positions.length; i += 1) {
    // Each copy runs most significant bit first, so bit 14 leads.
    const bitIndex = 14 - (i % 15);
    const [row, col] = positions[i];
    matrix.setFunction(row, col, ((bits >>> bitIndex) & 1) === 1);
  }
}

/**
 * Writes both copies of the version information, if the version has any.
 *
 * @param {import('./matrix.js').Matrix} matrix matrix with reserved version areas
 * @returns {void}
 */
export function writeVersionInfo(matrix) {
  if (matrix.version < MIN_VERSION_INFO) return;

  const bits = versionBits(matrix.version);
  const positions = versionInfoPositions(matrix.size);

  for (let i = 0; i < positions.length; i += 1) {
    // Version information runs least significant bit first.
    const bitIndex = i % 18;
    const [row, col] = positions[i];
    matrix.setFunction(row, col, ((bits >>> bitIndex) & 1) === 1);
  }
}
