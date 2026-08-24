---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§3", "§5"]
---

# ADR-0013: Option normalisation lives in `util/`, not `index.js`

## Context and Problem Statement

[ADR-0009](0009-boundary-validation-typed-errors.md) decided that options are validated exactly once, by "one normalizer/validator at the `src/index.js` boundary". Implementing it revealed that the premise -- a single public boundary -- is wrong.

There are three:

- `qr(data, options)` and `toSvg(data, options)` in `src/index.js`.
- `encode(data, options)` from `src/core/qr.js`, which `AGENTS.md` §3 exports as the documented lower-level API for consumers who want a matrix and no rendering.
- The `./svg` entry point's `matrixToSvg(matrix, options)`, which takes render options directly.

If the validator lives in `index.js`, then `core/qr.js` cannot call it -- that would be an upward import, forbidden by [ADR-0003](0003-layered-one-way-dependencies.md). Which leaves three bad options: duplicate the validator, leave `encode()` unvalidated, or carve an exception into the lint zones.

Leaving `encode()` unvalidated is the worst of those, and specifically reintroduces the failure ADR-0009 exists to prevent: a bad option propagating into bit packing and producing a symbol that renders fine and scans nowhere.

## Decision

The normaliser lives in `src/util/options.js`.

`util/` is the bottom layer, so every public boundary can import it without violating the dependency direction. This is [ADR-0012](0012-spec-data-placement-across-layers.md)'s rule applied -- a helper needed by two layers moves down -- rather than a new mechanism.

The substance of ADR-0009 is unchanged and still binding:

- Validation runs **once per public call**, not once per layer.
- Internal functions assume a canonical, frozen options object and never re-validate. `core/qr.js` exposes `encodeNormalized()` for callers that have already normalised, so `toSvg()` does not validate twice on its way through.
- Unknown keys are ignored; recognised-but-invalid values throw typed errors.

Only the file location changes.

## Consequences

### Good

- `encode()` is validated, so the documented lower-level API cannot be used to smuggle a bad option past the boundary.
- No `except` clauses in the lint zones, so the ADR-0003 boundary stays absolute.
- The returned object is frozen, which makes accidental mutation by a renderer a visible error rather than a silent one.
- `normalizeOptions` is exported publicly, so a consumer building a custom renderer can get the same canonical shape the built-in ones use.

### Bad / costs

- The validator now sits at a layer any module could import, which weakens the *structural* guarantee that validation only happens at a boundary. Nothing stops a future internal function calling it defensively and paying the cost twice. That remains a review matter, as it was before.
- Two functions where ADR-0009 implied one: `encode()` validates, `encodeNormalized()` does not. The naming has to carry that distinction, and a careless caller could reach for the wrong one.
- `util/` now holds something that is arguably policy rather than utility.

## Alternatives Considered

- **Keep the validator in `index.js` and leave `encode()` unvalidated.** Rejected -- it reopens exactly the silent-failure mode ADR-0009 was written to close, on a documented public function.
- **Duplicate the validator in `core/`.** Rejected -- two copies of the option rules will diverge, which is the outcome ADR-0009's "validate once" clause exists to prevent.
- **Carve `index.js` out of the lint zones so `core/` may import it.** Rejected -- the first exception makes the second easier to justify, and the zones stop being a boundary.
- **Stop exporting `encode()` publicly**, leaving `index.js` as the only boundary. Genuinely tempting, and it would have vindicated ADR-0009 as written. Rejected because a matrix-only API is a real use case -- custom renderers, print pipelines, hardware -- and removing it to preserve a file location is the wrong trade.
- **A new `src/options.js` outside the layer system.** Rejected -- a file belonging to no layer is a precedent that erodes the layering more than putting it in `util/` does.

## Enforcement

- `test/unit/util/options.test.js` asserts every recognised option's validation, and that unknown keys are ignored.
- Tests call `encode()` directly with invalid options and assert typed errors, so the boundary that motivated this ADR is covered specifically.
- The lint zones from [ADR-0003](0003-layered-one-way-dependencies.md) still have no exceptions, which `test/unit/lint-enforcement.test.js` asserts directly.
- The frozen return value means a renderer mutating options throws in strict mode rather than corrupting a later call.
