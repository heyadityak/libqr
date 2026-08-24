/**
 * Types for `libqr/canvas`.
 *
 * Renderer-only, per ADR-0015 -- bring your own matrix from `libqr`.
 */
import type { Matrix, ModuleShape } from './index.js';

/** Options for drawing into a canvas context. */
export interface CanvasRenderOptions {
  /** Pixels per module. Default 4. */
  scale?: number;
  /** Quiet zone width in modules. Default 4. */
  quietZone?: number;
  /** Colour for dark modules. Default `'#000000'`. */
  dark?: string;
  /** Background colour. Pass `null` to draw over existing content. */
  light?: string | null;
  /** Module shape. Default `'square'`. */
  shape?: ModuleShape;
  /** Left offset in pixels. Default 0. */
  x?: number;
  /** Top offset in pixels. Default 0. */
  y?: number;
  /** Resize the backing canvas to fit. Default true. */
  resize?: boolean;
}

/** Draws a finished matrix into a 2D canvas context. */
export declare function matrixToCanvas(
  ctx: CanvasRenderingContext2D,
  matrix: Matrix,
  options?: CanvasRenderOptions,
): { width: number; height: number };

/** Pixel size a matrix would occupy, without drawing anything. */
export declare function canvasSizeFor(
  matrix: Matrix,
  options?: Pick<CanvasRenderOptions, 'scale' | 'quietZone'>,
): number;
