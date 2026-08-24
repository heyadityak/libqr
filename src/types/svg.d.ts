/**
 * Types for `libqr/svg`.
 *
 * Renderer-only, per ADR-0015. The same function is also re-exported from the
 * main entry point, since SVG is the default renderer (ADR-0005).
 */
import type { Matrix, RenderOptions } from './index.js';

/** Renders a finished matrix as an SVG document string. */
export declare function matrixToSvg(matrix: Matrix, options?: RenderOptions): string;
