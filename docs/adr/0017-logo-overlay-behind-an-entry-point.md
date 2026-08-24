---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§3"]
---

# ADR-0017: Logo overlays live behind an entry point, via a generic overlay hook

## Context and Problem Statement

`AGENTS.md` §3 listed `logo` in the options table from the start, so the first implementation put it in the default path: `matrixToSvg` grew a `logo` option, and `render/shared/logo.js` held the budget arithmetic.

The size gate rejected it. Measured cost:

| Entry | Before | After | Budget |
| --- | --- | --- | --- |
| `.` | 6.99 KB | 7.60 KB | 8 KB |
| `./svg` | 0.84 KB | **1.45 KB** | 1 KB |

570 bytes on the default path for a decorative feature, and `./svg` half again over budget. Accommodating it meant raising a renderer's budget by 50% for decoration -- which is precisely the drift [ADR-0006](0006-multiple-entry-points-size-budget.md)'s gate exists to catch.

Moving the recovery-capacity figures out of the generated spec tables saved three bytes. The weight was the logo code itself plus the error class it needed, not the tables.

## Decision

Two parts.

**`matrixToSvg` gains a generic `overlay` option**: a string of SVG markup, in module coordinates including the quiet zone, appended after the modules. Thirteen bytes on `./svg`. It is not escaped -- it is markup, and the caller owns it.

**Logo policy moves to its own entry point**, `libqr/logo`, exporting `logoOverlay`, `validateLogo`, `logoGeometry`, `maxSizeRatio`, `clearanceRatio`, and `effectiveMaxSizeRatio`.

```js
import { qr, matrixToSvg } from 'libqr';
import { logoOverlay } from 'libqr/logo';

const { matrix } = qr(url, { ecLevel: 'H' });
const svg = matrixToSvg(matrix, {
  overlay: logoOverlay(matrix, { src: dataUri, sizeRatio: 0.3 }, { ecLevel: 'H' }),
});
```

The `logo` option is **removed** from the options object; `overlay` replaces it. `AGENTS.md` §3 has been updated.

The overlay is bounded by **two** independent constraints, which the entry point enforces together:

1. **The error-correction budget** -- half the level's recovery capacity, leaving the other half for the damage error correction actually exists for. Covering more produces a symbol that scans on a clean screen and fails on a printed label.
2. **Finder-pattern clearance** -- eight modules at each edge. This is a harder limit of a different kind: data modules are Reed-Solomon protected, so covering some is recoverable, but **function patterns carry no error correction at all**. Covering a finder makes the symbol undetectable, not merely damaged. This constraint binds at low versions, where the error-correction budget alone would permit an overlay reaching into a corner.

Central alignment patterns are deliberately *not* protected: a centred overlay covers them at most versions, decoders tolerate it because the finders and timing patterns remain, and forbidding it would make centre logos impossible.

## Consequences

### Good

- The default path pays 13 bytes instead of 570, and `./svg` stays inside its budget.
- The `overlay` hook is more useful than the `logo` option it replaced. A caption, a frame, a brand mark, a status badge -- all now possible without the library shipping code for each.
- Both safety constraints live in one place with the reasoning attached, rather than a size check buried in a renderer.
- `logoOverlay` refuses rather than warns, so an unscannable symbol cannot be produced by accident. The messages name the limit *and* the remedy.
- The finder-clearance constraint was found by a test, not in the field -- a maximum-size overlay on a version 1 symbol reached a finder pattern.

### Bad / costs

- **A documented option was removed.** `logo` never shipped in a release, so nothing external breaks, but `AGENTS.md` promised it and the promise changed.
- Composing an overlay is three lines where one option would have done, and the caller has to pass `ecLevel` to `logoOverlay` separately -- it takes a matrix, and a matrix does not carry the level it was built with.
- `overlay` is unescaped raw markup. That is the point, but it means a caller interpolating untrusted text into it has an injection they own. Documented.
- Two size limits rather than one is more to understand, and the error tells you which bound you hit only by its wording.

## Alternatives Considered

- **Keep `logo` in the default path and raise `./svg`'s budget to 1.5 KB.** Rejected -- raising a budget by half to fit decoration is exactly the drift the gate exists to prevent. If budgets move whenever something does not fit, they measure nothing.
- **Keep `logo` in the default path and accept the 570 bytes**, leaving 0.40 KB of headroom. Rejected -- it still breaks `./svg`, and spending most of the remaining headroom on decoration before the library is finished is the wrong priority.
- **A `logo` option resolved through the mode registry**, mirroring how Kanji opts in. Rejected -- that machinery exists because Kanji has to participate in the segmentation optimiser. An overlay is drawn last and needs no such integration, so the indirection would buy nothing.
- **String surgery on the finished SVG** from a `libqr/logo` helper -- `withLogo(svg, ...)`. Rejected -- parsing and reassembling markup we just generated, when a hook costs 13 bytes.
- **Enforce the finder clearance only, dropping the error-correction budget.** Rejected -- clearance alone permits an overlay covering 90% of a version 40 symbol, which is unreadable long before it touches a finder.

## Enforcement

- `test/unit/render/logo.test.js` asserts both constraints, including that each is the binding one where it should be, and that the geometric limit holds at the effective maximum for every level across versions 1 to 40.
- The size gate holds `.` and `./svg` to their budgets and fails on any growth, so logo code returning to the default path fails the build.
- `test/unit/public-surface.test.js` asserts `libqr` exports nothing logo-related.
- `src/util/options.js` no longer accepts `logo`, and the unknown-key rule means passing it is silently ignored rather than half-working.
