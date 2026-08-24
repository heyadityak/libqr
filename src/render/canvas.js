/**
 * Canvas rendering.
 *
 * Behind its own entry point (ADR-0006), and renderer-only: it takes a matrix
 * you already have rather than encoding for you, so the entry point's budget
 * measures the marginal cost of canvas support rather than re-counting the
 * encoder. See ADR-0015.
 *
 *   import { qr } from 'libqr';
 *   import { matrixToCanvas } from 'libqr/canvas';
 *
 *   matrixToCanvas(ctx, qr('HELLO').matrix, { scale: 8 });
 *
 * The context is supplied by the caller, so this module never creates one and
 * never needs to detect its environment.
 */
import { darkModules, dimensions, horizontalRuns } from './shared/geometry.js';
import { DOT_RADIUS, ROUNDED_RADIUS, Shape } from './shared/style.js';

/**
 * Draws a finished matrix into a 2D canvas context.
 *
 * Resizes the backing canvas to fit, unless `resize` is false -- a caller
 * compositing several symbols wants to place them itself.
 *
 * @param {CanvasRenderingContext2D} ctx destination context
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} [options]
 * @param {number} [options.scale] pixels per module
 * @param {number} [options.quietZone] quiet zone width in modules
 * @param {string} [options.dark] colour for dark modules
 * @param {string} [options.light] background colour; pass null to leave the
 *   canvas as it is, for drawing over existing content
 * @param {string} [options.shape] 'square', 'dot', or 'rounded'
 * @param {number} [options.x] left offset in pixels
 * @param {number} [options.y] top offset in pixels
 * @param {boolean} [options.resize] resize the canvas to fit; default true
 * @returns {{width: number, height: number}} pixel size drawn
 */
export function matrixToCanvas(ctx, matrix, {
  scale = 4,
  quietZone = 4,
  dark = '#000000',
  light = '#ffffff',
  shape = Shape.SQUARE,
  x = 0,
  y = 0,
  resize = true,
} = {}) {
  const { pixels } = dimensions(matrix, { quietZone, scale });

  if (resize && ctx.canvas !== undefined) {
    ctx.canvas.width = pixels + x;
    ctx.canvas.height = pixels + y;
  }

  if (light !== null && light !== undefined) {
    ctx.fillStyle = light;
    ctx.fillRect(x, y, pixels, pixels);
  }

  ctx.fillStyle = dark;
  const originX = x + quietZone * scale;
  const originY = y + quietZone * scale;

  if (shape === Shape.DOT) {
    const radius = DOT_RADIUS * scale;
    for (const { row, col } of darkModules(matrix)) {
      ctx.beginPath();
      ctx.arc(originX + (col + 0.5) * scale, originY + (row + 0.5) * scale, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shape === Shape.ROUNDED) {
    const radius = ROUNDED_RADIUS * scale;
    for (const { row, col } of darkModules(matrix)) {
      roundedRect(ctx, originX + col * scale, originY + row * scale, scale, radius);
      ctx.fill();
    }
  } else {
    // Square modules merge into horizontal runs, so a version 40 symbol takes
    // hundreds of fillRect calls instead of tens of thousands.
    for (const { row, col, length } of horizontalRuns(matrix)) {
      ctx.fillRect(originX + col * scale, originY + row * scale, length * scale, scale);
    }
  }

  return { width: pixels, height: pixels };
}

/** Traces a rounded square. `roundRect` is not universally available yet. */
function roundedRect(ctx, left, top, size, radius) {
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + size - r, top);
  ctx.quadraticCurveTo(left + size, top, left + size, top + r);
  ctx.lineTo(left + size, top + size - r);
  ctx.quadraticCurveTo(left + size, top + size, left + size - r, top + size);
  ctx.lineTo(left + r, top + size);
  ctx.quadraticCurveTo(left, top + size, left, top + size - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
}

/**
 * Pixel size a matrix would occupy, without drawing anything.
 *
 * Lets a caller size a canvas, or lay out several symbols, before rendering.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} [options]
 * @param {number} [options.scale] pixels per module
 * @param {number} [options.quietZone] quiet zone width in modules
 * @returns {number} side length in pixels
 */
export function canvasSizeFor(matrix, { scale = 4, quietZone = 4 } = {}) {
  return dimensions(matrix, { quietZone, scale }).pixels;
}
