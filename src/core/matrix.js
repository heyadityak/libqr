/**
 * The module grid.
 *
 * Per ADR-0004 this is the boundary type between encoding and rendering: it
 * carries module data only, no colours and no output-space coordinates.
 * Renderers read it and never mutate it.
 *
 * Storage is a single `Uint8Array` of size^2 with two bit flags per module. A
 * version 40 symbol is 177x177, so that is about 31 KB -- small enough to make
 * the eight mask evaluation passes cheap, which is the operation this layout is
 * chosen for.
 */
import { sizeForVersion } from './constants.js';

const DARK = 0b01;
const FUNCTION = 0b10;

/** A grid of QR modules, with function patterns marked as reserved. */
export class Matrix {
  /** @param {number} version symbol version 1..40 */
  constructor(version) {
    /** @type {number} */
    this.version = version;
    /** @type {number} */
    this.size = sizeForVersion(version);
    this._cells = new Uint8Array(this.size * this.size);
  }

  /**
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @returns {boolean} true if the module is dark
   */
  get(row, col) {
    return (this._cells[row * this.size + col] & DARK) !== 0;
  }

  /**
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @param {boolean} dark whether the module should be dark
   * @returns {void}
   */
  set(row, col, dark) {
    const index = row * this.size + col;
    if (dark) this._cells[index] |= DARK;
    else this._cells[index] &= ~DARK;
  }

  /**
   * Whether a module belongs to a function pattern or a reserved area, and so
   * must not receive data or be flipped by a mask.
   *
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @returns {boolean} true if reserved
   */
  isFunction(row, col) {
    return (this._cells[row * this.size + col] & FUNCTION) !== 0;
  }

  /**
   * Marks a module as a function pattern and sets its value.
   *
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @param {boolean} dark whether the module should be dark
   * @returns {void}
   */
  setFunction(row, col, dark) {
    const index = row * this.size + col;
    this._cells[index] = FUNCTION | (dark ? DARK : 0);
  }

  /**
   * Reserves a module without committing a value, for areas written later --
   * format and version information.
   *
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @returns {void}
   */
  reserve(row, col) {
    this._cells[row * this.size + col] |= FUNCTION;
  }

  /**
   * Whether a coordinate lies inside the symbol.
   *
   * @param {number} row zero-based row
   * @param {number} col zero-based column
   * @returns {boolean} true if within bounds
   */
  contains(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  /**
   * Independent copy, function flags included.
   *
   * Mask selection evaluates eight candidates, so this is on a warm path.
   *
   * @returns {Matrix} a copy sharing no state with this matrix
   */
  clone() {
    const copy = new Matrix(this.version);
    copy._cells.set(this._cells);
    return copy;
  }

  /**
   * Count of dark modules across the whole symbol.
   *
   * @returns {number} number of dark modules
   */
  darkCount() {
    let count = 0;
    for (let i = 0; i < this._cells.length; i += 1) {
      if (this._cells[i] & DARK) count += 1;
    }
    return count;
  }

  /**
   * Rows of booleans, for renderers that want a plain structure.
   *
   * @returns {boolean[][]} `size` rows of `size` booleans
   */
  toRows() {
    const rows = [];
    for (let row = 0; row < this.size; row += 1) {
      const cells = new Array(this.size);
      for (let col = 0; col < this.size; col += 1) cells[col] = this.get(row, col);
      rows.push(cells);
    }
    return rows;
  }
}

/**
 * Writes codewords into the data region in the spec's zigzag order.
 *
 * Columns are walked in pairs from the right edge leftwards, alternating upward
 * and downward, skipping the vertical timing pattern in column 6. Function
 * modules are stepped over rather than overwritten.
 *
 * A symbol can have up to 7 remainder bits that no codeword reaches; those are
 * left light, which is what the spec requires.
 *
 * @param {Matrix} matrix matrix with function patterns already placed
 * @param {Uint8Array} codewords interleaved codewords
 * @returns {void}
 */
export function placeCodewords(matrix, codewords) {
  const totalBits = codewords.length * 8;
  let bit = 0;

  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern; the pair shifts left past it.
    if (right === 6) right = 5;

    for (let vertical = 0; vertical < matrix.size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        // Derived from the column index so the column-6 shift does not break
        // the alternation.
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? matrix.size - 1 - vertical : vertical;

        if (matrix.isFunction(row, col) || bit >= totalBits) continue;

        const dark = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        matrix.set(row, col, dark);
        bit += 1;
      }
    }
  }
}

/**
 * Number of modules available for data at a version, function patterns
 * excluded. Useful for asserting the codeword count lines up with the geometry.
 *
 * @param {Matrix} matrix matrix with function patterns already placed
 * @returns {number} count of non-function modules
 */
export function dataModuleCount(matrix) {
  let count = 0;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.isFunction(row, col)) count += 1;
    }
  }
  return count;
}
