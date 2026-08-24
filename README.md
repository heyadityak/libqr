# libqr

QR code generation for the browser and Node. Zero runtime dependencies, ES modules, spec-compliant.

```js
import { toSvg } from 'libqr';

document.querySelector('#code').innerHTML = toSvg('https://example.com');
```

## Why another one

- **No dependencies.** Not one, permanently. Nothing transitive to audit, nothing extra in your bundle.
- **Spec-compliant, and tested that way.** An incorrect QR code usually still scans on a phone, which makes "I scanned it and it worked" a misleading signal. Every encoding stage is checked against ISO/IEC 18004 worked examples, bit for bit.
- **Works everywhere.** The default renderer produces an SVG *string*, so it runs in a browser, in Node, in a worker, and during server-side rendering, with no DOM and no polyfills.
- **Small.** The default path — encode plus SVG — targets under 8 KB min+gzip. Optional features live behind separate entry points so you do not pay for what you do not import.

## Install

```sh
npm install libqr
```

Node 18 or newer. Any evergreen browser.

## Usage

### SVG (the default)

```js
import { toSvg } from 'libqr';

const svg = toSvg('HELLO WORLD', {
  ecLevel: 'Q',
  scale: 8,
  dark: '#1a1a2e',
  light: '#eaeaea',
});
```

### The matrix, without rendering

```js
import { qr } from 'libqr';

const { matrix, version, mask, size } = qr('https://example.com');

for (let row = 0; row < size; row += 1) {
  for (let col = 0; col < size; col += 1) {
    if (matrix.get(row, col)) paintYourOwnThing(row, col);
  }
}
```

### Terminal output

```js
import { toAscii } from 'libqr';

console.log(toAscii('HELLO WORLD', { quietZone: 2 }));
```

### Canvas

```js
import { qr } from 'libqr';
import { matrixToCanvas } from 'libqr/canvas';

const ctx = document.querySelector('canvas').getContext('2d');
matrixToCanvas(ctx, qr('https://example.com').matrix, { scale: 8 });
```

### PNG

```js
import { qr } from 'libqr';
import { matrixToDataUrl, matrixToBlob } from 'libqr/png';

img.src = await matrixToDataUrl(qr('DATA').matrix, { scale: 8 });
const blob = await matrixToBlob(qr('DATA').matrix, { scale: 8 });
```

### The `<qr-code>` element

```html
<script type="module">import 'libqr/element';</script>
<qr-code data="https://example.com" ec-level="Q" scale="6"></qr-code>
```

Attributes are reflected, so changing one re-renders. The element reports failures on itself — `element.error` — and fires `qr-render` and `qr-error`, rather than throwing from a lifecycle callback where a page author has no useful call site.

### Mounting imperatively

```js
import { mount } from 'libqr/element';

const code = mount('#container', 'https://example.com', { ecLevel: 'Q' });
code.update('https://example.com/updated');
code.destroy();
```

### Rendering a matrix you already have

```js
import { qr, matrixToSvg } from 'libqr';

const { matrix } = qr('DATA');
const small = matrixToSvg(matrix, { scale: 2 });
const large = matrixToSvg(matrix, { scale: 16, shape: 'dot' });
```

**Why two imports for canvas and PNG?** So their weight stays out of bundles that do not use them, and so each entry point's size budget measures what that renderer actually costs. `libqr` itself only ever contains encoding, SVG, and text output.

## Options

Every function takes the same options object. Unknown keys are ignored, so passing an option from a newer version against an older install degrades rather than breaks.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `ecLevel` | `'L' \| 'M' \| 'Q' \| 'H'` | `'M'` | Error-correction level. Roughly 7 / 15 / 25 / 30% recovery. |
| `version` | `1`–`40` | smallest that fits | Pin an exact version. |
| `minVersion` | `1`–`40` | `1` | Lowest version to consider. |
| `maxVersion` | `1`–`40` | `40` | Highest version to consider. |
| `mask` | `0`–`7` | lowest penalty | Pin a mask pattern. |
| `encoding` | `'utf-8' \| 'latin1' \| 'shift-jis'` | `'utf-8'` | Byte-mode text encoding. |
| `quietZone` | integer | `4` | Quiet zone in modules. 4 is the spec minimum. |
| `scale` | integer | `4` | Pixels per module. |
| `margin` | integer | — | Alias for `quietZone`; `quietZone` wins if both are set. |
| `dark` | CSS colour | `'#000000'` | Dark module colour. |
| `light` | CSS colour | `'#ffffff'` | Background colour. Pass `null` for transparent. |
| `shape` | `'square' \| 'dot' \| 'rounded'` | `'square'` | Module shape. |
| `eci` | `0`–`999999` | inferred | Explicit ECI assignment, overriding inference. |
| `title` | string | — | Accessible name, rendered as an SVG `<title>`. |

