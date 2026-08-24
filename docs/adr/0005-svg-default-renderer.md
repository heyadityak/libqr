---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§2", "§3", "§6"]
---

# ADR-0005: SVG string as the default renderer

## Context and Problem Statement

Several output formats are worth supporting — SVG, canvas, PNG, ASCII. One of them has to be the default: the one in the primary entry point, the one the size budget is measured against, and the one golden tests assert on.

The choice is not really about which output consumers want most. It is about which output makes the library testable and portable, since the others can be added behind separate entry points without cost.

## Decision

`render/svg.js` is the default renderer and the only one in the primary entry point.

It produces a **string**. It touches no browser API — no `document.createElementNS`, no serialisation of a live DOM tree. A string is what makes it work identically in Node, in a worker, during SSR, and in a browser.

`toSvg(data, options)` is the headline API in `README.md`. Canvas, PNG, and the custom element are separate entry points ([ADR-0006](0006-multiple-entry-points-size-budget.md)).

`render/ascii.js` also ships in the primary entry point, at negligible size, because it is the debugging tool that makes matrix problems visible in a terminal or a test failure message.

## Consequences

### Good

- Works everywhere the library runs, with no environment check and no fallback path.
- **Diffable.** A golden SVG snapshot produces a readable diff when it changes. This is the property that makes [ADR-0008](0008-golden-vectors-conformance-gate.md) practical at the render layer, not just the matrix layer.
- Resolution-independent: one output scales to a business card or a billboard. Removes a whole class of "which pixel density" questions from the API.
- Consumers can style it after the fact with CSS, embed it inline, or hand it to a print pipeline.
- No canvas means no tainted-canvas or CORS considerations in the default path.

### Bad / costs

- For high versions the SVG string is larger than an equivalent PNG. Mitigated by path merging in `render/shared/geometry.js` — emitting merged run-length paths rather than one `<rect>` per module, which is a large win on real payloads.
- Consumers who want a raster file must import a second entry point. Documented, but it is an extra step and a support question.
- SVG in `<img src>` has sandboxing quirks in some contexts; consumers hitting those need the PNG path.

## Alternatives Considered

- **Canvas-first.** Rejected — browser-only, so unusable in Node and SSR, untestable without Playwright for even trivial assertions, and produces no diffable artifact. It would make the default path the hardest one to verify.
- **PNG-first.** Rejected — same objections as canvas (it is built on canvas), plus encoding cost, plus binary output that no test can read meaningfully.
- **DOM-based SVG construction** (`createElementNS` and friends). Rejected — reintroduces a browser dependency into the default path for no benefit over string building, and violates [ADR-0004](0004-pure-core-matrix-boundary.md)'s spirit at the render layer.
- **No default; make consumers always choose a renderer.** Rejected — pushes a decision onto every consumer at first use, and leaves the size budget with nothing to measure.

## Enforcement

- Golden SVG snapshots committed in `test/golden/*.svg`; a diff is a test failure.
- `scripts/size-check.js` measures the `encode + svg` path specifically as the primary budget number ([ADR-0006](0006-multiple-entry-points-size-budget.md)).
- CI runs the full default-path test suite in a plain Node environment with no browser and no DOM shim, which mechanically prevents a browser dependency creeping into `render/svg.js`.
