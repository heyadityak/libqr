# API reference

Every entry point, every export. See `README.md` for a task-oriented introduction.

## Entry points

The default entry holds encoding, SVG, and text output. Everything else is opt-in, so its weight stays out of bundles that do not use it ([ADR-0006](adr/0006-multiple-entry-points-size-budget.md)).

| Import | Contents | Size (gzip) |
| --- | --- | --- |
| `libqr` | encoding, SVG, text | 7.16 KB |
| `libqr/svg` | `matrixToSvg` | 0.85 KB |
| `libqr/canvas` | canvas rendering | 0.74 KB |
| `libqr/png` | PNG output | 1.17 KB |
| `libqr/logo` | centre-overlay budgeting | 1.06 KB |
| `libqr/element` | `<qr-code>`, `mount` | +333 B over `libqr` |
| `libqr/kanji` | Shift-JIS mode | 1.03 KB |

Sub-entries take a matrix rather than encoding for you, so each bundle is the marginal cost of that feature ([ADR-0015](adr/0015-renderer-only-sub-entry-points.md)).

---

## `libqr`

### `qr(data, options?) => QrResult`

Encodes and returns the finished symbol plus how it was built.

```js
const { matrix, version, ecLevel, mask, size, segments, eci } = qr('HELLO WORLD');
```

| Field | Meaning |
| --- | --- |
| `matrix` | the finished symbol; `matrix.get(row, col)` is true for a dark module |
| `version` | 1–40, the version actually used |
| `ecLevel` | the error-correction level actually used |
| `mask` | 0–7, the mask actually applied |
| `size` | side length in modules, always `4 × version + 17` |
| `segments` | the segmentation chosen, one entry per mode run |
| `eci` | the ECI assignment declared, or `undefined` |

### `toSvg(data, options?) => string`

Encodes and renders an SVG document string. Works in Node and the browser — the output is a string, with no DOM involved ([ADR-0005](adr/0005-svg-default-renderer.md)).

### `toAscii(data, options?) => string`

Encodes and renders monospaced text. Accepts `darkGlyph` and `lightGlyph` alongside the usual options. Intended for terminals and debugging.

### `encode(data, options?) => QrResult`

The same as `qr`. Present because a function called `encode` is what people look for.

### `matrixToSvg(matrix, renderOptions?) => string`

Renders a matrix you already have. Useful for producing several sizes from one encode.

### `matrixToAscii(matrix, asciiOptions?) => string`

Text rendering for a matrix you already have.

### `normalizeOptions(options?) => canonical options`

Validates and fills in options, returning the frozen canonical object the internals use. Useful when building a custom renderer that should honour the same defaults.

### `DEFAULT_OPTIONS`

The default value of every option.

### Constants

`ECLevel`, `Mode`, `MIN_VERSION` (1), `MAX_VERSION` (40).

### `Matrix`

The boundary type between encoding and rendering ([ADR-0004](adr/0004-pure-core-matrix-boundary.md)). Renderers read it and never mutate it.

| Member | Meaning |
| --- | --- |
| `size` | side length in modules |
| `version` | 1–40 |
| `get(row, col)` | true if the module is dark |
| `isFunction(row, col)` | true for finder, timing, alignment, format and version areas |
| `contains(row, col)` | true if the coordinate is inside the symbol |
| `clone()` | independent copy |
| `darkCount()` | number of dark modules |
| `toRows()` | `boolean[][]` |

---

## Options

One object, accepted by every function. Unknown keys are ignored, so an option from a newer version degrades against an older install rather than breaking ([ADR-0009](adr/0009-boundary-validation-typed-errors.md)).

