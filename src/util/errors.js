/**
 * Typed errors, per ADR-0009.
 *
 * Every message names the input and the limit, so a caller can act on it
 * without parsing prose. Consumers can catch `QrError` to catch everything this
 * library throws; the subclasses carry machine-readable properties so a caller
 * can react programmatically -- fall back to a weaker EC level, truncate the
 * payload -- rather than string-matching a message.
 */

/** Base class for every error this library throws. */
export class QrError extends Error {
  /** @param {string} message human-readable description naming input and limit */
  constructor(message) {
    super(message);
    this.name = 'QrError';
  }
}

/** The data does not fit the requested version and error-correction level. */
export class CapacityError extends QrError {
  /**
   * @param {object} details
   * @param {number} details.needed bits the data requires
   * @param {number} details.available bits the symbol provides
   * @param {number} [details.version] version the limit applies to
   * @param {string} [details.ecLevel] error-correction level the limit applies to
   */
  constructor({ needed, available, version, ecLevel }) {
    const where = version === undefined
      ? 'any version'
      : `version ${version}${ecLevel === undefined ? '' : ` at EC level ${ecLevel}`}`;
    super(`Data too long: needs ${needed} bits, ${where} provides ${available}`);
    this.name = 'CapacityError';
    this.needed = needed;
    this.available = available;
    this.version = version;
    this.ecLevel = ecLevel;
  }
}

/** A requested mode is unavailable, or cannot represent the given input. */
export class ModeError extends QrError {
  /**
   * @param {string} message description naming the mode and the reason
   * @param {object} [details]
   * @param {string} [details.mode] mode name involved
   */
  constructor(message, { mode } = {}) {
    super(message);
    this.name = 'ModeError';
    this.mode = mode;
  }
}

/** An option value is outside its permitted range or of the wrong type. */
export class OptionError extends QrError {
  /**
   * @param {string} message description naming the option, the value, and the limit
   * @param {object} [details]
   * @param {string} [details.option] option key involved
   * @param {unknown} [details.value] the rejected value
   */
  constructor(message, { option, value } = {}) {
    super(message);
    this.name = 'OptionError';
    this.option = option;
    this.value = value;
  }
}
