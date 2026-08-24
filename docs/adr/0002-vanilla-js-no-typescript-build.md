---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§5"]
---

# ADR-0002: Vanilla JS ESM source, hand-written `.d.ts`

## Context and Problem Statement

Consumers want type information — that is not in question. The question is whether the source is TypeScript.

TypeScript brings a compile step, a `src`-versus-`dist` gap when debugging, source maps to keep aligned, and a build that must run before anything can be tested. For a large application that cost is easily repaid. For this library the trade looks different: the public surface is around eight functions and one options object, and the value proposition is a small, directly readable runtime that a consumer can open and audit. Making the shipped code a compilation output works against that.

The internal complexity here is also not the kind types catch. The hard bugs are "this constant is 12 when it should be 14 at version 27" — a `number` either way.

## Decision

Source is `.js`, ES2022, ESM. JSDoc annotations carry parameter and return types in source. The public type surface is a hand-maintained `src/types/index.d.ts`.

No compile step between the source and what ships. `src/` is publishable as-is, and `dist/` exists only for bundle formats ([ADR-0006](0006-multiple-entry-points-size-budget.md)), not for language translation.

## Consequences

### Good

- What you read in `src/` is what runs. Stack traces point at real lines; no source-map indirection.
- Tests run against source with no build. The edit-test loop has one fewer step, which compounds across the many small iterations that spec work requires.
- Contributors need no TypeScript knowledge to read or patch the math.
- `src/` can be shipped in the package `files` list and consumed directly by anyone who wants to bundle from source.

### Bad / costs

- **The `.d.ts` can drift from the implementation.** This is the real cost and it is not hypothetical — hand-maintained types diverge unless something checks them. Partially addressed under Enforcement.
- No compile-time checking inside the library. Internal contracts between layers rest on tests and review.
- Refactors that a type checker would make trivial (renaming a field threaded through five modules) are grep-and-hope.

**Most likely future supersede:** generating `.d.ts` from JSDoc via `tsc --declaration --allowJs --emitDeclarationOnly`. This removes the drift risk entirely and costs one dev-only build step, with no change to shipped runtime code. It was not adopted now only because the surface is small enough to maintain by hand and the tooling is one more thing to configure. If the public API grows past roughly twenty exports, or the types drift once in practice, revisit this — it is a strictly better position, not a different philosophy.

## Alternatives Considered

- **Full TypeScript source.** Rejected — a build step and a `dist`-only debugging story for a public surface small enough that TS's leverage is marginal. The internal bug class here is wrong constants, which types do not catch.
- **Generate `.d.ts` from JSDoc now.** Not rejected on merit — deferred. See the note above; this is the expected evolution.
- **No types at all.** Rejected — a frontend library without editor completion or type-checked call sites is meaningfully worse to consume in 2026.
- **JSDoc plus `checkJs` on the whole source tree.** Rejected for now — it imposes TypeScript's inference model on the source without the ergonomics, and GF(256) table code fights it. Reasonable to revisit alongside the generated-`.d.ts` change.

## Enforcement

- `test/types/*.ts` fixture files import the public API and assert expected shapes; a `tsc --noEmit` step over them runs in CI. This does not verify the internals, but it does catch the `.d.ts` drifting from the actual exported surface — which is the failure mode that reaches consumers.
- ESLint enforces `valid-jsdoc`-equivalent rules on exported functions, so annotations are present and structurally sound.
- `AGENTS.md` §10 definition-of-done includes "`src/types/index.d.ts` matches the actual public surface" as an explicit checklist item.
