# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is [semver](https://semver.org/spec/v2.0.0.html).

Any change to a rendered symbol's modules is at minimum a minor bump; changing a default option value is a major.

## [Unreleased]

### Added

- **Canvas rendering** — `libqr/canvas` exports `matrixToCanvas(ctx, matrix, options)` and `canvasSizeFor`. The caller supplies the context, so the module never creates one and never has to detect its environment. Square modules merge into horizontal runs, so a version 40 symbol takes hundreds of `fillRect` calls rather than tens of thousands.
- **PNG output** — `libqr/png` exports `matrixToDataUrl` and `matrixToBlob`, preferring `OffscreenCanvas` and falling back to a DOM canvas. Throws a clear `QrError` pointing at `toSvg()` where neither exists.
- **The `<qr-code>` custom element** — `libqr/element`, defined on import. Attributes are reflected, so changing one re-renders. Failures land on `element.error` and fire `qr-error` rather than throwing from a lifecycle callback, where a page author would get an unhandled error with no useful call site. The whole `libqr/element` entry point — element plus `mount()` — costs **336 bytes** over `libqr`.
- **`mount(target, data, options)`** — also from `libqr/element`. Returns a handle with `update`, `destroy`, and `result`. Unlike the element it throws, because it is called directly and the caller gets a usable stack.
- Browser test suite: 52 Playwright tests covering canvas, PNG, the element, and `mount`. Each renderer test samples the centre pixel of every module and compares against the encoder's matrix, which is stricter than decoding — a lenient decoder would forgive a symbol shifted by a pixel or missing its quiet zone.
- `npm run serve` — a dependency-free static server for `examples/` and the browser harness.
- Examples for canvas plus PNG download, and for the custom element.

- Bundled output: `dist/libqr.{esm.js,esm.min.js,cjs,iife.min.js}` and the same four for `libqr/svg`. ESM consumers still resolve to `src/`, which stays tree-shakeable and debuggable; CJS consumers get the bundle.
- `npm run size` — per-entry-point gzip budgets, enforced in CI. Fails on exceeding a budget **and** on any growth against the committed baseline, so an increase has to be recorded deliberately and shows up in the diff.
- `npm run check:bundles` — smoke tests the built bundles. The test suite runs against `src/`, so a bundling mistake would otherwise reach consumers with every test green.
- `npm run bench` — performance guards over encoding, mask selection, and rendering.
- Internal `assert()` calls are stripped from minified builds, asserted by `check:bundles` in both directions.

### Fixed

- `encoding: 'shift-jis'` silently produced a **UTF-8** symbol instead of erroring, because the option was accepted by the validator and then fell through to the UTF-8 byte-length path. It now throws a `ModeError` naming the entry point to import. Caught by the new bundle smoke test.

### Not yet implemented

Kanji mode and logo overlays. `libqr/kanji` is named in the `exports` map but does not resolve yet.

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
