/**
 * Types for `libqr/element`.
 *
 * Importing the module defines `<qr-code>`; that side effect is why this file is
 * listed in the package's `sideEffects` array (ADR-0006).
 */
import type { QrOptions, QrResult } from './index.js';

/** Default tag name. */
export declare const TAG_NAME: 'qr-code';

/** A QR code that renders itself from its attributes. */
export declare class QrCodeElement extends HTMLElement {
  /** Attributes that trigger a re-render. */
  static readonly observedAttributes: string[];
  /** The last successful encode, or null after a failure. */
  result: QrResult | null;
  /** The last failure, or null when the current render succeeded. */
  error: Error | null;
  /** Encodes and draws from the element's current attributes. */
  render(): void;
}

/**
 * Registers the element. Called automatically on import.
 *
 * @returns true if it registered, false if that name was already taken
 */
export declare function defineElement(name?: string): boolean;

/** Handle returned by `mount`. */
export interface Mounted {
  /** Re-render in place. */
  update(data: string, options?: QrOptions): void;
  /** Remove the rendered symbol. */
  destroy(): void;
  /** The last encode result, or null after destroy. */
  result(): QrResult | null;
}

/** Renders a QR code into a container element. */
export declare function mount(
  target: Element | string,
  data: string,
  options?: QrOptions,
): Mounted;
