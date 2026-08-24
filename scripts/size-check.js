/**
 * The size gate. ADR-0006.
 *
 * Two failure conditions, both deliberate:
 *
 * 1. **Over budget.** The 8 KB default path is the product, not a preference.
 * 2. **Grown since the recorded baseline**, even while still inside budget.
 *    ADR-0011's M9 and M10 gates require the default entry to be *unchanged*
 *    after optional renderers and Kanji mode land, and "unchanged" is only
 *    checkable if growth is refused by default rather than absorbed silently.
 *
 * Growth is legitimate when a feature lands -- run with `--accept` to record the
 * new baseline, which puts the increase in the diff where a reviewer sees it.
 *
 * Usage:
 *   node scripts/size-check.js            # gate
 *   node scripts/size-check.js --accept   # gate, then record current sizes
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { ENTRIES } from '../build/entries.js';

/** Which bundle flavour the budget applies to. */
export const MEASURED_SUFFIX = '.esm.min.js';

export const BASELINE_PATH = new URL('../build/size-baseline.json', import.meta.url);
const DIST = new URL('../dist/', import.meta.url);

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const bytes = (n) => `${String(n).padStart(6)} B`;

/**
 * Applies the gate to already-measured sizes.
 *
 * Separated from measurement so the rules can be unit-tested without running a
 * bundler, and so a probe cannot only be verified by tampering with real files.
 *
 * @param {object} input
 * @param {import('../build/entries.js').Entry[]} input.entries declared entry points
 * @param {Record<string, number>} input.sizes gzipped bytes, keyed by entry name;
 *   an absent key means the entry is not built
 * @param {Record<string, number>} input.baseline recorded sizes, keyed by entry name
 * @returns {{rows: object[], skipped: object[], overBudget: string[], grown: string[]}}
 *   gate result. `overBudget` is always fatal; `grown` is fatal only without
 *   `--accept`, since accepting growth is the documented way to record it.
 */
export function evaluate({ entries, sizes, baseline }) {
  const rows = [];
  const skipped = [];
  const overBudget = [];
  const grown = [];

  const defaultSize = sizes['.'];

  for (const entry of entries) {
    const size = sizes[entry.name];

    if (size === undefined) {
      // ADR-0006: a budget nobody measures reads as a budget being met, so an
      // unbuilt entry is reported rather than passed over.
      skipped.push(entry);
      continue;
    }

    const previous = baseline[entry.name];
    const delta = previous === undefined ? null : size - previous;

    // For entries that necessarily bundle the encoder, what matters is the cost
    // over the default bundle, not the total.
    const marginal = entry.marginal !== undefined && defaultSize !== undefined
      ? size - defaultSize
      : null;

    rows.push({ entry, size, delta, marginal, headroom: entry.budget - size });

    if (size > entry.budget) {
      overBudget.push(
        `${entry.name} is ${kb(size)}, over its ${kb(entry.budget)} budget by ${bytes(size - entry.budget)}`,
      );
    } else if (marginal !== null && marginal > entry.marginal) {
      overBudget.push(
        `${entry.name} adds ${bytes(marginal)} over the default bundle, `
        + `past its ${bytes(entry.marginal)} marginal budget`,
      );
    } else if (delta !== null && delta > 0) {
      grown.push(
        `${entry.name} grew by ${bytes(delta)} (${kb(previous)} to ${kb(size)})`,
      );
    }
  }

  return { rows, skipped, overBudget, grown };
}

/**
 * Gzipped size of each built entry point.
 *
 * @param {import('../build/entries.js').Entry[]} entries declared entry points
 * @returns {Record<string, number>} gzipped bytes, keyed by entry name
 */
export function measure(entries) {
  const sizes = {};
  for (const entry of entries) {
    const bundle = new URL(`${entry.file}${MEASURED_SUFFIX}`, DIST);
    if (!existsSync(bundle)) continue;
    sizes[entry.name] = gzipSync(readFileSync(bundle), { level: 9 }).length;
  }
  return sizes;
}

/** Renders the result as the table printed to stdout. */
export function format({ rows, skipped }) {
  const width = Math.max(...rows.map((r) => r.entry.name.length));
  const lines = [
    `size-check: gzipped size of dist/*${MEASURED_SUFFIX}`,
    '',
    `  ${'entry'.padEnd(width)}   ${'size'.padStart(9)}  ${'budget'.padStart(9)}  ${'headroom'.padStart(9)}   delta`,
  ];

  for (const { entry, size, delta, marginal, headroom } of rows) {
    const deltaText = delta === null ? 'new' : delta === 0 ? '=' : `${delta > 0 ? '+' : ''}${delta} B`;
    const marginalText = marginal === null ? '' : `   (+${marginal} B over the default bundle)`;
    lines.push(
      `  ${entry.name.padEnd(width)}   ${kb(size).padStart(9)}  ${kb(entry.budget).padStart(9)}`
      + `  ${kb(headroom).padStart(9)}   ${deltaText}${marginalText}`,
    );
  }

  if (skipped.length > 0) {
    lines.push('', `  not built yet, so not measured (${skipped.length}):`);
    for (const entry of skipped) lines.push(`    ${entry.name} -- ${entry.note}`);
  }

  return lines.join('\n');
}

/** Reads the committed baseline, or an empty one on first run. */
export function readBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return {
      $comment: 'Recorded by scripts/size-check.js --accept. Gzipped bytes of each entry point.',
      sizes: {},
    };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

if (process.argv[1]?.endsWith('size-check.js')) {
  const accept = process.argv.includes('--accept');
  const baseline = readBaseline();
  const sizes = measure(ENTRIES);
  const result = evaluate({ entries: ENTRIES, sizes, baseline: baseline.sizes });

  if (result.rows.length === 0) {
    console.error('size-check: nothing measured. Run `npm run build` first.');
    process.exit(1);
  }

  console.log(format(result));

  // Exceeding a budget is never acceptable, so --accept does not override it.
  if (result.overBudget.length > 0) {
    console.error('\nsize-check FAILED -- over budget:');
    for (const failure of result.overBudget) console.error(`  - ${failure}`);
    if (accept) {
      console.error('\n  --accept does not apply to a budget overage. Make it smaller, or');
      console.error('  change the budget in build/entries.js -- deliberately, and say why in the note.');
      console.error('  Raising the default entry past 8 KB needs an ADR superseding 0006.');
    }
    process.exit(1);
  }

  // Growth inside budget is legitimate when a feature lands, but it has to be
  // recorded on purpose so the new number shows up in the diff.
  if (result.grown.length > 0 && !accept) {
    console.error('\nsize-check FAILED -- grew since the recorded baseline:');
    for (const failure of result.grown) console.error(`  - ${failure}`);
    console.error('\n  Re-run `npm run size:accept` to record it, so the increase lands in the diff.');
    process.exit(1);
  }

  if (accept) {
    baseline.sizes = { ...baseline.sizes, ...sizes };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    for (const growth of result.grown) console.log(`\n  accepted: ${growth}`);
    console.log('\nsize-check: baseline recorded in build/size-baseline.json');
  } else {
    console.log('\nsize-check: PASS');
  }
}
