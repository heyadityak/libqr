/**
 * Internal invariant checks.
 *
 * ADR-0009: these cover **internal** invariants only and are stripped from
 * production builds. Never use `assert` to validate consumer input -- in a
 * production build it does not exist, so the check silently disappears.
 * Consumer input is validated once at the public boundary, with typed errors.
 */
import { QrError } from './errors.js';

/**
 * Throws if `condition` is falsy.
 *
 * @param {unknown} condition invariant expected to hold
 * @param {string} message what was expected, for a developer reading a stack trace
 * @returns {void}
 */
export function assert(condition, message) {
  if (!condition) {
    throw new QrError(`Internal invariant violated: ${message}`);
  }
}
