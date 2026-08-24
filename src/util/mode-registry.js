/**
 * Registry for optional encoding modes.
 *
 * Kanji mode is behind its own entry point (ADR-0006) because it carries a
 * Shift-JIS table that default-path consumers should not pay for. It therefore
 * cannot be imported by `core/`, and it cannot import `core/` either -- that
 * would be an upward import (ADR-0003).
 *
 * So the registry lives here in `util/`, which both layers may import. This is
 * ADR-0012's placement rule being applied, not an exception to it.
 *
 * The built-in numeric, alphanumeric, and byte encoders are **not** registered
 * here: `core/mode.js` imports them statically. Relying on import side effects
 * for modes that are always needed would be fragile under `"sideEffects": false`.
 */

const registry = new Map();

/**
 * Registers an optional mode encoder. Called by the mode's own entry point.
 *
 * @param {{NAME: string}} encoder encoder module namespace
 * @returns {void}
 */
export function registerMode(encoder) {
  registry.set(encoder.NAME, encoder);
}

/**
 * Looks up a registered optional mode.
 *
 * @param {string} name mode name
 * @returns {object|undefined} the encoder, or undefined if its entry point was
 *   never imported
 */
export function getRegisteredMode(name) {
  return registry.get(name);
}
