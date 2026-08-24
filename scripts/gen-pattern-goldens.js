/**
 * Writes the function-pattern golden snapshots used by test/unit/core/patterns.test.js.
 *
 * Run deliberately, and review the diff -- these are the M5 gate (ADR-0011) and
 * a change to one means the symbol geometry moved.
 *
 * Usage: node scripts/gen-pattern-goldens.js
 */
import { writeFileSync } from 'node:fs';
import { Matrix } from '../src/core/matrix.js';
import { placeFunctionPatterns } from '../src/core/patterns.js';

/**
 * Renders function patterns as text: `#` dark function module, `-` light
 * function module, `.` data module.
 *
 * @param {number} version symbol version
 * @returns {string} newline-separated rows
 */
export function patternSnapshot(version) {
  const matrix = new Matrix(version);
  placeFunctionPatterns(matrix);

  const rows = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let line = '';
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.isFunction(row, col)) line += '.';
      else line += matrix.get(row, col) ? '#' : '-';
    }
    rows.push(line);
  }
  return `${rows.join('\n')}\n`;
}

const VERSIONS = [1, 7];

if (process.argv[1]?.endsWith('gen-pattern-goldens.js')) {
  for (const version of VERSIONS) {
    const target = new URL(`../test/golden/patterns-v${version}.txt`, import.meta.url);
    writeFileSync(target, patternSnapshot(version));
    console.log(`wrote test/golden/patterns-v${version}.txt`);
  }
}
