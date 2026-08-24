/**
 * Presentation helpers shared by renderers.
 */

/** Module shapes renderers support. */
export const Shape = Object.freeze({
  SQUARE: 'square',
  DOT: 'dot',
  ROUNDED: 'rounded',
});

/** Corner radius for the rounded shape, as a fraction of a module. */
export const ROUNDED_RADIUS = 0.3;

/** Radius for the dot shape, as a fraction of a module. */
export const DOT_RADIUS = 0.42;

/**
 * Escapes text for inclusion in an XML attribute or text node.
 *
 * Colours and titles come from the caller, so they are escaped rather than
 * trusted -- a colour string containing a quote would otherwise break out of
 * its attribute.
 *
 * @param {string} value untrusted text
 * @returns {string} XML-safe text
 */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a number for SVG output, dropping trailing zeros.
 *
 * @param {number} value number to format
 * @returns {string} shortest representation that round-trips
 */
export function num(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
