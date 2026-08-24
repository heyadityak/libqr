---
title: M0-M7 complete, M8 is next
date: 2026-08-24
type: handoff
status: current
area: whole repo
related: [2026-08-24-verifying-capacity-tables, 2026-08-24-no-restricted-paths-needs-resolvable-target]
---

## Done

Milestones M0 through M7 of `docs/adr/0011-bottom-up-test-gated-build-order.md`, each gate green.

- **M0** `package.json` (zero deps, six-entry `exports`, `sideEffects` list), `eslint.config.js` with the ADR-0003 import zones and the ADR-0004 browser-global ban, vitest config, CI workflow, `scripts/check-deps.js`.
- **M1** `scripts/gen-tables.js` → `src/core/constants.js`. Only two tables are hand-transcribed (Table 9); everything else derives.
- **M2** `src/ec/{galois,polynomial,reed-solomon}.js`.
- **M3** `src/util/{bitbuffer,text,errors,assert}.js`, `src/encode/{numeric,alphanumeric,byte,eci}.js`, `src/core/{mode,segment}.js`, `src/util/mode-registry.js`.
- **M4** `src/core/version.js`, `src/ec/blocks.js`.
- **M5** `src/core/{matrix,patterns}.js`, `src/render/ascii.js` (pulled forward as instrumentation, as ADR-0011 permits).
- **M6** `src/core/{mask,format-info}.js`.
- **M7** `src/core/qr.js`, `src/render/svg.js`, `src/render/shared/{geometry,style}.js`, `src/util/options.js`, `src/index.js`, `src/types/index.d.ts`, `README.md`, `CHANGELOG.md`, `examples/basic.html`. Version set to 0.1.0.

New ADRs raised along the way, all from real conflicts rather than speculation: **0012** (spec data placement — `bitbuffer.js` in `util/`, encoders own their mode constants, `ec/` holds no tables), **0013** (option validator in `util/options.js`, because `encode()` is a third public boundary), **0014** (golden vectors declare `published` vs `regression` provenance).

## Not done

M8, M9, M10. Nothing is half-finished — the boundary is clean.

- **M8** — `rollup.config.js`, `scripts/size-check.js`, `bench/`. **The 8 KB gzip budget in `README.md` is currently an unenforced claim.** Nothing measures it.

  Indicative measurement taken 2026-08-24: concatenating the default path with comments stripped but **no** minification gives 41.4 KB raw / **11.2 KB gzipped**. A real minifier also renames identifiers and drops dead code, which typically takes off another third — so 8 KB looks achievable but **tight**, not comfortable. Expect to need `assert()` stripping (ADR-0009 already requires it) and to check whether `render/ascii.js` belongs in the default entry point after all. If it turns out genuinely unreachable, raising the budget needs an ADR superseding 0006, not a quiet edit to `README.md`.
- **M9** — `src/render/{canvas,png}.js`, `src/dom/{mount,element}.js`, Playwright suite.
- **M10** — `src/encode/kanji.js`, `src/render/shared/logo.js`, `docs/api.md`, release workflow.

`package.json` `exports` already maps `./canvas`, `./png`, `./kanji`, `./element`, and `README.md` documents them. Those specifiers **do not resolve yet**. This is the plan, not breakage — do not "fix" it by deleting the mappings.

## Next step

M8. Add `rollup.config.js` producing `dist/libqr.{esm.js,cjs,iife.min.js}`, then `scripts/size-check.js` measuring each entry point against a budget object, wired into CI. Gate: default path under 8 KB min+gzip.

Do M8 before M9. ADR-0006's whole argument is that optional renderers must not inflate the default path, and the M9 and M10 gates both require "default entry size unchanged" — which is unmeasurable until the size gate exists.

## State of the tree

Branch `main`, **everything uncommitted** (`AGENTS.md` modified; `src/`, `test/`, `scripts/`, `docs/adr/`, `examples/`, `.memory/`, config files untracked). No branch created — the user had not asked for a commit.

All gates green: `npm run lint`, `npm test` (491 tests, 18 files), `npm run test:types`, `npm run check:deps`.

`npm run check:tables` currently **passes vacuously** — it uses `git diff --exit-code` on an untracked file. Once `src/core/constants.js` is committed it becomes a real check. The equivalent property is genuinely covered in-process by `test/unit/core/constants.test.js`, which regenerates and compares byte for byte.

## Traps hit

- Three "known" figures in the M1 test were wrong from memory — v20 total codewords, and all of v26 and v27. The generator was right. Promoted the verification method to `.memory/investigations/2026-08-24-verifying-capacity-tables.md`; use it before ever "fixing" a table.
- `import/no-restricted-paths` is silently inert when the imported file does not exist, so the layer boundary is only partly armed on a sparse tree. Written up in `.memory/gotchas/`, and worked around by `test/unit/lint-enforcement.test.js` creating real probe targets.
- `HELLO WORLD` needs 74 bits and version 1 at level H holds 72, so it cannot be the payload for an all-levels test. Cost a confusing failure in `mask.test.js`.
- The BCH divisibility test was nearly vacuous: level M with mask 0 has zero data bits, so the remainder is trivially 0. Now guarded by asserting a non-codeword gives a nonzero remainder.
