/**
 * Types for `libqr/png`.
 *
 * Renderer-only, per ADR-0015. Browser only -- unlike SVG, PNG output needs a
 * canvas.
 */
import type { CanvasRenderOptions } from './canvas.js';
import type { Matrix } from './index.js';

/** Options for PNG output. The offset and resize options do not apply. */
export type PngRenderOptions = Omit<CanvasRenderOptions, 'x' | 'y' | 'resize'>;

/** Renders a matrix to a `data:image/png;base64,...` URL. */
export declare function matrixToDataUrl(matrix: Matrix, options?: PngRenderOptions): Promise<string>;

/** Renders a matrix to a PNG blob. */
export declare function matrixToBlob(matrix: Matrix, options?: PngRenderOptions): Promise<Blob>;
