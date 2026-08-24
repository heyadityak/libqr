/**
 * Mode registry and version-dependent indicator widths.
 *
 * Per ADR-0012 the per-mode constants live with each encoder; this module knows
 * only how to find an encoder and how version affects the count indicator.
 */
import * as alphanumeric from '../encode/alphanumeric.js';
import * as byte from '../encode/byte.js';
import * as numeric from '../encode/numeric.js';
import { ModeError } from '../util/errors.js';
import { getRegisteredMode } from '../util/mode-registry.js';

/** Encoding mode names. */
export const Mode = Object.freeze({
  NUMERIC: 'numeric',
  ALPHANUMERIC: 'alphanumeric',
  BYTE: 'byte',
  KANJI: 'kanji',
});

/**
 * Always-available encoders, imported statically so tree-shaking cannot drop
 * them. Optional modes come from the registry instead.
 */
const BUILT_IN = new Map([
  [numeric.NAME, numeric],
  [alphanumeric.NAME, alphanumeric],
  [byte.NAME, byte],
]);

/** Built-in encoders in ascending order of bits per character. */
export const DENSITY_ORDER = Object.freeze([numeric, alphanumeric, byte]);

/**
 * Index into a mode's `COUNT_BITS` triple for the given version.
 *
 * The two step points -- version 10 and version 27 -- are the classic source of
 * bugs that only appear on large payloads (AGENTS.md section 11).
 *
 * @param {number} version symbol version 1..40
 * @returns {number} 0 for versions 1-9, 1 for 10-26, 2 for 27-40
 */
export function versionRangeIndex(version) {
  if (version <= 9) return 0;
  if (version <= 26) return 1;
  return 2;
}

/**
 * Resolves a mode name to its encoder.
 *
 * @param {string} name mode name
 * @returns {object} encoder module namespace
 * @throws {ModeError} if the mode is unknown, or its entry point was not imported
 */
export function encoderFor(name) {
  const builtIn = BUILT_IN.get(name);
  if (builtIn !== undefined) return builtIn;

  const registered = getRegisteredMode(name);
  if (registered !== undefined) return registered;

  if (name === Mode.KANJI) {
    throw new ModeError(
      'Kanji mode is not loaded. Import "libqr/kanji" to enable it -- it is a '
      + 'separate entry point so its Shift-JIS table stays out of the default bundle.',
      { mode: name },
    );
  }

  throw new ModeError(`Unknown mode "${name}"`, { mode: name });
}

/**
 * Character-count indicator width for a mode at a version.
 *
 * @param {string} name mode name
 * @param {number} version symbol version 1..40
 * @returns {number} bit width of the character-count indicator
 */
export function countBitsFor(name, version) {
  return encoderFor(name).COUNT_BITS[versionRangeIndex(version)];
}

/**
 * Four-bit mode indicator for a mode.
 *
 * @param {string} name mode name
 * @returns {number} mode indicator bits
 */
export function modeIndicatorFor(name) {
  return encoderFor(name).MODE_INDICATOR;
}
