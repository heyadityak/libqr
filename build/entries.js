/**
 * The published entry points, and the gzip budget each one must stay inside.
 *
 * ADR-0006 makes this the single place budgets are declared. ADR-0011's M9 and
 * M10 gates both require the default entry's size to be **unchanged** after
 * optional renderers and Kanji mode land, so this file is what makes those
 * gates checkable at all.
 *
 * Entries whose source does not exist yet are reported by `size-check` as
 * skipped rather than passed over quietly -- a budget nobody measures reads as a
 * budget being met.
 *
 * Most entries are renderer-only, so their bundle *is* their marginal cost
 * (ADR-0015). `./element` is the exception: a custom element has to encode for
 * you, so it necessarily contains the whole encoder. For those, `marginal` says
 * what the entry costs *over* the default bundle, which is the number that
 * actually tells you whether the feature is cheap.
 */

/**
 * @typedef {object} Entry
 * @property {string} name the `exports` specifier, relative to the package root
 * @property {string} input source file
 * @property {string} file bundle basename, without extension
 * @property {number} budget maximum bytes after minification and gzip
 * @property {number} [marginal] maximum bytes this entry may add *over* the
 *   default entry, for entries that necessarily bundle the encoder
 * @property {string} note what the budget covers, and why it is what it is
 */

/** @type {Entry[]} */
export const ENTRIES = [
  {
    name: '.',
    input: 'src/index.js',
    file: 'libqr',
    budget: 8 * 1024,
    note: 'encode + SVG + text. The headline number ADR-0006 exists to defend.',
  },
  {
    name: './svg',
    input: 'src/render/svg.js',
    file: 'libqr-svg',
    budget: 1024,
    note: 'renderer alone, for consumers that already hold a matrix',
  },
  {
    name: './canvas',
    input: 'src/render/canvas.js',
    file: 'libqr-canvas',
    budget: 1024,
    note: 'M9, not built yet',
  },
  {
    name: './png',
    input: 'src/render/png.js',
    file: 'libqr-png',
    budget: 1536,
    note: 'M9, not built yet',
  },
  {
    name: './kanji',
    input: 'src/encode/kanji.js',
    file: 'libqr-kanji',
    budget: 1536,
    note: 'Shift-JIS support. Budgeted at 12 KB while it was assumed to ship a '
      + 'mapping table; ADR-0016 derives that from the platform instead, so the '
      + 'real figure is under a kilobyte and the budget was tightened to match.',
  },
  {
    name: './logo',
    input: 'src/render/logo.js',
    file: 'libqr-logo',
    budget: 1280,
    note: 'centre-overlay budgeting and its SVG element. Its own entry point '
      + 'because it is decoration, and it would otherwise cost the default path '
      + '570 bytes and push libqr/svg 50% past its budget (ADR-0017). Budgeted at '
      + '1 KB before the finder-clearance constraint existed; raised to 1.25 KB '
      + 'for the second constraint and its error messages, which are most of the '
      + 'weight and are the point.',
  },
  {
    name: './element',
    input: 'src/dom/element.js',
    file: 'libqr-element',
    budget: 8 * 1024,
    marginal: 512,
    note: 'the <qr-code> element plus the encoder it has to contain -- a custom '
      + 'element cannot be handed a matrix, so the meaningful figure is `marginal`',
  },
];
