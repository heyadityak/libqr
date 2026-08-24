/**
 * Option normalisation and validation.
 *
 * ADR-0009 requires validation exactly once, at the public boundary, with
 * internals assuming a canonical object. There is more than one public boundary
 * -- `qr()`, `toSvg()`, and the lower-level `encode()` are all reachable from
 * outside -- so the validator lives at the bottom layer where every boundary can
 * reach it. See ADR-0013.
 *
 * Unknown keys are ignored rather than rejected, so a consumer passing an option
 * from a newer version against an older install degrades instead of breaking.
 */
import { OptionError } from './errors.js';

/** Error-correction levels, in the order the option accepts. */
const EC_LEVEL_VALUES = ['L', 'M', 'Q', 'H'];

/** Text encodings the byte-mode encoder understands. */
const ENCODING_VALUES = ['utf-8', 'latin1', 'shift-jis'];

/** Module shapes the renderers understand. */
const SHAPE_VALUES = ['square', 'dot', 'rounded'];

/** Smallest quiet zone the spec permits. Narrower is allowed but warned about. */
export const MIN_QUIET_ZONE = 4;

/** Defaults for every option. */
export const DEFAULTS = Object.freeze({
  ecLevel: 'M',
  version: undefined,
  minVersion: 1,
  maxVersion: 40,
  mask: undefined,
  encoding: 'utf-8',
  quietZone: MIN_QUIET_ZONE,
  scale: 4,
  margin: undefined,
  dark: '#000000',
  light: '#ffffff',
  shape: 'square',
  logo: undefined,
  eci: undefined,
});

function requireOneOf(value, allowed, option) {
  if (!allowed.includes(value)) {
    throw new OptionError(
      `Invalid ${option} "${String(value)}"; expected one of ${allowed.join(', ')}`,
      { option, value },
    );
  }
  return value;
}

function requireInteger(value, { option, min, max }) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new OptionError(
      `Invalid ${option} ${JSON.stringify(value)}; expected an integer`,
      { option, value },
    );
  }
  if (value < min || value > max) {
    throw new OptionError(
      `Invalid ${option} ${value}; expected ${min} to ${max}`,
      { option, value },
    );
  }
  return value;
}

function requireColour(value, option) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OptionError(
      `Invalid ${option} ${JSON.stringify(value)}; expected a CSS colour string`,
      { option, value },
    );
  }
  return value;
}

/**
 * Validates and fills in options, producing the canonical object every internal
 * function assumes.
 *
 * @param {object} [input] caller-supplied options; unknown keys are ignored
 * @returns {typeof DEFAULTS} canonical options with every key present
 * @throws {OptionError} if any recognised option is invalid
 */
export function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object') {
    throw new OptionError(
      `Invalid options ${JSON.stringify(input)}; expected an object`,
      { option: 'options', value: input },
    );
  }

  const ecLevel = requireOneOf(input.ecLevel ?? DEFAULTS.ecLevel, EC_LEVEL_VALUES, 'ecLevel');
  const encoding = requireOneOf(input.encoding ?? DEFAULTS.encoding, ENCODING_VALUES, 'encoding');
  const shape = requireOneOf(input.shape ?? DEFAULTS.shape, SHAPE_VALUES, 'shape');

  let minVersion = requireInteger(input.minVersion ?? DEFAULTS.minVersion, {
    option: 'minVersion', min: 1, max: 40,
  });
  let maxVersion = requireInteger(input.maxVersion ?? DEFAULTS.maxVersion, {
    option: 'maxVersion', min: 1, max: 40,
  });

  let version;
  if (input.version !== undefined) {
    version = requireInteger(input.version, { option: 'version', min: 1, max: 40 });
    // An explicit version pins the search to exactly that version.
    minVersion = version;
    maxVersion = version;
  } else if (minVersion > maxVersion) {
    throw new OptionError(
      `Invalid version range ${minVersion}..${maxVersion}; minVersion must not exceed maxVersion`,
      { option: 'minVersion', value: minVersion },
    );
  }

  const mask = input.mask === undefined
    ? undefined
    : requireInteger(input.mask, { option: 'mask', min: 0, max: 7 });

  const eci = input.eci === undefined
    ? undefined
    : requireInteger(input.eci, { option: 'eci', min: 0, max: 999999 });

  // `margin` is an alias for the quiet zone. When both are given, quietZone
  // wins, per the documented option table.
  const quietZone = requireInteger(
    input.quietZone ?? input.margin ?? DEFAULTS.quietZone,
    { option: 'quietZone', min: 0, max: 100 },
  );

  const scale = requireInteger(input.scale ?? DEFAULTS.scale, {
    option: 'scale', min: 1, max: 1000,
  });

  return Object.freeze({
    ecLevel,
    version,
    minVersion,
    maxVersion,
    mask,
    encoding,
    quietZone,
    scale,
    margin: input.margin,
    dark: requireColour(input.dark ?? DEFAULTS.dark, 'dark'),
    light: requireColour(input.light ?? DEFAULTS.light, 'light'),
    shape,
    logo: input.logo,
    eci,
  });
}

/**
 * Whether a quiet zone is narrower than the spec's minimum.
 *
 * Renderers warn rather than throw: a tight quiet zone still produces a valid
 * symbol, it just scans badly against busy backgrounds.
 *
 * @param {number} quietZone quiet zone width in modules
 * @returns {boolean} true if below the spec minimum
 */
export function isQuietZoneTooNarrow(quietZone) {
  return quietZone < MIN_QUIET_ZONE;
}
