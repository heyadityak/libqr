---
title: All ten milestones done; nothing is committed yet
date: 2026-08-24
type: handoff
status: current
area: whole repo
related: [2026-08-24-kanji-registration-is-process-wide, 2026-08-24-verifying-capacity-tables, 2026-08-24-no-restricted-paths-needs-resolvable-target]
---

## Done

**Every milestone in `docs/adr/0011-bottom-up-test-gated-build-order.md`, M0 through M10.** The library is feature-complete. Supersedes the M0-M9 handoff, which has been deleted.

M10 specifically:

- `src/encode/kanji.js` behind `libqr/kanji`. Derives its Shift-JIS mapping from `TextDecoder('shift_jis')` rather than shipping a table (**ADR-0016**), which makes the entry point 1.03 KB instead of roughly 14 KB.
- Kanji joined the segmentation dynamic program as a *dynamic* candidate, so it stays out of the default bundle.
- `src/render/logo.js` behind `libqr/logo`, plus a generic `overlay` option on `matrixToSvg` (**ADR-0017**).
- `docs/api.md`, `.github/workflows/release.yml`, `examples/logo.html`.

Final state: 628 vitest tests across 22 files, **73** Playwright tests in Chromium (52 for the library, 21 for the example pages), all seven entry points inside budget, version 0.2.0.

| entry | size | budget |
| --- | --- | --- |
| `.` | 7.16 KB | 8 KB |
| `./svg` | 0.85 KB | 1 KB |
| `./canvas` | 0.74 KB | 1 KB |
| `./png` | 1.17 KB | 1.5 KB |
| `./kanji` | 1.03 KB | 1.5 KB |
| `./logo` | 1.06 KB | 1.25 KB |
| `./element` | +333 B over `.` | +512 B |

## Not done

**Nothing is committed.** That is the only outstanding item. The tree holds the entire library as untracked or modified files on `main`, with no branch created, because no commit was ever requested.

`npm run check:tables` still passes vacuously as a result -- it uses `git diff --exit-code` against an untracked file. It becomes a real check the moment `src/core/constants.js` is tracked. The equivalent property is genuinely covered in-process by `test/unit/core/constants.test.js`, which regenerates and compares byte for byte.

## Next step

Commit. Suggested split, because the second changes an existing contract:

```
git checkout -b build/libqr
git add -A && git commit -m "feat: QR code generation, encoding through rendering"
```

Then re-run `npm run check:tables` -- it should still pass, but now meaningfully.

Beyond that the build plan is finished. Anything further is new scope: Micro QR, structured append, a decoder, framework adapters. Each would need an ADR before code.

## Traps hit

- **A real library bug per milestone, found by the gates rather than in the field.** M9's bundle smoke test caught `encoding: 'shift-jis'` silently producing UTF-8. M10 caught `encoding: 'latin1'` silently substituting `?` above U+00FF -- same silent-wrong-output class -- and byte-mode cost under shift-jis counting kanji as one byte, which made byte mode look cheaper than Kanji and then failed when the bytes were produced.
- **A maximum-size logo on a version 1 symbol reached a finder pattern.** Function patterns carry no error correction at all, so covering one makes a symbol undetectable rather than damaged. The error-correction budget alone did not catch it; the finder-clearance constraint was added in response.
- **The size gate drove two real design changes, not just refusals.** The logo went from 570 bytes in the default path to 13 by becoming an entry point with a generic hook. Kanji's dynamic-candidate refactor was trimmed from 209 bytes to 51 by moving Shift-JIS byte encoding into the entry point.
- **Three of my own checks were vacuous before being fixed.** `check-bundles.js` awaited nothing, so async checks always reported "ok". The BCH divisibility test was trivially satisfied for level M mask 0. `--accept` on the size gate exited before writing, making the escape hatch unreachable for its own use case. Every one was caught by deliberately breaking the thing under test -- worth doing routinely.
- **My recollection of spec constants was wrong three times** and the code was right each time: v20/v26/v27 codeword counts, Shift-JIS for 漢 (0x8ABF, not 0x8ABD), and Ω being outside JIS X 0208 (it is inside). Verify against a published figure before "fixing" anything.
- When a size changes, grep for the old number -- it is usually quoted in `README.md`, `docs/api.md`, an ADR, and `CHANGELOG.md`.
- **The examples only work when the server is rooted at the repository, not at `examples/`.** They import `../src/index.js`, so `cd examples && npx http-server` puts the root one level too deep and the browser reports a bare `404 /src/index.js` that says nothing about the cause. Fixed by routing every page's imports through `examples/boot.js`, which on failure replaces the page with an explanation and the two commands that work. Five tests serve `examples/` deliberately and assert the panel appears -- an unguarded guard is decoration.
- **The example pages had no coverage and one of them was broken.** `examples/element.html` attached a `qr-render` listener *after* the parser had already rendered the elements in `connectedCallback`, so its status line never populated. Nothing caught it: `examples/` is excluded from lint and no test loaded the pages. Fixed, documented in `docs/api.md` as a general custom-element caveat, and `test/browser/examples.spec.js` now loads every page and asserts both that it runs clean and that it does what it claims. **Loading clean is not the same as working** -- the first probe found no console errors on all five pages while one was visibly broken.
