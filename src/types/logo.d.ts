/**
 * Types for `libqr/logo`.
 *
 * Its own entry point (ADR-0017) because a centre overlay is decoration, and
 * putting it in the default path cost 570 bytes there and pushed `libqr/svg`
 * half again over its budget.
 */
import type { ECLevelName, Matrix } from './index.js';

/** Centre overlay configuration. */
export interface LogoOptions {
  /** Image source, as a URL or data URI. A data URI keeps the SVG standalone. */
  src: string;
  /** Side length as a fraction of the symbol. Bounded by the EC budget. */
  sizeRatio?: number;
}

/** Fraction of the error-correction budget an overlay may consume. */
export declare const SAFETY_MARGIN: number;

/** Default overlay size, as a fraction of the symbol's side length. */
export declare const DEFAULT_SIZE_RATIO: number;

/** Modules kept clear at each edge: a finder pattern plus its separator. */
export declare const FUNCTION_CLEARANCE: number;

/**
 * Largest overlay side ratio the error-correction budget permits at a level.
 *
 * One of two constraints. See `clearanceRatio` for the other.
 */
export declare function maxSizeRatio(ecLevel: ECLevelName): number;

/**
 * Largest overlay side ratio the symbol's geometry permits, keeping the finder
 * patterns clear.
 *
 * A harder limit than the error-correction budget: function patterns carry no
 * error correction, so covering a finder makes the symbol undetectable rather
 * than merely damaged. Binds at low versions.
 */
export declare function clearanceRatio(matrix: Matrix): number;

/** Whichever of the two constraints binds for this symbol and level. */
export declare function effectiveMaxSizeRatio(matrix: Matrix, ecLevel: ECLevelName): number;

/** Validates an overlay against both constraints. */
export declare function validateLogo(
  matrix: Matrix,
  logo: LogoOptions,
  ecLevel: ECLevelName,
): Required<LogoOptions>;

/** Placement for an overlay, in module units including the quiet zone. */
export declare function logoGeometry(
  matrix: Matrix,
  logo: Pick<Required<LogoOptions>, 'sizeRatio'>,
  options: { quietZone: number },
): { x: number; y: number; size: number };

/** SVG markup for a centre overlay, for `matrixToSvg`'s `overlay` option. */
export declare function logoOverlay(
  matrix: Matrix,
  logo: LogoOptions,
  options: { ecLevel: ECLevelName; quietZone?: number },
): string;
