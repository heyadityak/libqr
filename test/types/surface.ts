/**
 * Exercises the hand-written public types against real call sites.
 *
 * ADR-0002 accepts a hand-maintained `.d.ts`, which means nothing stops it
 * drifting from the implementation -- except this file. Every public export is
 * called here with the argument shapes the README documents, so a removed or
 * renamed export fails `npm run test:types`.
 */
import type {
  AsciiOptions,
  ECLevelName,
  Matrix,
  ModuleShape,
  QrOptions,
  QrResult,
  RenderOptions,
  Segment,
} from '../../src/types/index.d.ts';

declare const api: typeof import('../../src/types/index.d.ts');

// --- qr() ------------------------------------------------------------------
const result: QrResult = api.qr('HELLO WORLD');
const version: number = result.version;
const level: ECLevelName = result.ecLevel;
const mask: number = result.mask;
const size: number = result.size;
const segments: Segment[] = result.segments;
const eci: number | undefined = result.eci;
void [version, level, mask, size, segments, eci];

// Every documented option, all together.
const everyOption: QrOptions = {
  ecLevel: 'H',
  version: 10,
  minVersion: 1,
  maxVersion: 40,
  mask: 3,
  encoding: 'utf-8',
  quietZone: 4,
  scale: 8,
  margin: 32,
  dark: '#000000',
  light: '#ffffff',
  shape: 'rounded',
  logo: { src: 'data:image/png;base64,AAAA', sizeRatio: 0.2 },
  eci: 26,
  title: 'Order QR',
};
void api.qr('x', everyOption);

// --- renderers -------------------------------------------------------------
const svg: string = api.toSvg('HELLO WORLD', { scale: 4, shape: 'dot' });
const ascii: string = api.toAscii('HELLO WORLD', { darkGlyph: '##', lightGlyph: '  ' });
void [svg, ascii];

const matrix: Matrix = api.qr('x').matrix;
const dark: boolean = matrix.get(0, 0);
const isFunction: boolean = matrix.isFunction(0, 0);
const rows: boolean[][] = matrix.toRows();
const clone: Matrix = matrix.clone();
void [dark, isFunction, rows, clone];

const renderOptions: RenderOptions = { scale: 2, quietZone: 0, dark: '#f00', light: null, shape: 'square' };
void api.matrixToSvg(matrix, renderOptions);

const asciiOptions: AsciiOptions = { quietZone: 1, dark: '@@', light: '..' };
void api.matrixToAscii(matrix, asciiOptions);

// --- lower level -----------------------------------------------------------
void api.encode('x', { ecLevel: 'L' });
void api.normalizeOptions({ ecLevel: 'Q' });

// --- constants -------------------------------------------------------------
const maxVersion: 40 = api.MAX_VERSION;
const minVersion: 1 = api.MIN_VERSION;
const levelName: ECLevelName = api.ECLevel.Q;
const modeName: 'numeric' = api.Mode.NUMERIC;
void [maxVersion, minVersion, levelName, modeName];

// --- errors ----------------------------------------------------------------
try {
  api.qr('9'.repeat(9000));
} catch (error) {
  if (error instanceof api.CapacityError) {
    const needed: number = error.needed;
    const available: number = error.available;
    void [needed, available];
  } else if (error instanceof api.OptionError) {
    const option: string | undefined = error.option;
    void option;
  } else if (error instanceof api.ModeError) {
    const mode: string | undefined = error.mode;
    void mode;
  }
}

const shape: ModuleShape = 'dot';
void shape;
