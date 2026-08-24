---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§2"]
---

# ADR-0003: Layered one-way dependency direction

## Context and Problem Statement

The library contains code with genuinely different requirements. Finite-field arithmetic needs nothing but numbers. Mask evaluation needs a finished matrix. SVG generation needs string building. Canvas rendering needs a browser. The custom element needs the DOM.

Left unstructured, these mix. The specific failure is mundane and near-certain: someone needs a colour helper or a clamp function while working in the encoder, the nearest one lives in `render/shared/style.js`, and they import it. Nothing breaks that day. What breaks later is that the encoder is no longer testable without a DOM shim, no longer tree-shakeable for consumers who only want the matrix, and no longer auditable as pure spec logic.

In a repo where consecutive sessions do not share context, "we all know not to do that" is not a control.

## Decision

Layers, with imports flowing one direction only:

```
util  ←  ec  ←  core  ←  render  ←  dom
                  ↑
              encode
```

Arrows point toward the importer. So:

- `util/` imports nothing internal.
- `ec/` may import `util/`.
- `encode/` may import `util/`.
- `core/` may import `ec/`, `encode/`, `util/`.
- `render/` may import `core/`, `util/`.
- `dom/` may import anything.

`src/index.js` is the **only** file permitted to re-export across layers. No other barrel files exist inside `src/`.

When two layers need the same helper, it moves *down* into `util/` — it never gets reached for sideways or upward.

## Consequences

### Good

- The pure part of the library stays pure by construction rather than by vigilance. See [ADR-0004](0004-pure-core-matrix-boundary.md) for what that buys.
- Tree-shaking works: a consumer importing only the matrix encoder cannot transitively pull in rendering code, because the import edge does not exist.
- Test setup differs by layer honestly — `ec/` and `core/` tests need no environment, `dom/` tests need a browser — and that split is visible in the directory structure.
- New contributors and agents get an unambiguous answer to "where does this file go", which is most of what a directory convention is for.

### Bad / costs

- Occasional small duplication, or a push-down into `util/` of something that only has one caller today. This is accepted deliberately: a duplicated four-line clamp is cheaper than a layering violation.
- Some code genuinely wants to sit between layers. `render/shared/` exists as the escape valve for renderer-common code; anything that wants to sit between `core` and `ec` is a signal the split is wrong and warrants a new ADR rather than a workaround.
- The rule is only as good as the lint config. If the zones are misconfigured, the constraint silently evaporates.

## Alternatives Considered

- **Flat `src/`.** Rejected — there is no mechanical way to state "the encoder must not touch the DOM" without a directory boundary to hang the rule on.
- **Package-per-layer monorepo.** Rejected — genuinely enforces the boundary, but the tooling, versioning, and release coordination cost is wildly disproportionate for a single-author library under 8 KB.
- **Convention documented in `AGENTS.md` only, enforced by review.** Rejected — this is exactly the class of rule that erodes across sessions. If it is not a lint error, it is not a rule.
- **Dependency-cruiser instead of ESLint.** Reasonable alternative, rejected only to avoid a second static-analysis tool when ESLint is already required.

## Enforcement

`eslint-plugin-import` with `no-restricted-paths`, one zone per layer, configured in `eslint.config.js`. A violating import is a **lint error**, which fails CI — not a review comment.

The M0 milestone in [ADR-0011](0011-bottom-up-test-gated-build-order.md) requires proving the zones work by introducing a deliberate bad import and confirming lint rejects it. A misconfigured zone is indistinguishable from no zone, so the config itself gets verified once, at the start.
