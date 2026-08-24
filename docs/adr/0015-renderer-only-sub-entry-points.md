---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§3", "§7"]
---

# ADR-0015: Sub-entry points export renderer-only functions

## Context and Problem Statement

[ADR-0006](0006-multiple-entry-points-size-budget.md) put optional renderers behind their own entry points and declared a gzip budget for each. Building them exposed a question it did not answer: what should a sub-entry point actually export?

Two shapes were available for `libqr/canvas`:

```js
// A: renderer only -- the caller brings a matrix
import { qr } from 'libqr';
import { matrixToCanvas } from 'libqr/canvas';
matrixToCanvas(ctx, qr('HELLO').matrix, { scale: 8 });

// B: convenience -- the entry point encodes for you
import { toCanvas } from 'libqr/canvas';
toCanvas(ctx, 'HELLO', { scale: 8 });
```

B is nicer to use and was what `AGENTS.md` §3 originally described. It also makes the budget meaningless. `toCanvas` has to encode, so the bundle contains the whole encoder: `libqr/canvas` measures about 7 KB instead of the 0.7 KB that canvas support actually costs. The budget then answers "how big is this bundle in isolation", which nobody cares about, instead of "what does this feature cost me", which is the question ADR-0006 exists to keep answerable.

Measuring the marginal cost properly under shape B would mean marking `../core/*` as external for sub-entry builds -- which breaks the standalone IIFE bundle, since those relative specifiers do not resolve in a browser.

## Decision

Sub-entry points export **renderer-only** functions taking a matrix:

| Entry | Exports |
| --- | --- |
| `libqr/svg` | `matrixToSvg` |
| `libqr/canvas` | `matrixToCanvas`, `canvasSizeFor` |
| `libqr/png` | `matrixToDataUrl`, `matrixToBlob` |

Each bundle therefore *is* its marginal cost, and the budget means what it says. Consumers import the encoder from `libqr` and the renderer from its entry point; a bundler shares the encoder between them.

**`libqr/element` is the deliberate exception.** A custom element is driven by HTML attributes -- there is no call site to hand it a matrix -- so it necessarily contains the encoder. For entries like this, `build/entries.js` declares a `marginal` budget alongside the total, and `size-check` reports the difference against the default bundle. `libqr/element` -- the element plus `mount()` -- currently costs **336 bytes** over `libqr`, which is the number worth knowing; its 7.32 KB total is not.

## Consequences

### Good

- Every renderer budget measures the marginal cost of that renderer. `canvas` at 0.74 KB and `png` at 1.17 KB are honest answers to "what does this add".
- No bundler externals, so the standalone IIFE builds work as published.
- Sub-entries are consistent with each other, and `libqr/svg` -- which shipped first, before this question came up -- needed no change.
- The `marginal` field gives entries that genuinely must bundle the encoder a meaningful number instead of a misleading one.

### Bad / costs

- **Two imports for one job.** `import { qr } from 'libqr'` plus `import { matrixToCanvas } from 'libqr/canvas'` is more friction than a single `toCanvas`, and some consumers will find it fussy. This is the real cost of the decision.
- The main entry has `toSvg` and `toAscii` convenience wrappers but no `toCanvas`, which looks inconsistent until you know why. Documented in `README.md`.
- A consumer loading two IIFE bundles from a CDN gets the encoder twice. Bundler users do not.
- `marginal` is a second budget concept to understand.

## Alternatives Considered

- **Shape B, with budgets raised to absorb the encoder.** Rejected -- it makes every renderer budget read about 7 KB, so the numbers stop distinguishing a cheap renderer from an expensive one, and ADR-0006's gate stops being informative.
- **Shape B, with `../core/*` marked external for sub-entry builds.** Rejected -- the emitted bundles would import unresolvable relative paths, breaking the IIFE builds entirely.
- **Both shapes exported from each entry.** Rejected -- the convenience export drags the encoder in regardless of whether anyone calls it, so it costs the same as shape B while also being a larger API.
- **Re-export `toCanvas` from the main entry.** Rejected outright -- that puts canvas in the default path, which is precisely what ADR-0006 forbids.
- **Separate `libqr-canvas` packages.** Rejected for the reason ADR-0006 already gives: release coordination overhead for a single author.

## Enforcement

- `build/entries.js` declares each entry's budget, and `marginal` where the encoder is unavoidable. `scripts/size-check.js` fails on either being exceeded.
- `test/unit/build/size-check.test.js` covers the marginal rule directly, including that a marginal overage is reported even when the total is inside budget.
- `scripts/check-bundles.js` asserts the default bundle contains no canvas or custom-element machinery, so a convenience wrapper cannot creep back into the default path unnoticed.
- ADR-0011's M9 and M10 gates require the default entry size to be unchanged, which `size-check` enforces against the committed baseline.
