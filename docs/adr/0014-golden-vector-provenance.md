---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§6"]
---

# ADR-0014: Golden vectors declare their provenance

## Context and Problem Statement

[ADR-0008](0008-golden-vectors-conformance-gate.md) makes bit-exact golden vectors the conformance gate, on the grounds that lenient decoders cannot prove conformance. It does not say where a vector's expected value comes from -- and that turns out to matter enormously.

Two kinds of entry end up in the same file:

1. **Published** -- expected values taken from ISO/IEC 18004 worked examples. These are genuinely independent: if the implementation disagrees, the implementation is wrong.
2. **Regression** -- expected values captured from this implementation, because no published value exists for that case. These prove only that behaviour has not changed.

Undifferentiated, the second kind silently borrows the authority of the first. A file of 200 vectors reads as 200 pieces of conformance evidence when perhaps eight of them are. Worse, the failure mode is invisible: a regression vector generated from buggy code enshrines the bug as the expected value, and every future run agrees with it.

This is the same trap ADR-0008 identified with lenient decoders, one level up.

## Decision

Every entry in `test/golden/vectors.json` carries a required `source` field:

- `source: "published"` -- with a `note` naming the document or worked example. Independent conformance evidence.
- `source: "regression"` -- with a `note` stating plainly that it locks in current output and is not conformance evidence.

Two structural requirements follow:

- **A regression vector must also decode back to its input.** A regression lock is therefore never merely "whatever the code produced" -- it is "what the code produced, and it round-trips". That is weaker than a published vector and stronger than a bare snapshot.
- **The file must contain at least one published vector**, asserted by the test suite. A vectors file with no independent evidence in it is a regression suite wearing a conformance suite's name.

ADR-0008's append-only rule and its requirement that correcting a vector needs an ADR both still apply, to both kinds.

## Consequences

### Good

- "How much independent evidence do we actually have?" is answerable by filtering one field, instead of by reading the git history of every entry.
- A regression vector generated from buggy code is caught at generation time by the decode requirement, rather than being enshrined.
- New contributors and agents get an explicit signal that adding a regression vector is not the same as proving conformance, at the moment they add one.
- The published entries become a visible to-do list: the gaps are where independent vectors are still needed.

### Bad / costs

- Every vector carries two extra fields, and the generator has to keep them accurate.
- Decoding every regression vector makes the golden suite slower -- rasterising and decoding a version 40 symbol is not free.
- The distinction relies on `note` being honest. Someone can label a regression vector `published` and nothing mechanical will catch it.
- Published values still have to be transcribed by hand, so they carry their own transcription risk. The mitigation is the derivation cross-check in `.memory/investigations/2026-08-24-verifying-capacity-tables.md`.

## Alternatives Considered

- **Leave the file undifferentiated, as ADR-0008 implies.** Rejected -- it lets regression snapshots pass as conformance evidence, which is precisely the class of false confidence ADR-0008 exists to eliminate.
- **Two separate files**, `vectors.json` and `snapshots.json`. Reasonable, and arguably clearer at a glance. Rejected because one gate is easier to keep honest than two, and a per-entry field makes mixed-provenance cases -- an entry with a published codeword sequence and a regression matrix -- expressible.
- **Only allow published vectors.** Rejected -- published worked examples cover a handful of cases, so this would leave the version boundaries, mask selection, and non-ASCII paths with no regression protection at all.
- **Derive expected values from a second independent implementation.** Rejected for the reason ADR-0008 already gives: it inherits that implementation's bugs as our specification, and two implementations agreeing on a misreading is not evidence.

## Enforcement

- `test/golden/golden.test.js` asserts that every entry has a `source` of `published` or `regression`, and that at least one `published` entry exists.
- Every `regression` entry is additionally asserted to decode back to its input.
- The generator regenerates in memory and compares against the committed file, so the two cannot drift.
- The generator throws if a published vector's expected value does not match, so a published entry can never be silently updated by a regeneration.
