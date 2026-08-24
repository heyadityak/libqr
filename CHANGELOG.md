# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is [semver](https://semver.org/spec/v2.0.0.html).

Any change to a rendered symbol's modules is at minimum a minor bump; changing a default option value is a major.

## [Unreleased]

### Not yet implemented

Canvas and PNG rendering, the `<qr-code>` custom element, Kanji mode, logo overlays, and the bundled `dist/` output. The `exports` map already names their entry points; those specifiers do not resolve yet.

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