Non-ASCII payloads get an ECI 26 (UTF-8) designator automatically, so they decode reliably rather than depending on the reader's default character set.

## Errors

All errors extend `QrError`, and carry structured data so you can react without matching on message text.

```js
import { toSvg, CapacityError } from 'libqr';

try {
  toSvg(veryLongPayload, { ecLevel: 'H', maxVersion: 10 });
} catch (error) {
  if (error instanceof CapacityError) {
    console.log(`needs ${error.needed} bits, version ${error.version} holds ${error.available}`);
  }
}
```

| Error | Thrown when |
| --- | --- |
| `CapacityError` | The data does not fit. Carries `needed`, `available`, `version`, `ecLevel`. |
| `ModeError` | A mode is unavailable — most often Kanji without its entry point. Carries `mode`. |
| `OptionError` | An option is out of range or the wrong type. Carries `option`, `value`. |

## Entry points

The default entry point holds encoding, SVG, and text output. Everything else is opt-in, so its weight stays out of bundles that do not use it.

| Import | Contents |
| --- | --- |
| `libqr` | `qr`, `toSvg`, `toAscii`, `encode`, `matrixToSvg`, `matrixToAscii`, errors, constants |
| `libqr/svg` | `matrixToSvg` |
| `libqr/canvas` | `matrixToCanvas`, `canvasSizeFor` |
| `libqr/png` | `matrixToDataUrl`, `matrixToBlob` |
| `libqr/element` | `<qr-code>` (defined on import), `QrCodeElement`, `defineElement`, `mount` |
| `libqr/kanji` | Shift-JIS mode. Import for side effect to enable `encoding: 'shift-jis'`. Not built yet. |

## Size

Measured on the minified ESM bundle, gzipped:

| Entry | Size | Budget |
| --- | --- | --- |
| `libqr` — encode + SVG + text | **6.99 KB** | 8 KB |
| `libqr/svg` | 0.84 KB | 1 KB |
| `libqr/canvas` | 0.74 KB | 1 KB |
| `libqr/png` | 1.17 KB | 1.5 KB |
| `libqr/element` | +336 B over `libqr` | +512 B |

Enforced in CI, per entry point, and the gate fails on growth as well as on exceeding a budget. Internal invariant checks are stripped from the minified builds, so they cost nothing in production.

`libqr/element` is measured as a delta because a custom element is driven by attributes — there is no call site to hand it a matrix, so it necessarily contains the encoder. Its total is 7.32 KB; the 336 bytes — the element plus `mount()` — is the number that tells you what they cost.

## Status

Under construction. Complete and tested: encoding through to SVG, canvas, PNG, and text output; the `<qr-code>` element and `mount()`; all 40 versions, all four error-correction levels, all eight masks, numeric / alphanumeric / byte modes, ECI; and bundled ESM / CJS / IIFE output.

Not built yet: Kanji mode and logo overlays. `libqr/kanji` is declared in `exports` but does not resolve; passing `encoding: 'shift-jis'` throws a `ModeError` naming the entry point to import, rather than silently producing something else.

## Contributing

`AGENTS.md` is the operating manual — layering rules, testing requirements, and conventions. `docs/adr/` records why each of those rules exists.

```sh
npm run lint            # layer boundaries, purity, typed errors
npm test                # unit, golden, and roundtrip suites
npm run test:types      # the hand-written .d.ts against real call sites
npm run check:deps      # asserts the dependency list is still empty
npm run check:tables    # asserts the committed spec tables match their generator
npm run build           # bundles into dist/
npm run size            # per-entry gzip budgets; also fails on any growth
npm run check:bundles   # the built bundles load and encode
npm run bench           # performance guards
npm run test:browser    # canvas, PNG, and <qr-code> in Chromium
npm run serve           # static server for examples/ and the browser harness
```

`npm run size` fails on growth as well as on exceeding a budget, so an increase has to be recorded deliberately with `npm run size:accept`. That puts the new number in the diff where a reviewer sees it, instead of letting the budget drift up a few bytes at a time.

## License

MIT
