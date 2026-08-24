---
title: Importing the Kanji entry point changes segmentation process-wide
date: 2026-08-24
type: gotcha
status: current
area: src/encode/kanji.js, src/util/mode-registry.js
related: [2026-08-24-verifying-capacity-tables]
---

## What

`src/encode/kanji.js` calls `registerMode()` at module load. Once anything in a module graph imports it -- directly or transitively -- `core/segment.js` treats Kanji as a candidate mode for **every** payload in that process, whether or not `encoding: 'shift-jis'` was requested.

That is intended: Kanji mode is a pure win for Japanese text, so opting in by import is the whole design (ADR-0006, ADR-0016). But it means the import has action-at-a-distance.

## Why it matters

Two concrete ways this bites.

**Tests.** A test file that imports the Kanji entry point changes segmentation for every other test in the same file. Vitest isolates per file, so keeping Kanji tests in their own files (`test/unit/encode/kanji.test.js`, `test/roundtrip/kanji.test.js`) is what stops it leaking. Adding a Kanji case to an existing shared test file would quietly alter unrelated expectations in it.

**Golden vectors.** `scripts/gen-goldens.js` must never import Kanji, transitively included. If it did, the next regeneration would rewrite every regression vector whose payload contains Japanese text -- and the diff would look like a deliberate update rather than an accident. The generator carries a comment saying so.

## How to apply

- Put anything that imports `src/encode/kanji.js` in its own test file.
- Never import it from `scripts/gen-goldens.js` or anything it pulls in.
- When a Kanji test fails in a way that implicates unrelated code, check whether registration leaked into a shared graph before suspecting the encoder.
- `scripts/check-bundles.js` asserts `shift_jis` is absent from the default bundle and present in the Kanji one, in both directions, so a build-level leak is caught. There is no equivalent guard at test level -- that one is file discipline.
