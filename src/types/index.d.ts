/**
 * Public type surface for libqr.
 *
 * Hand-maintained (ADR-0002). `test/types/*.ts` exercises this against the real
 * exports under `tsc --noEmit`, which is what catches drift from the
 * implementation.
 */

/** Error-correction level, weakest to strongest recovery. */
export type ECLevelName = 'L' | 'M' | 'Q' | 'H';

/** Text encoding for byte-mode segments. */
export type Encoding = 'utf-8' | 'latin1' | 'shift-jis';

/** Module shape a renderer draws. */
export type ModuleShape = 'square' | 'dot' | 'rounded';

/** Encoding mode name. */
export type ModeName = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';

/** Centre overlay configuration. */
export interface LogoOptions {
  /** Image source, as a URL or data URI. */
  src: string;
  /** Overlay size as a fraction of the symbol, bounded by the EC budget. */
  sizeRatio?: number;
}

/** Options accepted by every public function. Unknown keys are ignored. */
export interface QrOptions {
  /** Error-correction level. Default `'M'`. */
  ecLevel?: ECLevelName;
  /** Pin an exact version, 1 to 40. Default: the smallest that fits. */
  version?: number;
  /** Lowest version to consider. Default 1. */
  minVersion?: number;
  /** Highest version to consider. Default 40. */
  maxVersion?: number;
  /** Pin a mask pattern, 0 to 7. Default: the lowest-penalty mask. */
  mask?: number;
  /** Byte-mode text encoding. Default `'utf-8'`. */
  encoding?: Encoding;
  /** Quiet zone width in modules. Default 4, which is the spec minimum. */
  quietZone?: number;
  /** Pixels per module. Default 4. */
  scale?: number;
  /** Alias for `quietZone`; `quietZone` wins when both are given. */
  margin?: number;
  /** Colour for dark modules. Default `'#000000'`. */
  dark?: string;
  /** Background colour. Default `'#ffffff'`. */
  light?: string;
  /** Module shape. Default `'square'`. */
  shape?: ModuleShape;
  /** Centre overlay. */
  logo?: LogoOptions;
  /** Explicit ECI assignment number, overriding inference. */
  eci?: number;
  /** Accessible name, rendered as an SVG `<title>`. */
  title?: string;
}

/** One run of characters encoded in a single mode. */
export interface Segment {
  /** Mode this segment uses. */
  mode: ModeName;
  /** Characters the segment covers. */
  text: string;
  /** Character-count indicator value: characters, or bytes in byte mode. */
  charCount: number;
  /** Encoded bytes, byte mode only. */
  bytes?: Uint8Array;
}

/** The module grid. Read-only from a renderer's point of view. */
export declare class Matrix {
  constructor(version: number);
  /** Symbol version 1 to 40. */
  readonly version: number;
  /** Side length in modules. */
  readonly size: number;
  /** Whether a module is dark. */
  get(row: number, col: number): boolean;
  /** Sets a module's colour. */
  set(row: number, col: number, dark: boolean): void;
  /** Whether a module belongs to a function pattern or reserved area. */
  isFunction(row: number, col: number): boolean;
  /** Whether a coordinate lies inside the symbol. */
  contains(row: number, col: number): boolean;
  /** Independent copy, function flags included. */
  clone(): Matrix;
  /** Count of dark modules. */
  darkCount(): number;
  /** Rows of booleans. */
  toRows(): boolean[][];
}

/** A finished symbol and how it was built. */
export interface QrResult {
  /** The finished matrix, mask applied. */
  matrix: Matrix;
  /** Version actually used. */
  version: number;
  /** Error-correction level actually used. */
  ecLevel: ECLevelName;
  /** Mask pattern actually used. */
  mask: number;
  /** Side length in modules. */
  size: number;
  /** Segmentation chosen for this version. */
  segments: Segment[];
  /** ECI assignment declared, if any. */
  eci: number | undefined;
}

/** Rendering options for a matrix that has already been encoded. */
export interface RenderOptions {
  scale?: number;
  quietZone?: number;
  dark?: string;
  light?: string | null;
  shape?: ModuleShape;
  title?: string;
}

/** Options for text rendering. */
export interface AsciiOptions {
  quietZone?: number;
  /** Glyph for a dark module. Default two full blocks. */
  dark?: string;
  /** Glyph for a light module. Default two spaces. */
  light?: string;
}

/** Base class for every error this library throws. */
export declare class QrError extends Error {}

/** The data does not fit the requested version and error-correction level. */
export declare class CapacityError extends QrError {
  /** Bits the data requires. */
  needed: number;
  /** Bits the symbol provides. */
  available: number;
  /** Version the limit applies to. */
  version?: number;
  /** Error-correction level the limit applies to. */
  ecLevel?: ECLevelName;
}

/** A requested mode is unavailable, or cannot represent the input. */
export declare class ModeError extends QrError {
  /** Mode name involved. */
  mode?: string;
}

/** An option value is out of range or of the wrong type. */
export declare class OptionError extends QrError {
  /** Option key involved. */
  option?: string;
  /** The rejected value. */
  value?: unknown;
}

/** Encodes text and returns the finished symbol plus how it was built. */
export declare function qr(data: string, options?: QrOptions): QrResult;

/** Encodes text and renders it as an SVG document string. */
export declare function toSvg(data: string, options?: QrOptions): string;

/** Encodes text and renders it as monospaced text. */
export declare function toAscii(
  data: string,
  options?: QrOptions & { darkGlyph?: string; lightGlyph?: string },
): string;

/** Encodes text into a matrix, with no rendering. */
export declare function encode(data: string, options?: QrOptions): QrResult;

/** Renders an already-encoded matrix as SVG. */
export declare function matrixToSvg(matrix: Matrix, options?: RenderOptions): string;

/** Renders an already-encoded matrix as text. */
export declare function matrixToAscii(matrix: Matrix, options?: AsciiOptions): string;

/** Validates and fills in options, producing the canonical object. */
export declare function normalizeOptions(options?: QrOptions): Required<
  Pick<QrOptions, 'ecLevel' | 'minVersion' | 'maxVersion' | 'encoding' | 'quietZone' | 'scale' | 'dark' | 'light' | 'shape'>
> & QrOptions;

/** Default value for every option. */
export declare const DEFAULT_OPTIONS: QrOptions;

/** Error-correction level names. */
export declare const ECLevel: Readonly<Record<ECLevelName, ECLevelName>>;

/** Encoding mode names. */
export declare const Mode: Readonly<{
  NUMERIC: 'numeric';
  ALPHANUMERIC: 'alphanumeric';
  BYTE: 'byte';
  KANJI: 'kanji';
}>;

/** Largest supported version. */
export declare const MAX_VERSION: 40;

/** Smallest supported version. */
export declare const MIN_VERSION: 1;
