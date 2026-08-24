---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1"]
---

# ADR-0001: Zero runtime dependencies

## Context and Problem Statement

`libqr` ships into other people's bundles. Every runtime dependency it takes becomes their supply-chain exposure, their audit noise, and their bytes over the wire — a cost they did not choose and mostly cannot see.

The usual argument for dependencies is that the problem domain moves: APIs change, formats drift, edge cases accumulate, and a maintained package absorbs that churn for you. QR encoding is not that kind of problem. It is fully specified by ISO/IEC 18004, the specification is frozen, and there is no external service, format negotiation, or platform surface to track. The capacity tables that were correct in 2000 are correct now.

So the durable maintenance argument for dependencies largely does not apply here, while the cost to consumers applies in full.

## Decision

`dependencies` in `package.json` stays empty. Permanently.

All tooling — bundler, test runner, linter, the decoder used for roundtrip tests — lives in `devDependencies` and never reaches a consumer.

Concretely this means writing by hand: GF(256) arithmetic, Reed–Solomon generator polynomials, BCH encoding for format and version bits, the version/capacity/block tables, and the Shift-JIS mapping for Kanji mode.

Adding a runtime dependency requires superseding this ADR.

## Consequences

### Good

- Consumers get a genuinely leaf dependency: nothing transitive, nothing to audit beyond this package.
- The size budget in [ADR-0006](0006-multiple-entry-points-size-budget.md) is achievable at all. A single mid-sized dependency would consume most of it.
- No version-range conflicts, no peer-dependency negotiation, no lockfile churn for consumers.
- The whole runtime is readable in one sitting, which is what makes the codebase auditable by someone who cares whether their QR codes are spec-correct.

### Bad / costs

- Several hundred lines of finite-field arithmetic and table data that exist, tested, in published packages. This is real duplicated effort.
- Bugs in that math are ours. The mitigation is [ADR-0008](0008-golden-vectors-conformance-gate.md) — bit-exact golden vectors — not care and attention.
- Anything genuinely hard that we would otherwise delegate has to be either written or dropped from scope.

## Alternatives Considered

- **Depend on an existing Reed–Solomon library.** Rejected — it is roughly 200 lines of GF(256) math, and the candidates carry Node-oriented polyfills that are dead weight in a browser bundle. The dependency costs more than the code.
- **Depend on a text-encoding polyfill for UTF-8.** Rejected — `TextEncoder` is baseline across every stated target (evergreen browsers, Node ≥ 18). There is nothing to fill.
- **Depend on a validation/schema library for the options object.** Rejected — the options object has around a dozen keys with simple constraints. See [ADR-0009](0009-boundary-validation-typed-errors.md).
- **Allow `devDependencies` only, but permit optional peer dependencies.** Rejected — "optional" dependencies still appear in consumer dependency graphs and audit output, and they create two code paths to test.

## Enforcement

- CI step asserting `dependencies` is empty and `peerDependencies` is absent, failing the build otherwise. A one-line check, not a convention.
- `scripts/size-check.js` gzip budget — a dependency large enough to matter also breaks the budget, so this catches accidental additions from a second direction.
