---
title: import/no-restricted-paths is inert when the imported file does not exist
date: 2026-08-24
type: gotcha
status: current
area: eslint.config.js
related: []
---

## What

`import/no-restricted-paths` — the rule enforcing the ADR-0003 layer boundaries — reports **nothing** when the imported path does not resolve to a real file. Verified 2026-08-24 with eslint 9.39.5 / eslint-plugin-import 2.32.0:

- `src/core/x.js` importing `../render/svg.js` **while that file exists** → `import/no-restricted-paths` error, as intended.
- The same import **while `src/render/svg.js` does not exist** → zero messages. Not a warning, not an unresolved-import error. Silence.

## Why it matters

During the early milestones most target files do not exist yet, so the layer boundary is only partially armed. An import written before its target exists passes lint, and then keeps passing — nobody re-lints that file when the target lands later, unless something else in it changes.

It also means a green `npm run lint` on a sparse tree is weaker evidence than it looks. The M0 gate in ADR-0011 ("prove the zones reject a bad import") is specifically why this was caught rather than discovered at M7.

## How to apply

`test/unit/lint-enforcement.test.js` handles it: it creates a real `__lint_probe_target.js` in every layer directory in `beforeAll`, lints probe text against virtual paths via the ESLint Node API, and removes the targets in `afterAll`. That test asserts the full zone matrix — 9 illegal pairs, 9 legal pairs — independently of which real source files happen to exist.

So: **trust `npm test` for boundary coverage, not `npm run lint`**, until the tree is complete. If a layering bug appears anyway, check whether the import target existed when the file was last linted.

Adding `import/no-unresolved` would catch the missing-file case from the other direction, but it needs resolver configuration and would fire constantly on a sparse tree. Revisit once `src/` is populated.