### Encoding

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `ecLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Roughly 7 / 15 / 25 / 30% recovery. |
| `version` | `1`–`40` | smallest that fits | Pins the version exactly. |
| `minVersion` | `1`–`40` | `1` | |
| `maxVersion` | `1`–`40` | `40` | |
| `mask` | `0`–`7` | lowest penalty | Pins the mask. Auto is almost always right. |
| `encoding` | `'utf-8' \| 'latin1' \| 'shift-jis'` | `'utf-8'` | Byte-mode character set. `'shift-jis'` requires `libqr/kanji`. |
| `eci` | `0`–`999999` | inferred | Overrides ECI inference, including suppressing it. |

### Rendering

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `scale` | integer ≥ 1 | `4` | Pixels per module. |
| `quietZone` | integer ≥ 0 | `4` | Modules. 4 is the spec minimum; less scans badly on busy backgrounds. |
| `margin` | integer | — | Alias for `quietZone`; `quietZone` wins if both are set. |
| `dark` | CSS colour | `'#000000'` | |
| `light` | CSS colour or `null` | `'#ffffff'` | `null` leaves the background untouched. |
| `shape` | `'square' \| 'dot' \| 'rounded'` | `'square'` | Square modules merge into runs, which keeps SVG compact. |
| `title` | string | — | Accessible name, rendered as `<title>`. |
| `overlay` | string | — | Raw SVG markup drawn over the modules, in module coordinates. Not escaped. See `libqr/logo`. |

### Character sets

Pure ASCII needs no ECI designator. Anything else gets one automatically, because a decoder's default character set is reader-dependent:

| Input | Mode | ECI |
| --- | --- | --- |
| ASCII | numeric / alphanumeric / byte | none |
| non-ASCII, `encoding: 'utf-8'` | byte | 26 |
| non-ASCII, `encoding: 'latin1'` | byte | 3 |
| Japanese, with `libqr/kanji` | kanji | none — the mode carries its own set |

Mode selection is an exact optimisation, not a heuristic: a dynamic program over positions and modes, costed in sixths of a bit so numeric's 10-bits-per-3-digits and alphanumeric's 11-bits-per-2-characters are exact rather than rounded. A mode switch is taken only when it pays for its own indicators.

---

## Errors

All extend `QrError`, and carry structured data so you can react without matching on message text.

```js
try {
  toSvg(payload, { ecLevel: 'H', maxVersion: 10 });
} catch (error) {
  if (error instanceof CapacityError) {
    console.log(`needs ${error.needed} bits, version ${error.version} holds ${error.available}`);
  }
}
```

| Error | Thrown when | Carries |
| --- | --- | --- |
| `CapacityError` | the data does not fit | `needed`, `available`, `version`, `ecLevel` |
| `ModeError` | a mode is unavailable, or cannot represent the input | `mode` |
| `OptionError` | an option is out of range or the wrong type | `option`, `value` |

Every message names the input and the limit. Internal invariant checks are stripped from production builds and are never used to validate your input.

---

## `libqr/svg`

### `matrixToSvg(matrix, options?) => string`

Accepts `scale`, `quietZone`, `dark`, `light`, `shape`, `title`, `overlay`.

The symbol is drawn in module units with a `viewBox` and scaled through `width`/`height`, so path coordinates stay small integers regardless of scale.

---

## `libqr/canvas`

### `matrixToCanvas(ctx, matrix, options?) => { width, height }`

Draws into a context you supply, so the module never creates one and never has to detect its environment.

Accepts the render options plus `x`, `y` (pixel offset) and `resize` (default true — resize the backing canvas to fit). Pass `light: null` to draw over existing content.

### `canvasSizeFor(matrix, { scale?, quietZone? }) => number`

Pixel side length, without drawing. For sizing a canvas or laying out several symbols first.

---

## `libqr/png`

Browser only. Unlike SVG this needs a canvas — which is exactly why SVG is the default.

### `matrixToDataUrl(matrix, options?) => Promise<string>`

A `data:image/png;base64,...` URL.

### `matrixToBlob(matrix, options?) => Promise<Blob>`

PNG image data. Prefers `OffscreenCanvas`, falls back to a DOM canvas, and throws a `QrError` pointing at `toSvg()` where neither exists.

---

## `libqr/logo`

A logo works by *destroying* modules and relying on error correction to recover them, so its size is a safety question rather than a styling one — and it fails gradually, scanning on a clean screen and failing on a printed label. The size is therefore bounded, and asking for more throws ([ADR-0017](adr/0017-logo-overlay-behind-an-entry-point.md)).

```js
import { qr, matrixToSvg } from 'libqr';
import { logoOverlay } from 'libqr/logo';

