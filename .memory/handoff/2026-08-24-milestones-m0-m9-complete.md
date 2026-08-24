---
title: M0-M9 complete, M10 is next and is the last one
date: 2026-08-24
type: handoff
status: current
area: whole repo
related: [2026-08-24-verifying-capacity-tables, 2026-08-24-no-restricted-paths-needs-resolvable-target]
---

## Done

Milestones M0 through **M9** of `docs/adr/0011-bottom-up-test-gated-build-order.md`, every gate green. Supersedes the M0-M8 handoff, which has been deleted.

M9 specifically:

- `src/render/canvas.js` — `matrixToCanvas(ctx, matrix, options)` and `canvasSizeFor`. Caller supplies the context, so the module never creates one and never detects its environment.
- `src/render/png.js` — `matrixToDataUrl`, `matrixToBlob`. Prefers `OffscreenCanvas`, falls back to a DOM canvas, throws a clear `QrError` pointing at `toSvg()` where neither exists.
- `src/dom/element.js` — the `<qr-code>` element, defined on import. Also re-exports `mount` from `src/dom/mount.js`, so one DOM entry point covers both the declarative and imperative paths.
- `src/dom/mount.js` — `mount(target, data, options)` returning `{ update, destroy, result }`.
- `playwright.config.js`, `test/browser/` (harness plus 52 specs), `scripts/serve.js` (dependency-free static server), examples for canvas/PNG/element, CI job for browser tests.
- Per-entry `.d.ts` files (`svg`, `canvas`, `png`, `element`) with `types` conditions in `exports`, plus `test/types/entry-points.ts` exercising them.

**ADR-0015** raised: sub-entry points export renderer-only functions, so each bundle *is* its marginal cost. `./element` is the deliberate exception — a custom element is driven by attributes, so it must contain the encoder — and gets a `marginal` budget measured against the default bundle instead.

**Sizes, all inside budget, default entry unchanged:** `.` 6.99 KB, `./svg` 0.84 KB, `./canvas` 0.74 KB, `./png` 1.17 KB, `./element` +336 B over the default bundle.

## Not done

**M10 only** — the last milestone.

- `src/encode/kanji.js` — Shift-JIS mode behind `libqr/kanji`. Registers via `src/util/mode-registry.js`; `core/segment.js` already throws a `ModeError` naming the entry point when it is missing, and `core/mode.js` already resolves registered modes, so the wiring exists. Needs the Shift-JIS table, the 13-bits-per-pair encoder, and adding Kanji as a fourth candidate in the segmentation dynamic program.
- `src/render/shared/logo.js` — centre overlay, rejecting a `sizeRatio` beyond the EC budget rather than producing an unscannable image. `EC_RECOVERY` in `src/core/constants.js` is already there for this.
- `docs/api.md`, release workflow.

Gate: Kanji roundtrip; logo rejects an over-budget ratio; **default entry size still unchanged**, which `npm run size` enforces automatically.

## Next step

Kanji mode. Order that works: the Shift-JIS table and `src/encode/kanji.js` first with unit tests against published bit vectors, then registration, then add it to the DP in `core/segment.js`, then a roundtrip test.

Two things to watch:

- `./kanji`'s 12 KB budget in `build/entries.js` is a guess made before the table existed. If the real figure is close, check it before assuming the budget is wrong.
- Adding a fourth mode to the DP touches `CANDIDATES` in `core/segment.js`, which is on the default path. **If `npm run size` shows `.` moving at all, the Kanji table has leaked into the default bundle** — that is the signal ADR-0006 exists to produce, and `scripts/check-bundles.js` should get a marker for it.

## State of the tree

Branch `main`, **everything uncommitted**. No branch created — no commit was requested.

Gates, all green: `check:deps`, `lint`, `test` (532 tests, 19 files), `test:types`, `build`, `size`, `check:bundles`, `test:browser` (52 Playwright tests in Chromium).

`npm run check:tables` still passes vacuously on an untracked tree — same caveat as before, and the equivalent property is genuinely covered in-process by the constants and golden tests.

## Traps hit

- **Browser tests compare drawn pixels against the encoder's matrix, module by module, rather than decoding.** Decoding would forgive a renderer that shifted the symbol a pixel or dropped the quiet zone. Each renderer spec also has a "two payloads differ" test so the comparison cannot pass vacuously.
- `./element` was budgeted at 1.5 KB on the assumption it would be renderer-only. It cannot be. The fix was the `marginal` budget concept, not raising the number and moving on — a 7 KB budget would have told nobody anything.
- Adding `mount` to the element entry grew it 189 B. The size gate refused it until accepted deliberately, which is exactly the intended friction. Three docs quoted the old 147 B figure and needed correcting — grep for the number when a size changes.
- The Playwright harness needs every helper a spec uses explicitly attached to `window.libqrHarness`; a missing one fails as an opaque `page.evaluate` error. `canvasSizeFor` was missed first time round.
- Import attributes (`with { type: 'json' }`) do not parse under `ecmaVersion: 2022` — use `fs` instead.
