/**
 * Centre overlay budgeting. Behind its own entry point (ADR-0006, ADR-0017).
 *
 * A logo works by *destroying* modules and relying on error correction to
 * recover them. That makes it a safety question, not a styling one: past a
 * certain size the symbol stops being readable, and it fails gradually -- it
 * scans on a clean screen and fails on a printed label at an angle.
 *
 * So the size is bounded here rather than left to the caller, and asking for
 * more throws instead of quietly producing something unscannable.
 *
 *   import { qr, matrixToSvg } from 'libqr';
 *   import { logoOverlay } from 'libqr/logo';
 *
 *   const { matrix } = qr(url, { ecLevel: 'H' });
 *   const svg = matrixToSvg(matrix, {
 *     overlay: logoOverlay(matrix, { src: dataUri, sizeRatio: 0.3 }, { ecLevel: 'H' }),
 *   });
 */
import { OptionError } from '../util/errors.js';

/**
 * Approximate recovery capacity per error-correction level, as a fraction of
 * codewords.
 *
 * These live here rather than in the generated spec tables because they are not
 * spec tables -- they are approximate figures used for exactly one thing, sizing
 * an overlay. Keeping them here also stops the standalone `libqr/svg` bundle
 * pulling in the whole version table for four numbers.
 */
const EC_RECOVERY = Object.freeze({
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.30,
});

/**
 * Fraction of the error-correction budget an overlay may consume.
 *
 * Half. The other half stays available for the damage error correction actually
 * exists for -- print defects, wear, glare, a scan at an angle. Spending the
 * whole budget on decoration produces a symbol with no margin, which is exactly
 * the failure that shows up in the field and not on a screen.
 */
export const SAFETY_MARGIN = 0.5;

/**
 * Default overlay size, as a fraction of the symbol's side length.
 *
 * Chosen to sit under the tightest level's limit -- level L allows 0.187 -- so
 * that `{ src }` with no size works at every level rather than throwing on the
 * weakest one.
 */
export const DEFAULT_SIZE_RATIO = 0.15;

/**
 * Modules that must stay clear at each edge: a finder pattern is 7 across plus a
 * 1-module separator.
 *
 * This is a *harder* limit than the error-correction budget, and a different
 * kind. Data modules are Reed-Solomon protected, so covering some is
 * recoverable. Function patterns are not protected at all -- covering a finder
 * makes the symbol undetectable rather than merely damaged, and no amount of
 * error correction helps.
 *
 * Central alignment patterns are a separate matter: a centred overlay covers
 * them at most versions, decoders tolerate it because the finders and timing
 * patterns remain, and forbidding it would make centre logos impossible. So they
 * are accepted, and only the finder region is protected.
 */
export const FUNCTION_CLEARANCE = 8;

/**
 * Largest permitted overlay side length, as a fraction of the symbol's side.
 *
 * Derived from area: an overlay covering fraction `a` of the area destroys
 * roughly fraction `a` of the codewords, so the side ratio is the square root of
 * the area budget.
 *
 * @param {string} ecLevel 'L', 'M', 'Q', or 'H'
 * @returns {number} maximum side ratio, 0 to 1
 */
export function maxSizeRatio(ecLevel) {
  return Math.sqrt(EC_RECOVERY[ecLevel] * SAFETY_MARGIN);
}

/**
 * Largest overlay side ratio the symbol's geometry allows, independent of error
 * correction: whatever leaves the finder patterns clear.
 *
 * Binding at low versions, where the symbol is small enough that the
 * error-correction budget would permit an overlay reaching into a corner.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @returns {number} maximum side ratio, 0 to 1
 */
export function clearanceRatio(matrix) {
  return Math.max(0, (matrix.size - FUNCTION_CLEARANCE * 2) / matrix.size);
}

/**
 * The effective limit: whichever of the two constraints binds.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {string} ecLevel error-correction level the symbol uses
 * @returns {number} maximum side ratio, 0 to 1
 */
export function effectiveMaxSizeRatio(matrix, ecLevel) {
  return Math.min(maxSizeRatio(ecLevel), clearanceRatio(matrix));
}

