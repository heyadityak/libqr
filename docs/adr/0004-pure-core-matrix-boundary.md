---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§2", "§3"]
---

# ADR-0004: Pure core with the matrix as boundary type

## Context and Problem Statement

There is a natural seam in QR generation: everything up to "which modules are dark" is arithmetic, and everything after is drawing. The question is whether to honour that seam or let generation and rendering interleave.

Interleaving is tempting for performance — you could set pixels as you place modules and skip an intermediate structure. But the spec makes that awkward on its own terms. Mask selection requires evaluating all eight mask patterns against the **complete** matrix, scoring each, and picking the winner. You cannot have drawn anything before that point, because seven of the eight candidates get thrown away.

So the spec itself forces a materialised, finished matrix to exist. Given that, coupling drawing into placement buys nothing and costs testability.

## Decision

`core/` and `ec/` are environment-agnostic. They take a string or bytes plus normalized options, and return:

```js
{ matrix, version, ecLevel, mask, size }
```

`matrix` carries module data only — dark/light per position, plus enough reservation information for internal placement. No colours, no pixels, no coordinates in any output space.

Below `render/`, nothing may reference `document`, `window`, `navigator`, `Canvas`, `Image`, or `fetch`.

Renderers consume the matrix **read-only**. A renderer that needs derived geometry computes it in `render/shared/geometry.js`; it does not annotate or mutate the matrix.

## Consequences

### Good

- The spec-critical code is testable as pure functions in plain Node, with no DOM shim, no jsdom, no browser. Given that correctness here is the entire product, this is the decision's main payoff.
- Golden-vector testing ([ADR-0008](0008-golden-vectors-conformance-gate.md)) is possible at all: you can assert on a matrix, and matrix diffs are readable. Asserting on canvas pixels is not a workable conformance gate.
- Server-side rendering falls out for free — `toSvg()` works in Node because nothing underneath it wants a browser.
- Consumers who want only the matrix (custom renderers, print pipelines, hardware) get exactly that, with no rendering code in their bundle.
- New renderers are additive and cannot break encoding, because they cannot reach into it.

### Bad / costs

- One extra allocation and traversal versus drawing during placement. In practice irrelevant — the matrix is at most 177×177, and mask evaluation already traverses it eight times.
- The boundary type is now public API in effect. Changing the shape of `matrix` is a breaking change even though it looks internal, so it needs care and a `.d.ts` entry.
- Renderers must recompute geometry that placement code already knew about (quiet zone offsets, module extents). Small, and `render/shared/geometry.js` centralises it.

## Alternatives Considered

- **Renderer callbacks invoked during matrix construction.** Rejected — couples spec logic to output format, and cannot express mask selection, which needs eight complete candidate matrices before choosing one.
- **A single `QrCode` class holding both matrix and draw methods.** Rejected — it makes rendering code reachable from encoding by construction, defeating [ADR-0003](0003-layered-one-way-dependencies.md) and the tree-shaking it enables.
- **Return a canvas/`ImageData` as the boundary type.** Rejected — browser-only, unusable in Node or SSR, and produces no diffable artifact for conformance tests.
- **Return an SVG string as the boundary type.** Rejected — forces every consumer through string parsing to get at module data, and bakes one renderer's choices into the core's contract.

## Enforcement

- The `no-restricted-paths` lint zones from [ADR-0003](0003-layered-one-way-dependencies.md) block downstream imports.
- An additional ESLint `no-restricted-globals` rule scoped to `src/core/**` and `src/ec/**`, listing `document`, `window`, `navigator`, `fetch`, `Image`. This is the direct mechanical check on purity.
- `core/` and `ec/` unit tests run in a Node environment with no DOM shim configured, so a stray browser reference fails the test run as well as lint.
