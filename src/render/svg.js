/**
 * SVG rendering -- the default renderer (ADR-0005).
 *
 * Output is a plain string, built without touching the DOM, so this works
 * identically in a browser, in Node, in a worker, and during server-side
 * rendering. It is also what makes golden snapshots diffable.
 */
import { darkModules, dimensions, horizontalRuns } from './shared/geometry.js';
import { DOT_RADIUS, ROUNDED_RADIUS, Shape, escapeXml, num } from './shared/style.js';

/**
 * Renders a finished matrix as an SVG document.
 *
 * The symbol is drawn in module units with a `viewBox`, and scaled through the
 * `width` and `height` attributes. That keeps path coordinates small integers
 * regardless of scale, which is most of why the output is compact.
 *
 * @param {import('../core/matrix.js').Matrix} matrix finished symbol
 * @param {object} [options]
 * @param {number} [options.scale] pixels per module
 * @param {number} [options.quietZone] quiet zone width in modules
 * @param {string} [options.dark] colour for dark modules
 * @param {string} [options.light] background colour; pass null for transparent
 * @param {string} [options.shape] 'square', 'dot', or 'rounded'
 * @param {string} [options.title] accessible name for the symbol
 * @returns {string} a complete SVG document
 */
export function matrixToSvg(matrix, {
  scale = 4,
  quietZone = 4,
  dark = '#000000',
  light = '#ffffff',
  shape = Shape.SQUARE,
  title,
} = {}) {
  const { modules, pixels } = dimensions(matrix, { quietZone, scale });

  // crispEdges keeps square modules from being blurred by antialiasing, but
  // would destroy the curves of the other shapes.
  const rendering = shape === Shape.SQUARE ? ' shape-rendering="crispEdges"' : '';

  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` width="${pixels}" height="${pixels}" viewBox="0 0 ${modules} ${modules}"`,
    rendering,
    ' role="img">',
  ];

  if (title !== undefined) {
    parts.push(`<title>${escapeXml(title)}</title>`);
  }

  if (light !== null && light !== undefined) {
    parts.push(`<rect width="${modules}" height="${modules}" fill="${escapeXml(light)}"/>`);
  }

  parts.push(renderModules(matrix, { quietZone, dark, shape }));
  parts.push('</svg>');

  return parts.join('');
}

/** Draws the dark modules in the requested shape. */
function renderModules(matrix, { quietZone, dark, shape }) {
  const fill = escapeXml(dark);

  if (shape === Shape.DOT) {
    const circles = darkModules(matrix)
      .map(({ row, col }) => `<circle cx="${num(col + quietZone + 0.5)}" cy="${num(row + quietZone + 0.5)}" r="${num(DOT_RADIUS)}"/>`)
      .join('');
    return `<g fill="${fill}">${circles}</g>`;
  }

  if (shape === Shape.ROUNDED) {
    const rects = darkModules(matrix)
      .map(({ row, col }) => `<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1" rx="${num(ROUNDED_RADIUS)}"/>`)
      .join('');
    return `<g fill="${fill}">${rects}</g>`;
  }

  // Square modules merge into horizontal runs, which is a large size win.
  const path = horizontalRuns(matrix)
    .map(({ row, col, length }) => `M${col + quietZone} ${row + quietZone}h${length}v1h-${length}z`)
    .join('');
  return `<path fill="${fill}" d="${path}"/>`;
}
