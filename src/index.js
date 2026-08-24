/**
 * Public entry point.
 *
 * This is the only file permitted to re-export across layers (ADR-0003), and
 * the boundary where options are validated (ADR-0009 / ADR-0013).
 *
 * Canvas, PNG, Kanji, and the custom element are **not** re-exported here. They
 * live behind their own entry points so the default path keeps its size budget
 * (ADR-0006):
 *
 *   import { toCanvas } from 'libqr/canvas';
 *   import { toDataUrl } from 'libqr/png';
 *   import 'libqr/kanji';
 *   import 'libqr/element';
 */
import { encodeNormalized } from './core/qr.js';
import { matrixToAscii } from './render/ascii.js';
import { matrixToSvg } from './render/svg.js';
import { normalizeOptions } from './util/options.js';

export { encode } from './core/qr.js';
export { Matrix } from './core/matrix.js';
export { Mode } from './core/mode.js';
export { ECLevel, MAX_VERSION, MIN_VERSION } from './core/constants.js';
export { CapacityError, ModeError, OptionError, QrError } from './util/errors.js';
export { matrixToAscii, matrixToSvg };
export { DEFAULTS as DEFAULT_OPTIONS, normalizeOptions } from './util/options.js';

/**
 * Encodes text and returns the finished symbol plus how it was built.
 *
 * @param {string} data payload to encode
 * @param {object} [options] see the options table in README
 * @returns {import('./core/qr.js').QrResult} finished symbol and metadata
 */
export function qr(data, options) {
  return encodeNormalized(data, normalizeOptions(options));
}

/**
 * Encodes text and renders it as an SVG document string.
 *
 * Works in the browser and in Node -- the output is a string, with no DOM
 * involved (ADR-0005).
 *
 * @param {string} data payload to encode
 * @param {object} [options] encoding and rendering options
 * @returns {string} a complete SVG document
 */
export function toSvg(data, options) {
  const opts = normalizeOptions(options);
  const { matrix } = encodeNormalized(data, opts);
  return matrixToSvg(matrix, {
    scale: opts.scale,
    quietZone: opts.quietZone,
    dark: opts.dark,
    light: opts.light,
    shape: opts.shape,
    title: options?.title,
  });
}

/**
 * Encodes text and renders it as monospaced text.
 *
 * Intended for terminals and for debugging -- a matrix problem is obvious as
 * text and invisible as bytes.
 *
 * @param {string} data payload to encode
 * @param {object} [options] encoding options, plus `dark` and `light` glyphs
 * @returns {string} newline-separated rows, no trailing newline
 */
export function toAscii(data, options) {
  const opts = normalizeOptions(options);
  const { matrix } = encodeNormalized(data, opts);
  return matrixToAscii(matrix, {
    quietZone: opts.quietZone,
    dark: options?.darkGlyph,
    light: options?.lightGlyph,
  });
}