/**
 * Validates an overlay against both constraints: the error-correction budget,
 * and keeping the finder patterns clear.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {{src: string, sizeRatio?: number}} logo overlay configuration
 * @param {string} ecLevel error-correction level the symbol uses
 * @returns {{src: string, sizeRatio: number}} normalized overlay
 * @throws {OptionError} if the source is missing, or the size exceeds either limit
 */
export function validateLogo(matrix, logo, ecLevel) {
  if (logo === null || typeof logo !== 'object') {
    throw new OptionError(
      `Invalid logo ${JSON.stringify(logo)}; expected an object with a src`,
      { option: 'logo', value: logo },
    );
  }

  if (typeof logo.src !== 'string' || logo.src === '') {
    throw new OptionError(
      'Invalid logo.src; expected a URL or data URI string',
      { option: 'logo.src', value: logo.src },
    );
  }

  const sizeRatio = logo.sizeRatio ?? DEFAULT_SIZE_RATIO;

  if (typeof sizeRatio !== 'number' || !(sizeRatio > 0)) {
    throw new OptionError(
      `Invalid logo.sizeRatio ${JSON.stringify(sizeRatio)}; expected a number above 0`,
      { option: 'logo.sizeRatio', value: sizeRatio },
    );
  }

  const budget = maxSizeRatio(ecLevel);
  if (sizeRatio > budget) {
    throw new OptionError(
      `logo.sizeRatio ${sizeRatio} exceeds the ${budget.toFixed(3)} that EC level `
      + `${ecLevel} can cover. Raise ecLevel to reserve more error correction, or `
      + 'shrink the logo -- covering more would produce a symbol that scans on a '
      + 'screen and fails in print.',
      { option: 'logo.sizeRatio', value: sizeRatio },
    );
  }

  const clearance = clearanceRatio(matrix);
  if (sizeRatio > clearance) {
    throw new OptionError(
      `logo.sizeRatio ${sizeRatio} would reach the finder patterns of this `
      + `${matrix.size}-module symbol, which allows at most ${clearance.toFixed(3)}. `
      + 'Finder patterns carry no error correction, so covering one makes the '
      + 'symbol undetectable rather than merely damaged. Use a longer payload or '
      + 'a higher minVersion to get a larger symbol, or shrink the logo.',
      { option: 'logo.sizeRatio', value: sizeRatio },
    );
  }

  return { src: logo.src, sizeRatio };
}

/**
 * Placement for an overlay, in module units including the quiet zone.
 *
 * Centred, and snapped to whole modules so its edges align with module
 * boundaries rather than cutting modules in half -- a half-covered module is
 * ambiguous to a decoder in a way a fully covered one is not.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {{sizeRatio: number}} logo validated overlay
 * @param {object} options
 * @param {number} options.quietZone quiet zone width in modules
 * @returns {{x: number, y: number, size: number}} placement in module units
 */
export function logoGeometry(matrix, logo, { quietZone }) {
  const size = Math.max(1, Math.round(matrix.size * logo.sizeRatio));
  const offset = quietZone + Math.floor((matrix.size - size) / 2);
  return { x: offset, y: offset, size };
}

/**
 * The SVG markup for a centre overlay, ready to pass as `matrixToSvg`'s
 * `overlay` option.
 *
 * Sits on top of the modules it covers. If `src` is an external URL the
 * resulting SVG is no longer self-contained; a data URI keeps it standalone.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {{src: string, sizeRatio?: number}} logo overlay configuration
 * @param {object} options
 * @param {string} options.ecLevel error-correction level the symbol was built
 *   with, which determines how much may be covered
 * @param {number} [options.quietZone] quiet zone width in modules; must match
 *   what the renderer is given
 * @returns {string} an SVG `<image>` element
 * @throws {OptionError} if the overlay exceeds the error-correction budget, or
 *   would reach the finder patterns
 */
export function logoOverlay(matrix, logo, { ecLevel, quietZone = 4 }) {
  const validated = validateLogo(matrix, logo, ecLevel);
  const { x, y, size } = logoGeometry(matrix, validated, { quietZone });
  const src = String(validated.src)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<image x="${x}" y="${y}" width="${size}" height="${size}"`
    + ` href="${src}" preserveAspectRatio="xMidYMid meet"/>`;
}
