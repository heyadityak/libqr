---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§2"]
---

# ADR-0012: Spec data placement across layers

## Context and Problem Statement

Implementing [ADR-0003](0003-layered-one-way-dependencies.md)'s one-way import graph surfaced three concrete conflicts that the layering ADR did not anticipate. All three are the same shape: a lower layer needs specification data that the original file plan put in a higher layer.

1. **`encode/` needs mode indicators and character-count widths.** `AGENTS.md` §2 put every spec constant in `core/constants.js`. But `encode/numeric.js` needs the numeric mode indicator (`0001`) and the count-indicator width for the target version range. Reading those from `core/` is an upward import.

2. **`encode/` needs a bit writer.** `AGENTS.md` §2 put `bitbuffer.js` in `core/`. Every encoder writes into it. Same upward import.

3. **`ec/blocks.js` needs the block-structure table.** Splitting codewords into groups requires knowing the group counts and sizes for a version and EC level. Those live in `core/constants.js`. Same upward import again.

Left unresolved, each of these becomes either a layering violation or an `except` clause carved into the lint zones — and enough carve-outs turn the boundary into decoration.

## Decision

A single placement rule, applied consistently:

**Spec data lives at the lowest layer that fully owns the concept. Layers below that take it as a parameter rather than looking it up.**

Concretely:

- **`ec/` holds no specification tables at all.** It is pure finite-field and polynomial math. `ec/blocks.js` receives a block-structure descriptor as an argument — `{ groups: [{ count, dataCodewords }, ...], ecCodewordsPerBlock }` — supplied by `core/version.js`, which owns the version-indexed tables.

- **Each encoder owns its own mode's spec constants.** `encode/numeric.js` exports its mode indicator and its `[v1-9, v10-26, v27-40]` count-indicator width triple, with the ISO clause cited. This is four numbers per mode, and the encoder is the thing that *is* the mode, so colocation is the honest home.

- **`core/mode.js` imports mode constants from `encode/`**, which is a legal downward import. `core/constants.js` therefore holds only version-indexed tables: total codewords, data capacity per EC level, block structure, alignment-pattern centres.

- **`bitbuffer.js` moves from `core/` to `util/`.** It is a generic append-only bit writer with no QR knowledge. Both `core/` and `encode/` need it, and [ADR-0003](0003-layered-one-way-dependencies.md) already states that a helper needed by two layers moves *down* into `util/`. This is that rule being applied, not an exception to it.

This supersedes the `core/bitbuffer.js` placement in `AGENTS.md` §2, which has been updated.

## Consequences

### Good

- Zero `except` clauses in the lint zones. The boundary from [ADR-0003](0003-layered-one-way-dependencies.md) holds with no carve-outs, which is what keeps it credible.
- `ec/` becomes independently testable as pure math against published Reed–Solomon vectors, with no QR table fixtures needed.
- Mode spec data sits next to the code that uses it, so adding a mode touches one file rather than one file plus a shared table.
- Passing the block descriptor explicitly makes `ec/blocks.js` trivially testable with hand-written descriptors, including structures no real version uses.

### Bad / costs

- Spec constants are now in two places — per-mode data in `encode/`, version-indexed tables in `core/constants.js`. Someone looking for "the constants" has two places to check. Mitigated by the rule being stateable in one sentence.
- `core/version.js` must assemble the block descriptor before calling into `ec/`, so there is a small amount of plumbing that a direct table read would not need.
- Per-mode count-width triples are hand-written rather than generated ([ADR-0007](0007-generated-committed-spec-tables.md)), so they carry transcription risk. Small surface — three numbers per mode — and directly covered by the version-boundary golden vectors required by [ADR-0008](0008-golden-vectors-conformance-gate.md).

## Alternatives Considered

- **Carve `core/constants.js` out of the `encode` and `ec` zones via `except`.** Rejected — it is the smallest change and the worst one. Once the zones have exceptions, the next exception is easier to justify, and the boundary stops being a boundary.
- **Move all spec tables down into `util/`.** Rejected — `util/` would then hold the majority of the library's domain knowledge, which makes "utility" meaningless and puts QR specifics below the math that does not need them.
- **A new `src/spec/` layer beneath `util/`.** Genuinely considered. Rejected as premature: it adds a seventh layer and a directory whose only job is holding one generated file, when the parameter-passing rule achieves the same isolation with no structural change. Worth revisiting if a third consumer of the tables appears.
- **Keep `bitbuffer.js` in `core/` and have `core` drive all bit writing**, with encoders returning bit arrays. Rejected — allocating an intermediate array per segment, for every segment, to avoid moving one file down a layer.

## Enforcement

- The lint zones from [ADR-0003](0003-layered-one-way-dependencies.md) enforce this negatively and completely: any attempt to read tables upward is a lint error, and there are no `except` clauses to weaken it.
- `test/unit/lint-enforcement.test.js` asserts the zone set directly, including that `encode` may not import `core` and `ec` may not import `core` — the two cases this ADR exists to resolve.
- `ec/` unit tests take hand-written block descriptors and import nothing from `core/`, so a table dependency creeping in would break the test's own imports.
