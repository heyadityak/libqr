/**
 * The `<qr-code>` custom element.
 *
 * Behind its own entry point (ADR-0006). Importing this module defines the
 * element -- that is the documented side effect, and why this file is listed in
 * the package's `sideEffects` array rather than the flag being dropped globally.
 *
 *   <script type="module">import 'libqr/element';</script>
 *   <qr-code data="https://example.com" ec-level="Q" scale="6"></qr-code>
 *
 * Attributes are reflected, so changing one re-renders.
 */
import { encodeNormalized } from '../core/qr.js';
import { matrixToSvg } from '../render/svg.js';
import { QrError } from '../util/errors.js';
import { normalizeOptions } from '../util/options.js';

// One DOM entry point covers both ways of putting a code on a page: declarative
// via the element, imperative via mount(). They share the encoder anyway, so
// splitting them would add an entry point without saving a byte.
export { mount } from './mount.js';

/** Default tag name. */
export const TAG_NAME = 'qr-code';

/** Attribute names, mapped to the option they set. */
const ATTRIBUTES = Object.freeze({
  data: 'data',
  'ec-level': 'ecLevel',
  version: 'version',
  mask: 'mask',
  encoding: 'encoding',
  'quiet-zone': 'quietZone',
  scale: 'scale',
  dark: 'dark',
  light: 'light',
  shape: 'shape',
  label: 'title',
});

/** Options whose values are numbers rather than strings. */
const NUMERIC = new Set(['version', 'mask', 'quietZone', 'scale']);

/** A QR code that renders itself from its attributes. */
export class QrCodeElement extends HTMLElement {
  /** @returns {string[]} attributes that trigger a re-render */
  static get observedAttributes() {
    return Object.keys(ATTRIBUTES);
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    // Only render once connected; otherwise a parser setting several attributes
    // in sequence would encode once per attribute.
    if (this.isConnected) this.render();
  }

  /**
   * Encodes and draws from the element's current attributes.
   *
   * An invalid attribute renders nothing and sets `error` rather than throwing:
   * a custom element callback that throws produces an unhandled error with no
   * useful call site for the page author.
   *
   * @returns {void}
   */
  render() {
    this.error = null;

    try {
      const options = {};
      for (const [attribute, option] of Object.entries(ATTRIBUTES)) {
        const raw = this.getAttribute(attribute);
        if (raw === null) continue;
        options[option] = NUMERIC.has(option) ? Number(raw) : raw;
      }

      const data = options.data ?? '';
      delete options.data;

      const opts = normalizeOptions(options);
      const result = encodeNormalized(data, opts);

      this.innerHTML = matrixToSvg(result.matrix, {
        scale: opts.scale,
        quietZone: opts.quietZone,
        dark: opts.dark,
        light: opts.light,
        shape: opts.shape,
        title: options.title,
      });

      this.result = result;
      this.dispatchEvent(new CustomEvent('qr-render', { detail: result }));
    } catch (error) {
      this.innerHTML = '';
      this.result = null;
      this.error = error instanceof QrError ? error : new QrError(String(error));
      this.dispatchEvent(new CustomEvent('qr-error', { detail: this.error }));
    }
  }
}

/**
 * Registers the element. Called automatically on import.
 *
 * @param {string} [name] tag name to register under
 * @returns {boolean} true if it registered, false if that name was already taken
 */
export function defineElement(name = TAG_NAME) {
  if (typeof customElements === 'undefined') return false;
  if (customElements.get(name) !== undefined) return false;
  customElements.define(name, name === TAG_NAME ? QrCodeElement : class extends QrCodeElement {});
  return true;
}

defineElement();
