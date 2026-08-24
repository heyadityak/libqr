---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§7"]
---

# ADR-0006: Multiple entry points to defend the size budget

## Context and Problem Statement

The stated budget is 8 KB min+gzip for the `encode + SVG render` path. That number is not decoration — small size is the reason to choose this library over alternatives, so it functions as a product requirement.

Several features are individually justified but expensive:

- **Kanji mode** carries a Shift-JIS mapping table. Large, and useless to consumers encoding URLs.
- **PNG output** needs canvas and an encode step.
- **The `<qr-code>` custom element** needs the DOM and element lifecycle handling.
- **Logo overlay** needs image handling and EC-budget math.

The overwhelmingly common case is "encode a URL, get an SVG". If the optional features sit in the default path, every consumer pays for all of them.

The tempting answer is "bundlers tree-shake, so just export everything from one entry". That fails for a specific reason worth recording: Kanji mode is reached through a **runtime** option value (`encoding: 'shift-jis'`). A bundler cannot statically prove that branch is dead, so the Shift-JIS table stays in the bundle. Tree-shaking eliminates unreferenced exports, not unreachable-in-practice runtime branches.

## Decision

The `exports` map defines six entry points:

| Specifier | Contents |
| --- | --- |
| `.` | encode + SVG + ASCII. The budgeted default. |
| `./svg` | SVG renderer alone, for consumers already holding a matrix |
| `./canvas` | canvas renderer |
| `./png` | PNG output (depends on canvas) |
| `./kanji` | Shift-JIS mode support |
| `./element` | `<qr-code>` custom element |

`"sideEffects": false` in `package.json`.

The default entry point imports **none** of the optional four, transitively or otherwise. Kanji support is opted into by importing `./kanji`, which registers the mode; without that import, `encoding: 'shift-jis'` throws a typed `ModeError` telling the caller which entry point to import.

Budgets are declared as one config object in `scripts/size-check.js`, with a number per entry point.

## Consequences

### Good

- The common case pays for the common case. This is the whole point.
- Budgets are per-entry-point and independently enforced, so adding a feature to `./png` cannot silently inflate `.`.
- The cost of each optional feature is visible as a number in CI output, which makes "is this feature worth it" an answerable question rather than an argument.
- Adding future renderers is additive with no effect on existing budgets.

### Bad / costs

- Deeper public surface to document and support. Consumers must know subpaths exist; some will not read far enough and will file "Kanji doesn't work" issues. Mitigated by the error message naming the required import.
- Older bundlers with incomplete `exports`-map support need the fallback `main`/`module` fields kept accurate.
- Registration-by-import for Kanji is a mild side-effect pattern sitting slightly awkwardly with `"sideEffects": false`. The registration module is explicitly excluded in the `sideEffects` field rather than the flag being dropped globally.

## Alternatives Considered

- **Single entry point, rely on tree-shaking.** Rejected — see above; a runtime-selected Shift-JIS table is not shakeable. This is the alternative most likely to be re-proposed, hence the detail.
- **Separate npm packages** (`@libqr/kanji`, `@libqr/png`). Rejected — cross-package version coordination and six release pipelines for a single-author library. Revisit only if the optional features grow independent release cadences.
- **Runtime dynamic `import()` of optional modules.** Rejected — makes `qr()` async or introduces a hidden loading state, and forces consumers into code-splitting configuration they did not ask for.
- **Drop Kanji mode entirely.** Considered seriously — it is the largest single cost. Rejected because it is part of the QR specification, and a library claiming spec compliance while silently omitting a mode is misleading. Behind an entry point, it costs default-path consumers nothing.

## Enforcement

- `scripts/size-check.js` runs in CI, measures each entry point independently against its declared budget, and fails the build on any overage. It reports the delta so PRs show size movement.
- The M9 and M10 gates in [ADR-0011](0011-bottom-up-test-gated-build-order.md) explicitly require the **default entry size to be unchanged** after adding browser renderers and Kanji — this is the check that catches accidental coupling into the default path.
- An `exports`-map integration test resolves each specifier and asserts the expected named exports are present.