const { matrix } = qr(url, { ecLevel: 'H' });
const svg = matrixToSvg(matrix, {
  overlay: logoOverlay(matrix, { src: dataUri, sizeRatio: 0.3 }, { ecLevel: 'H' }),
});
```

### `logoOverlay(matrix, logo, { ecLevel, quietZone? }) => string`

The `<image>` element to pass as `matrixToSvg`'s `overlay`. Validates first.

`logo` is `{ src, sizeRatio? }`. A data URI keeps the SVG self-contained; an external URL does not.

### Two independent limits

| Constraint | What bounds it | When it binds |
| --- | --- | --- |
| Error-correction budget | half the level's recovery capacity | higher versions |
| Finder clearance | 8 modules at each edge | lower versions |

The second is the harder one. Data modules are Reed-Solomon protected, so covering some is recoverable; **function patterns are not protected at all**, and covering a finder makes the symbol undetectable rather than merely damaged.

Central alignment patterns are deliberately not protected — a centred overlay covers them at most versions, decoders tolerate it, and forbidding it would make centre logos impossible.

| Level | Max side ratio (EC budget) |
| --- | --- |
| L | 0.187 |
| M | 0.274 |
| Q | 0.354 |
| H | 0.387 |

### Also exported

`maxSizeRatio(ecLevel)`, `clearanceRatio(matrix)`, `effectiveMaxSizeRatio(matrix, ecLevel)`, `validateLogo(matrix, logo, ecLevel)`, `logoGeometry(matrix, logo, { quietZone })`, `SAFETY_MARGIN`, `DEFAULT_SIZE_RATIO`, `FUNCTION_CLEARANCE`.

---

## `libqr/element`

Importing defines `<qr-code>`. That side effect is why the module is listed in the package's `sideEffects` array.

```html
<script type="module">import 'libqr/element';</script>
<qr-code data="https://example.com" ec-level="Q" scale="6"></qr-code>
```

### Attributes

`data`, `ec-level`, `version`, `mask`, `encoding`, `quiet-zone`, `scale`, `dark`, `light`, `shape`, `label`.

All reflected — changing one re-renders.

### Properties and events

| Member | Meaning |
| --- | --- |
| `element.result` | the last `QrResult`, or `null` after a failure |
| `element.error` | the last error, or `null` |
| `qr-render` | fired on success; `detail` is the `QrResult` |
| `qr-error` | fired on failure; `detail` is the error |

Failures land on `error` and fire `qr-error` rather than throwing. A lifecycle callback that throws produces an unhandled error with no useful call site for the page author.

**Events only reach listeners attached before they fire.** An element written in HTML renders during `connectedCallback`, which the parser triggers before your module script runs — so the *first* render's `qr-render` is always missed. Read `element.result` and `element.error` once at startup, and use the events for everything after:

```js
function report(code) {
  if (code.error !== null) return showError(code.error);
  if (code.result !== null) showState(code.result);
}

code.addEventListener('qr-render', () => report(code));
code.addEventListener('qr-error', () => report(code));
report(code);  // catch up on the render that already happened
```

Elements you create from script are fine — you attach listeners before inserting them. `examples/element.html` shows the pattern.

### `mount(target, data, options?) => Mounted`

The imperative equivalent. `target` is an element or a selector.

```js
const code = mount('#container', url, { ecLevel: 'Q' });
code.update(newUrl);
code.result();
code.destroy();
```

Unlike the element, `mount` **throws** — it is called directly, so the caller gets a usable stack.

---

## `libqr/kanji`

Importing registers Kanji mode. Thirteen bits per character against byte mode's 24 for the same character in UTF-8 — close to a 2× saving on Japanese text.

```js
import 'libqr/kanji';
import { toSvg } from 'libqr';

toSvg('日本語のテキスト');                             // Kanji mode, no ECI
toSvg('日本語のテキスト', { encoding: 'shift-jis' });  // also Shift-JIS byte segments
```

Once registered, the optimiser considers Kanji mode for any payload — the `encoding` option is not required. Without the import, `encoding: 'shift-jis'` throws a `ModeError` naming the entry point rather than silently producing UTF-8.

The Shift-JIS mapping is derived from the platform's own decoder rather than shipped as a table ([ADR-0016](adr/0016-derive-shift-jis-from-the-platform.md)). Built on first use and cached. Browsers are required to support Shift-JIS decoding; a Node build compiled with small-icu is not, and Kanji mode throws a clear `QrError` there.

Coverage is JIS X 0208, which is more than kanji — Greek, Cyrillic, and enclosed and CJK-compatibility symbols are all included.

### Also exported

`canEncode(codePoint)`, `countEncodable(text)`, `dataBitLength(charCount)`, `write(buffer, text)`, `encodeBytes(text)`, `NAME`, `MODE_INDICATOR`, `COUNT_BITS`, `BITS_PER_CHAR`.

`countEncodable` lets you decide whether Shift-JIS is worthwhile before committing to it, without catching an exception.
