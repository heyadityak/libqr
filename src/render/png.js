/**
 * PNG output, via a canvas.
 *
 * Behind its own entry point (ADR-0006) because it needs a canvas, and
 * renderer-only for the same reason as `./canvas` -- see ADR-0015.
 *
 *   import { qr } from 'libqr';
 *   import { matrixToDataUrl } from 'libqr/png';
 *
 *   img.src = await matrixToDataUrl(qr('HELLO').matrix, { scale: 8 });
 *
 * Browser only. Unlike the SVG renderer this cannot work in Node, which is
 * exactly why SVG is the default (ADR-0005).
 */
import { QrError } from '../util/errors.js';
import { canvasSizeFor, matrixToCanvas } from './canvas.js';

/** Creates an offscreen drawing surface, preferring the one that needs no DOM. */
function createSurface(size) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(size, size);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  throw new QrError(
    'PNG output needs a canvas. This environment has neither OffscreenCanvas nor '
    + 'document -- use toSvg() instead, which works anywhere.',
  );
}

/**
 * Renders a matrix to a PNG data URL.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} [options] the same rendering options as `matrixToCanvas`
 * @returns {Promise<string>} a `data:image/png;base64,...` URL
 * @throws {QrError} if the environment provides no canvas
 */
export async function matrixToDataUrl(matrix, options = {}) {
  const surface = createSurface(canvasSizeFor(matrix, options));
  const ctx = surface.getContext('2d');
  matrixToCanvas(ctx, matrix, { ...options, resize: false });

  // A DOM canvas can produce a data URL directly; OffscreenCanvas cannot, so it
  // goes via a blob.
  if (typeof surface.toDataURL === 'function') {
    return surface.toDataURL('image/png');
  }

  const blob = await surface.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(blob);
}

/**
 * Renders a matrix to a PNG blob.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} [options] the same rendering options as `matrixToCanvas`
 * @returns {Promise<Blob>} PNG image data
 * @throws {QrError} if the environment provides no canvas
 */
export async function matrixToBlob(matrix, options = {}) {
  const surface = createSurface(canvasSizeFor(matrix, options));
  const ctx = surface.getContext('2d');
  matrixToCanvas(ctx, matrix, { ...options, resize: false });

  if (typeof surface.convertToBlob === 'function') {
    return surface.convertToBlob({ type: 'image/png' });
  }

  return new Promise((resolve, reject) => {
    surface.toBlob((blob) => {
      if (blob === null) reject(new QrError('Canvas produced no PNG blob'));
      else resolve(blob);
    }, 'image/png');
  });
}

/** Reads a blob as a data URL. */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new QrError('Could not read the PNG blob'));
    reader.readAsDataURL(blob);
  });
}
