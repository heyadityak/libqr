/**
 * Bundling. ESM, CJS, and a browser-global IIFE per entry point.
 *
 * `src/` ships as-is and is directly consumable (ADR-0002), so this exists for
 * consumers who want a single file, a `<script>` tag, or CommonJS -- not because
 * the source needs compiling.
 *
 * The minified builds strip `assert()`, which ADR-0009 requires: internal
 * invariant checks must not exist in production, so nothing can come to depend
 * on them for validating consumer input.
 */
import { existsSync } from 'node:fs';
import terser from '@rollup/plugin-terser';
import { ENTRIES } from './build/entries.js';

/** Terser settings shared by every minified build. */
const minify = (extra = {}) => terser({
  ecma: 2022,
  compress: {
    // ADR-0009: assert() is a development-only invariant check. Marking it pure
    // lets terser drop every call, after which the function itself is
    // unreferenced and goes too.
    pure_funcs: ['assert'],
    passes: 3,
    unsafe_arrows: true,
  },
  format: { comments: false },
  ...extra,
});

const banner = '/*! libqr | MIT | https://github.com/libqr */';

export default ENTRIES
  .filter((entry) => existsSync(entry.input))
  .flatMap(({ input, file, name }) => {
    // The IIFE global for the default entry is `libqr`; sub-entries get a
    // suffixed global so two of them can coexist on a page.
    const globalName = name === '.' ? 'libqr' : `libqr_${name.replace('./', '')}`;

    return [
      {
        input,
        output: [
          { file: `dist/${file}.esm.js`, format: 'es', banner },
          { file: `dist/${file}.esm.min.js`, format: 'es', plugins: [minify()], banner },
          { file: `dist/${file}.cjs`, format: 'cjs', exports: 'named', banner },
          {
            file: `dist/${file}.iife.min.js`,
            format: 'iife',
            name: globalName,
            plugins: [minify()],
            banner,
          },
        ],
      },
    ];
  });
