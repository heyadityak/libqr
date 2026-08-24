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

### Rendering a matrix you already have

```js
import { qr, matrixToSvg } from 'libqr';

const { matrix } = qr('DATA');
const small = matrixToSvg(matrix, { scale: 2 });
const large = matrixToSvg(matrix, { scale: 16, shape: 'dot' });
```

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
| `libqr/svg` | `matrixToSvg` alone |
| `libqr/canvas` | Canvas rendering |
| `libqr/png` | PNG output |
| `libqr/kanji` | Shift-JIS mode. Import for side effect to enable `encoding: 'shift-jis'`. |
| `libqr/element` | The `<qr-code>` custom element |

## Status

Under construction. Complete and tested: encoding through to SVG and text output, all 40 versions, all four error-correction levels, all eight masks, numeric / alphanumeric / byte modes, and ECI. Canvas, PNG, Kanji mode, the custom element, and logo overlays are not built yet.

## Contributing

`AGENTS.md` is the operating manual — layering rules, testing requirements, and conventions. `docs/adr/` records why each of those rules exists.

```sh
npm run lint          # layer boundaries, purity, typed errors
npm test              # unit, golden, and roundtrip suites
npm run test:types    # the hand-written .d.ts against real call sites
npm run check:deps    # asserts the dependency list is still empty
npm run check:tables  # asserts the committed spec tables match their generator
```

## License

MIT
