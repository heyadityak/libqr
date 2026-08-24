/**
 * Imperative mounting helper.
 *
 * Renders into an element and hands back a handle for updating and tearing
 * down. Behind the `./element` entry point (ADR-0006) since it needs the DOM.
 */
import { encodeNormalized } from '../core/qr.js';
import { matrixToSvg } from '../render/svg.js';
import { OptionError } from '../util/errors.js';
import { normalizeOptions } from '../util/options.js';

/**
 * @typedef {object} Mounted
 * @property {(data: string, options?: object) => void} update re-render in place
 * @property {() => void} destroy remove the rendered symbol
 * @property {() => object} result the last encode result
 */

/**
 * Renders a QR code into a container element.
 *
 * SVG is used rather than canvas so the result scales with its container and
 * needs no device-pixel-ratio handling.
 *
 * @param {Element|string} target element, or a selector to look one up
 * @param {string} data payload to encode
 * @param {object} [options] encoding and rendering options
 * @returns {Mounted} handle for updating and removing the symbol
 * @throws {OptionError} if the target cannot be resolved
 */
export function mount(target, data, options) {
  const element = resolve(target);
  let last = null;

  const render = (nextData, nextOptions) => {
    const opts = normalizeOptions(nextOptions);
    last = encodeNormalized(nextData, opts);
    element.innerHTML = matrixToSvg(last.matrix, {
      scale: opts.scale,
      quietZone: opts.quietZone,
      dark: opts.dark,
      light: opts.light,
      shape: opts.shape,
      title: nextOptions?.title,
    });
  };

  render(data, options);

  return {
    update: render,
    destroy: () => {
      element.innerHTML = '';
      last = null;
    },
    result: () => last,
  };
}

/** Resolves a selector or element to an element. */
function resolve(target) {
  if (typeof target === 'string') {
    const found = document.querySelector(target);
    if (found === null) {
      throw new OptionError(`No element matches selector "${target}"`, { option: 'target', value: target });
    }
    return found;
  }
  if (target === null || typeof target.innerHTML !== 'string') {
    throw new OptionError('Mount target must be an element or a selector string', { option: 'target', value: target });
  }
  return target;
}
