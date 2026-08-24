---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§1", "§4"]
---

# ADR-0016: Derive the Shift-JIS mapping from the platform, not a shipped table

## Context and Problem Statement

Kanji mode encodes a character in 13 bits where byte mode needs 24 for the same character in UTF-8 -- close to a 2x saving on Japanese text. To do it, the encoder needs a Unicode-to-Shift-JIS mapping for roughly 7,000 characters.

`TextEncoder` only produces UTF-8, so there is no built-in *encoder* to lean on. The obvious answer is to ship the table, which is what [ADR-0006](0006-multiple-entry-points-size-budget.md) assumed when it budgeted `./kanji` at 12 KB and made it a separate entry point specifically so default-path consumers would not pay for it.

Two problems with shipping it. First, size: 7,000 entries is roughly 14 KB gzipped however cleverly it is encoded, which is nearly twice the entire default bundle. Second, and worse, provenance. A hand-transcribed 7,000-entry table has no realistic review path, and a single wrong entry produces a symbol that decodes to the wrong character -- silently, for one character, probably not the one anyone tested.

But there *is* a platform Shift-JIS **decoder**. `TextDecoder('shift_jis')` is required of browsers by the Encoding Standard, whose `index-jis0208` is normative, and Node has it whenever built with full ICU (the default since Node 14).

A decoder inverts. Iterating every valid two-byte sequence and decoding it yields the reverse mapping, from an authoritative source, at zero shipped bytes.

## Decision

`src/encode/kanji.js` builds its Unicode-to-13-bit map by iterating the two Shift-JIS ranges Kanji mode covers, decoding each pair with `TextDecoder('shift_jis', { fatal: true })`, and recording the result.

- **Built on first use, not at import.** Roughly 7,000 decodes, so a page that imports the entry point but encodes nothing Japanese pays nothing.
- **Cached** thereafter for the process.
- **Absent decoder throws a `QrError`** naming the cause -- a small-icu Node build -- and pointing at the UTF-8 byte-mode alternative. It does not fall back silently, because falling back would produce a symbol in a different character set than the caller asked for.
- **First mapping wins** where a character has duplicate encodings, which yields the lower and canonical Shift-JIS value.

Measured result: `./kanji` is **1.03 KB** gzipped, against the 12 KB the table-shipping assumption budgeted. The budget was tightened to 1.5 KB so it remains a gate rather than a formality.

## Consequences

### Good

- The entry point is around a kilobyte instead of fourteen. This is the largest single size win in the library.
- The data comes from the platform's own Shift-JIS index rather than a transcription, so the whole class of single-wrong-entry bugs is gone. Nothing to review, nothing to keep in sync, no generated-file drift to guard ([ADR-0007](0007-generated-committed-spec-tables.md) does not need to cover it).
- No generator, no committed artefact, no regeneration step.
- Verified against the two worked examples in ISO/IEC 18004 section 8.4.5 -- 点 to `0110110011111` and 茗 to `1101010101010` -- both exact. A wrong table source would not reproduce both published bit strings.
- Independently confirmed by 26 round-trip tests against a third-party decoder.

### Bad / costs

- **A dependency on platform capability rather than on shipped data.** A Node build compiled with small-icu has no Shift-JIS decoder, and Kanji mode simply does not work there. Detected and reported clearly, but it is a real environment restriction the other modes do not have.
- Roughly 7,000 decode calls on first use. Milliseconds, and deferred, but not free.
- Engines could in principle disagree on the mapping. In practice the Encoding Standard is normative for browsers and ICU matches it across this range, and the two spec examples are asserted at test time -- but this is a correctness property now resting on the platform rather than on our own data.
- The mapping cannot be inspected in the repository. Someone asking "what does this encode 漢 as" has to run code rather than read a file.

## Alternatives Considered

- **Ship a generated table**, produced by this same decoding trick at build time and committed per [ADR-0007](0007-generated-committed-spec-tables.md). This was the plan. Rejected once measured: it costs ~14 KB gzipped to avoid a platform dependency that browsers do not have and Node has by default. Worth revisiting **only** if a real consumer is blocked by a small-icu environment -- the code to generate it is three lines different from what is here.
- **Hand-transcribe the table.** Rejected outright. 7,000 entries with no review path, and the failure mode is one wrong character in a payload nobody tested.
- **Depend on a Shift-JIS encoding package.** Rejected -- violates [ADR-0001](0001-zero-runtime-dependencies.md), and would be larger than the table it replaced.
- **Drop Kanji mode.** Considered, since it is the least-used mode. Rejected for the reason [ADR-0006](0006-multiple-entry-points-size-budget.md) already gives: a library claiming spec compliance while silently omitting a mode is misleading. At a kilobyte behind an entry point it costs nobody anything.
- **Fall back to UTF-8 byte mode when no decoder exists.** Rejected -- the caller asked for Shift-JIS and would get a different character set with no error. Precisely the silent-wrong-output failure [ADR-0009](0009-boundary-validation-typed-errors.md) exists to prevent, and the same bug that was found and fixed in the `encoding: 'shift-jis'` path.

## Enforcement

- `test/unit/encode/kanji.test.js` asserts both ISO/IEC 18004 section 8.4.5 worked examples bit for bit, which is the independent conformance evidence for this mode.
- The same file asserts the table covers more than 6,000 characters, so a source that silently came back near-empty fails rather than passing every narrower test.
- `test/roundtrip/kanji.test.js` -- 26 cases through a third-party decoder, covering kanji, hiragana, katakana, Greek, mixed-mode payloads, all four EC levels, and versions 1 through 40.
- `scripts/check-bundles.js` asserts `shift_jis` appears in the Kanji bundle and **not** in the default bundle, checked in both directions so neither assertion can pass vacuously.
- The size gate holds `./kanji` to 1.5 KB, so a future change that reintroduces a shipped table fails the build.
