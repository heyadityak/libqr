/**
 * The encoding orchestrator: text in, finished matrix out.
 *
 * Everything below this point is pure arithmetic (ADR-0004) -- nothing here
 * knows about pixels, colours, or the DOM. The returned matrix is the boundary
 * between encoding and rendering.
 */
import { normalizeOptions } from '../util/options.js';
import { Matrix, placeCodewords } from './matrix.js';
import { chooseMask } from './mask.js';
import { placeFunctionPatterns } from './patterns.js';
import { buildCodewords, selectVersion } from './version.js';

/**
 * @typedef {object} QrResult
 * @property {Matrix} matrix finished symbol, function patterns and mask applied
 * @property {number} version symbol version 1..40
 * @property {string} ecLevel error-correction level actually used
 * @property {number} mask mask pattern 0..7 actually used
 * @property {number} size side length in modules
 * @property {import('./segment.js').Segment[]} segments segmentation chosen
 * @property {number|undefined} eci ECI assignment declared, if any
 */

/**
 * Encodes text into a finished QR matrix.
 *
 * @param {string} data payload to encode
 * @param {object} [options] see `normalizeOptions`; validated here
 * @returns {QrResult} the finished symbol and how it was built
 * @throws {import('../util/errors.js').CapacityError} if the data does not fit
 * @throws {import('../util/errors.js').OptionError} if an option is invalid
 * @throws {import('../util/errors.js').ModeError} if a required mode is unavailable
 */
export function encode(data, options) {
  const opts = normalizeOptions(options);
  return encodeNormalized(data, opts);
}

/**
 * Encoding with options already normalised, so the boundary validator runs once
 * even when a renderer needs the options too (ADR-0009).
 *
 * @param {string} data payload to encode
 * @param {ReturnType<typeof normalizeOptions>} opts canonical options
 * @returns {QrResult} the finished symbol and how it was built
 */
export function encodeNormalized(data, opts) {
  const text = String(data ?? '');

  const { version, segments, eci: detectedEci } = selectVersion(text, {
    ecLevel: opts.ecLevel,
    minVersion: opts.minVersion,
    maxVersion: opts.maxVersion,
    encoding: opts.encoding,
  });

  // An explicit `eci` option overrides inference, including suppressing it.
  const eci = opts.eci ?? detectedEci;

  const codewords = buildCodewords({ segments, version, ecLevel: opts.ecLevel, eci });

  const base = new Matrix(version);
  placeFunctionPatterns(base);
  placeCodewords(base, codewords);

  const { mask, matrix } = chooseMask(base, opts.ecLevel, opts.mask);

  return {
    matrix,
    version,
    ecLevel: opts.ecLevel,
    mask,
    size: matrix.size,
    segments,
    eci,
  };
}
