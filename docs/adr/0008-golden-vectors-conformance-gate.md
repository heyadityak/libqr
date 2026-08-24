---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§6", "§11"]
---

# ADR-0008: Golden vectors as the append-only conformance gate

## Context and Problem Statement

This domain has a specific and dangerous property: **an incorrect QR code usually still scans.**

Consumer decoders — phone cameras, common JS decoding libraries — are deliberately lenient. They apply heuristics, tolerate malformed padding, and recover from mild spec violations because their job is reading damaged codes in bad light. So a library with a real encoding bug will pass "I scanned it with my phone and it worked" and pass a roundtrip test against a lenient decoder, then fail against strict industrial readers, at scale, in production, for a subset of payloads.

This means the two most intuitive verification methods — visual inspection and roundtrip decoding — are both actively misleading here. They produce confidence without evidence.

Testing must therefore assert on the **bits**, against values known independently of our own implementation.

## Decision

Bit-exact matrix vectors in `test/golden/vectors.json` are the acceptance criterion for every spec-touching change. Each vector records input data, EC level, version, mask, and the expected matrix.

**The set is append-only.** If a change makes an existing vector fail, the change is wrong.

The single exception: a cited ISO/IEC 18004 clause proving the vector itself was wrong. In that case the vector may be corrected — and doing so **requires an ADR** (amending or superseding this one) rather than a commit message, because "the test was wrong" is the exact rationalisation that turns a conformance gate into decoration.

Roundtrip decoding against a devDependency decoder runs as a **supplementary** suite. It catches gross errors early and cheaply. It is never the gate, because a lenient decoder cannot prove conformance.

`render/ascii.js` and `test/helpers/matrix-diff.js` exist so that a failing vector prints two matrices side by side, making the failure diagnosable rather than just red.

Required coverage for spec-touching changes (also in `AGENTS.md` §6):

- All four EC levels — L, M, Q, H.
- Versions 1, 6/7 (version-info bits appear at 7), 9/10 and 26/27 (count-indicator width transitions), 40.
- Each mode alone, plus mixed-mode segmentation.
- Empty string, single character, and **exact-capacity** input.
- Non-ASCII under UTF-8, with and without explicit ECI.

## Consequences

### Good

- Regressions in spec logic are caught mechanically, including in the version/EC combinations nobody manually tests.
- The append-only rule makes the test suite a ratchet: coverage only increases, and a passing suite means something specific.
- Refactoring the encoder becomes safe, which matters because performance work on mask evaluation is expected.
- The version-boundary requirement targets the known off-by-one traps directly (`AGENTS.md` §11), rather than hoping general coverage stumbles into them.

### Bad / costs

- Adding vectors is manual work, and sourcing independently-known expected values is the slow part.
- A genuine spec-interpretation fix is deliberately expensive — it needs a clause citation and an ADR. That friction is the intended design, and it will occasionally be annoying when the vector really is wrong.
- Large vector files in the repo. Acceptable; they compress and are rarely read by humans.
- The append-only rule can be gamed by adding a new vector alongside a quietly-changed old one. Only review catches that.

## Alternatives Considered

- **Roundtrip-only testing.** Rejected — a lenient decoder accepts non-conformant codes, so a green suite proves close to nothing about spec compliance. This is the default approach in this space and it is the reason bugs of this class survive in the wild.
- **Visual or scan-based testing.** Rejected — same leniency objection, plus not automatable.
- **Property-based testing only** (encode arbitrary input, assert invariants). Rejected as the gate, valuable as a supplement — it finds crashes and capacity errors well, but cannot know what the correct bits are.
- **Compare output against another QR library.** Rejected — inherits that library's bugs as our specification, and gives a false independence: two implementations agreeing on a misreading of the spec is not evidence.
- **Mutable golden files regenerated on failure** (`--update-snapshots` style). Rejected emphatically — a snapshot that regenerates when it fails is not a gate. It records what the code does, which is never what needs verifying.

## Enforcement

- `npm test` runs unit, golden, and roundtrip suites; CI blocks merge on failure.
- `AGENTS.md` §10 definition-of-done requires golden vectors for spec-touching changes across the coverage matrix above.
- Vector-file changes are reviewed specifically: a diff to an existing vector without an accompanying ADR is a review block.
