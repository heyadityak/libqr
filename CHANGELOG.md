# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is [semver](https://semver.org/spec/v2.0.0.html).

Any change to a rendered symbol's modules is at minimum a minor bump; changing a default option value is a major.

## [Unreleased]

### Fixed

- **Examples failed with a bare `404 /src/index.js` when the server was rooted at `examples/`** instead of the repository. The pages import `../src/index.js`, which a server rooted one level too deep cannot reach — an easy mistake with `cd examples && npx http-server`, and the browser's error said nothing about the cause. Each page now loads the library through `examples/boot.js`, which on failure replaces the page with an explanation and the two commands that work. Covered by tests that serve `examples/` deliberately and assert the panel appears.
- `examples/element.html` never populated its status line. The elements render in `connectedCallback`, which the parser triggers before the page's module script runs, so the first `qr-render` event was always missed. Now reads `element.result` at startup and uses events for subsequent renders — the correct pattern for any declarative custom element, and now documented in `docs/api.md`.

### Added

- 21 browser tests covering the example pages, including five that serve the wrong root and assert the guidance appears. They are documentation that consumers copy, and they had no coverage at all — `examples/` is excluded from lint and no test loaded the pages, which is why the bug above shipped unnoticed. Each page is now checked twice: that it loads clean, and that it does what it claims.

## [0.2.0] - 2026-08-24

Feature-complete: every encoding mode, every renderer.

### Added

- **Kanji mode** — `libqr/kanji`. Thirteen bits per character against byte mode's 24 for the same character in UTF-8, close to a 2× saving on Japanese text. Import to register it; the optimiser then uses it wherever it wins, without needing `encoding: 'shift-jis'`. Both ISO/IEC 18004 §8.4.5 worked examples reproduce their published bit strings exactly, and 26 round-trip cases confirm it against a third-party decoder.

  The Shift-JIS mapping is **derived from the platform's own decoder** rather than shipped as a table, which makes the entry point 1.03 KB instead of roughly 14 KB and takes the data from an authoritative source instead of a hand-transcribed one. Coverage is JIS X 0208, which includes Greek, Cyrillic, and enclosed symbols as well as kanji.

- **Centre logos** — `libqr/logo`. Bounded by two independent limits: the error-correction budget, and keeping the finder patterns clear. The second is the harder one — function patterns carry no error correction, so covering a finder makes the symbol undetectable rather than merely damaged.

- **`overlay` render option** — raw SVG markup drawn over the modules, in module coordinates. `libqr/logo` produces one for a logo; a caption or a frame is equally valid.

- **Canvas and PNG rendering**, the **`<qr-code>` element**, and **`mount()`** — see below, all landed in this cycle.
- `docs/api.md`, a release workflow, and examples for canvas, the element, and logos.

### Changed

- **`logo` option removed; use `overlay` with `libqr/logo`.** In the default path the logo cost 570 bytes and pushed `libqr/svg` 50% past its budget — for decoration. Behind an entry point it costs the default path 13 bytes. Never shipped in a release, so nothing external breaks.
- `libqr/kanji`'s budget tightened from 12 KB to 1.5 KB, since the table it was sized for is no longer shipped.

### Fixed

- **`encoding: 'latin1'` silently substituted `?`** for any character above U+00FF, so a payload could decode to different text than was supplied, with no error. Now throws a `ModeError` naming the character. Same silent-wrong-output class as the shift-jis bug fixed in the previous cycle, found while adding Kanji.
- **Byte-mode cost under `encoding: 'shift-jis'`** counted every character as one byte, which made byte mode look cheaper than Kanji mode for short Japanese runs — and then failed when the bytes were actually produced. Kanji now wins as it should.

## [0.1.1] - 2026-08-24

### Added

- **Canvas rendering** — `libqr/canvas` exports `matrixToCanvas(ctx, matrix, options)` and `canvasSizeFor`. The caller supplies the context, so the module never creates one and never has to detect its environment.
- **PNG output** — `libqr/png` exports `matrixToDataUrl` and `matrixToBlob`, preferring `OffscreenCanvas` and falling back to a DOM canvas.
- **The `<qr-code>` custom element** — `libqr/element`, defined on import. Attributes are reflected. Failures land on `element.error` and fire `qr-error` rather than throwing from a lifecycle callback.
- **`mount(target, data, options)`** — also from `libqr/element`. Unlike the element it throws, because it is called directly and the caller gets a usable stack.
- Bundled output: `dist/*.{esm.js,esm.min.js,cjs,iife.min.js}` per entry point.
- `npm run size` — per-entry-point gzip budgets, enforced in CI. Fails on exceeding a budget **and** on any growth against the committed baseline.
- `npm run check:bundles`, `npm run bench`, `npm run serve`, and a browser suite of 52 Playwright tests.

### Fixed

- `encoding: 'shift-jis'` silently produced a **UTF-8** symbol instead of erroring. Now throws a `ModeError` naming the entry point to import.

## [0.1.0] - 2026-08-24

First working release. Encoding is complete and spec-tested; rendering covers SVG and text.

### Added

- `qr(data, options)` — encode to a finished matrix, with the version, mask, and segmentation actually used.
- `toSvg(data, options)` — encode and render an SVG document string. Works in Node and the browser; no DOM involved.
- `toAscii(data, options)` — encode and render monospaced text, for terminals and debugging.
- `encode(data, options)` — matrix only, no rendering.
- `matrixToSvg(matrix, options)` and `matrixToAscii(matrix, options)` for consumers that already hold a matrix.
- `normalizeOptions(options)` and `DEFAULT_OPTIONS`, so custom renderers can share the canonical option shape.
- Typed errors: `QrError`, `CapacityError`, `ModeError`, `OptionError`, each carrying structured data rather than only a message.
- All 40 versions, all four error-correction levels, all eight mask patterns.
- Numeric, alphanumeric, and byte modes, with exact optimal mixed-mode segmentation via a dynamic program over sixths of a bit.
- Automatic ECI 26 for non-ASCII payloads, and an `eci` option to override inference.
- Module shapes `square`, `dot`, and `rounded`. Square modules merge into horizontal runs, which keeps SVG output compact.

### Notes

- Zero runtime dependencies, and a CI check that keeps it that way.
- 491 tests. Every encoding stage is asserted against ISO/IEC 18004 worked examples: the published bitstreams for `HELLO WORLD` and `01234567`, the version 1 codeword sequences, generator polynomials for degrees 7/10/13/17, format bits for all 32 level-and-mask combinations, and version bits for versions 7 to 40.
- Function-pattern geometry is cross-checked against the independently derived module counts for all 40 versions, matching the published remainder-bit table exactly.
