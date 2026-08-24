/**
 * M10 gate (ADR-0011): the overlay rejects an over-budget size.
 *
 * A logo works by destroying modules and relying on error correction to recover
 * them, so the size limit is a safety property. It also fails *gradually* -- an
 * oversized logo scans on a clean screen and fails on a printed label -- which
 * is why the limit is enforced rather than advised.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZE_RATIO,
  FUNCTION_CLEARANCE,
  SAFETY_MARGIN,
  clearanceRatio,
  effectiveMaxSizeRatio,
  logoGeometry,
  logoOverlay,
  maxSizeRatio,
  validateLogo,
} from '../../../src/render/logo.js';
import { matrixToSvg } from '../../../src/render/svg.js';
import { qr } from '../../../src/index.js';
import { OptionError } from '../../../src/util/errors.js';

const LEVELS = ['L', 'M', 'Q', 'H'];
const SRC = 'data:image/png;base64,iVBORw0KGgo=';

describe('the budget', () => {
  it('spends only half the recovery capacity', () => {
    // The other half stays for the damage error correction actually exists for.
    expect(SAFETY_MARGIN).toBe(0.5);
  });

  it('allows more coverage at stronger levels', () => {
    const ratios = LEVELS.map(maxSizeRatio);
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it('is derived from area, not side length', () => {
    // Covering a fraction of the *area* destroys that fraction of codewords, so
    // the side ratio is the square root of the area budget.
    expect(maxSizeRatio('H')).toBeCloseTo(Math.sqrt(0.3 * 0.5), 6);
    expect(maxSizeRatio('L')).toBeCloseTo(Math.sqrt(0.07 * 0.5), 6);
  });

  it('stays well under half the side at every level', () => {
    for (const level of LEVELS) {
      expect(maxSizeRatio(level)).toBeLessThan(0.4);
      expect(maxSizeRatio(level)).toBeGreaterThan(0.15);
    }
  });

  it('defaults to a size every level permits', () => {
    for (const level of LEVELS) {
      expect(DEFAULT_SIZE_RATIO).toBeLessThanOrEqual(maxSizeRatio(level));
    }
  });
});

describe('the geometric constraint', () => {
  // A different kind of limit from the error-correction budget: function
  // patterns carry no error correction at all, so covering a finder makes the
  // symbol undetectable rather than merely damaged.
  it('reserves a finder pattern plus its separator at each edge', () => {
    expect(FUNCTION_CLEARANCE).toBe(8);
  });

  it('binds at low versions, where the symbol is small', () => {
    const v1 = qr('X', { ecLevel: 'H', version: 1 }).matrix;
    expect(clearanceRatio(v1)).toBeLessThan(maxSizeRatio('H'));
    expect(effectiveMaxSizeRatio(v1, 'H')).toBe(clearanceRatio(v1));
  });

  it('does not bind at high versions, where the EC budget is tighter', () => {
    const v40 = qr('X'.repeat(300), { ecLevel: 'H', version: 40 }).matrix;
    expect(clearanceRatio(v40)).toBeGreaterThan(maxSizeRatio('H'));
    expect(effectiveMaxSizeRatio(v40, 'H')).toBe(maxSizeRatio('H'));
  });

  it('rejects an overlay that would reach a finder', () => {
    const v1 = qr('X', { ecLevel: 'H', version: 1 }).matrix;
    const tooBig = clearanceRatio(v1) + 0.01;
    expect(tooBig).toBeLessThanOrEqual(maxSizeRatio('H')); // the EC budget would allow it
    expect(() => validateLogo(v1, { src: SRC, sizeRatio: tooBig }, 'H')).toThrow(/finder patterns/);
  });

  it('explains that finder patterns are unprotected', () => {
    const v1 = qr('X', { ecLevel: 'H', version: 1 }).matrix;
    // Must sit inside the EC budget, so the clearance check is what reports.
    const ratio = clearanceRatio(v1) + 0.01;
    expect(ratio).toBeLessThanOrEqual(maxSizeRatio('H'));
    expect(() => validateLogo(v1, { src: SRC, sizeRatio: ratio }, 'H'))
      .toThrow(/undetectable rather than merely damaged/);
  });
});

describe('validateLogo', () => {
  const big = qr('X'.repeat(300), { ecLevel: 'H', version: 40 }).matrix;

  it('accepts a source with the default size', () => {
    expect(validateLogo(big, { src: SRC }, 'M')).toEqual({ src: SRC, sizeRatio: DEFAULT_SIZE_RATIO });
  });

  it('accepts a size at exactly the limit', () => {
    const limit = maxSizeRatio('H');
    expect(validateLogo(big, { src: SRC, sizeRatio: limit }, 'H').sizeRatio).toBe(limit);
  });

  it('rejects a size one step past the limit', () => {
    const over = maxSizeRatio('H') + 0.001;
    expect(() => validateLogo(big, { src: SRC, sizeRatio: over }, 'H')).toThrow(OptionError);
  });

  it('rejects at every level', () => {
    for (const level of LEVELS) {
      expect(() => validateLogo(big, { src: SRC, sizeRatio: 0.9 }, level)).toThrow(OptionError);
    }
  });

  it('rejects a size that level L allows only at level H', () => {
    const atH = maxSizeRatio('H');
    expect(() => validateLogo(big, { src: SRC, sizeRatio: atH }, 'L')).toThrow(OptionError);
    expect(() => validateLogo(big, { src: SRC, sizeRatio: atH }, 'H')).not.toThrow();
  });

  it('explains the remedy rather than just refusing', () => {
    try {
      validateLogo(big, { src: SRC, sizeRatio: 0.9 }, 'M');
      expect.unreachable();
    } catch (error) {
      expect(error.option).toBe('logo.sizeRatio');
      expect(error.value).toBe(0.9);
      expect(error.message).toMatch(/EC level M/);
      expect(error.message).toMatch(/Raise ecLevel/);
      expect(error.message).toMatch(/scans on a .*screen and fails in print/);
    }
  });

  it('rejects a missing or empty source', () => {
    expect(() => validateLogo(big, {}, 'M')).toThrow(OptionError);
    expect(() => validateLogo(big, { src: '' }, 'M')).toThrow(OptionError);
    expect(() => validateLogo(big, { src: 42 }, 'M')).toThrow(OptionError);
  });

  it('rejects a non-object', () => {
    for (const bad of [null, undefined, 'logo.png', 5]) {
      expect(() => validateLogo(big, bad, 'M')).toThrow(OptionError);
    }
  });

  it('rejects a non-positive size', () => {
    for (const bad of [0, -0.2, '0.2', Number.NaN]) {
      expect(() => validateLogo(big, { src: SRC, sizeRatio: bad }, 'M')).toThrow(OptionError);
    }
  });
});

describe('logoGeometry', () => {
  const { matrix } = qr('GEOMETRY', { ecLevel: 'H' });

  it('centres the overlay', () => {
    const { x, y, size } = logoGeometry(matrix, { sizeRatio: 0.3 }, { quietZone: 4 });
    expect(x).toBe(y);
    // Equal margins either side, within the rounding to whole modules.
    const left = x - 4;
    const right = matrix.size - size - left;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('snaps to whole modules', () => {
    const { x, y, size } = logoGeometry(matrix, { sizeRatio: 0.3137 }, { quietZone: 4 });
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
    expect(Number.isInteger(size)).toBe(true);
  });

  it('offsets by the quiet zone', () => {
    const tight = logoGeometry(matrix, { sizeRatio: 0.3 }, { quietZone: 0 });
    const padded = logoGeometry(matrix, { sizeRatio: 0.3 }, { quietZone: 4 });
    expect(padded.x - tight.x).toBe(4);
  });

  it('never covers a finder pattern at the effective maximum, any version or level', () => {
    for (const level of LEVELS) {
      for (const version of [1, 2, 5, 7, 14, 27, 40]) {
        const symbol = qr('F'.repeat(3), { ecLevel: level, version });
        const ratio = effectiveMaxSizeRatio(symbol.matrix, level);
        const { x, size } = logoGeometry(symbol.matrix, { sizeRatio: ratio }, { quietZone: 0 });
        expect(x, `v${version}-${level}`).toBeGreaterThanOrEqual(FUNCTION_CLEARANCE);
        expect(x + size, `v${version}-${level}`).toBeLessThanOrEqual(symbol.size - FUNCTION_CLEARANCE);
      }
    }
  });

  it('is at least one module across', () => {
    expect(logoGeometry(matrix, { sizeRatio: 0.001 }, { quietZone: 4 }).size).toBe(1);
  });
});

describe('logoOverlay', () => {
  // A version 1 symbol is only 21 modules across, so a 0.3 ratio would reach the
  // finder patterns. Use a symbol with room.
  const { matrix } = qr('OVERLAY COMPOSITION TEST PAYLOAD', { ecLevel: 'H', minVersion: 10 });

  it('accepts the default size at every level and a range of versions', () => {
    for (const level of LEVELS) {
      for (const version of [2, 5, 10, 40]) {
        const symbol = qr('D'.repeat(3), { ecLevel: level, version });
        expect(() => logoOverlay(symbol.matrix, { src: SRC }, { ecLevel: level }))
          .not.toThrow();
      }
    }
  });

  it('produces an SVG image element', () => {
    const markup = logoOverlay(matrix, { src: SRC }, { ecLevel: 'H' });
    expect(markup.startsWith('<image ')).toBe(true);
    expect(markup.endsWith('/>')).toBe(true);
    expect(markup).toContain(`href="${SRC}"`);
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('escapes the source rather than trusting it', () => {
    const markup = logoOverlay(matrix, { src: '"/><script>alert(1)</script>' }, { ecLevel: 'H' });
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('enforces the budget', () => {
    expect(() => logoOverlay(matrix, { src: SRC, sizeRatio: 0.9 }, { ecLevel: 'H' }))
      .toThrow(OptionError);
  });

  it('composes into a rendered symbol', () => {
    const overlay = logoOverlay(matrix, { src: SRC, sizeRatio: 0.3 }, { ecLevel: 'H' });
    const svg = matrixToSvg(matrix, { overlay });
    expect(svg).toContain('<image ');
    // The overlay must sit after the modules so it draws on top.
    expect(svg.indexOf('<image')).toBeGreaterThan(svg.indexOf('<path'));
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('is absent when no overlay is given', () => {
    expect(matrixToSvg(matrix, {})).not.toContain('<image');
  });
});
