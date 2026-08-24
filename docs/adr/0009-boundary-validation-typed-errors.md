---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§3", "§5"]
---

# ADR-0009: Validate options once at the boundary; typed errors throughout

## Context and Problem Statement

Every public function takes the same options object — around a dozen keys, several interdependent (`version` must sit within `minVersion`/`maxVersion`; `encoding: 'shift-jis'` requires the Kanji entry point; `logo.sizeRatio` is bounded by the EC level's recovery capacity).

Two failure modes to avoid.

Validating in every layer duplicates the rules, costs bytes against the size budget, and guarantees the copies drift.

Validating nowhere is worse. A bad option does not throw — it propagates. `scale: '4'` or `version: 41` produces `NaN` deep inside bit packing, and the output is a syntactically valid image that no scanner can read. The consumer gets no error, just a QR code that silently does not work. That is the worst possible failure for this library.

## Decision

**One** normalizer/validator at the public boundary in `src/index.js`. It produces a canonical, fully-populated options object with defaults applied and every value type-checked and range-checked.

Internal functions **assume** a normalized object and never re-validate. They are documented as internal; reaching past the barrel is unsupported.

**Unknown keys are ignored silently**, never thrown on — forward compatibility, so a consumer passing an option from a newer version against an older install degrades rather than breaks.

All throws use typed classes from `util/errors.js`:

- `QrError` — base class, so consumers can catch everything from this library with one clause.
- `CapacityError` — data does not fit. Carries the byte count and the limit as properties, not just in the message.
- `ModeError` — mode unavailable or inapplicable, including the Kanji-entry-point case.

Never a bare `Error`, never a thrown string. Every message names **the input and the limit**:

```
Data too long: 512 bytes exceeds 384-byte capacity of version 20 at EC level Q
```

`util/assert.js` covers **internal invariants only** and is stripped from production builds. It must never be the validation path for consumer input, since in production it does not exist.

## Consequences

### Good

- Bad input fails immediately, at the call the consumer made, with a message stating what was wrong and what the limit was. Never a silently unscannable code.
- Validation logic exists once, so it cannot drift between layers.
- Internal functions stay small and branch-free on the hot path — meaningful for mask evaluation, which runs over the whole matrix eight times.
- Typed errors with data properties let consumers react programmatically (fall back to a higher EC level, truncate the payload) rather than string-matching messages.
- Ignoring unknown keys means adding an option is never a breaking change for consumers on older installs.

### Bad / costs

- A bug in the normalizer is a bug everywhere. It gets proportionally heavy test coverage.
- Internal functions are genuinely unsafe if called directly with unnormalized input. Anyone deep-importing past `src/index.js` is outside the contract.
- Silently ignoring unknown keys hides typos: `quietzone: 0` (wrong case) is accepted and does nothing. The trade favours forward compatibility, but it is a real usability cost. A dev-only warning for unrecognised keys is a reasonable future addition and would not require superseding this ADR.

## Alternatives Considered

- **Validate at every layer.** Rejected — duplication, bytes, drift.
- **Use a schema/validation library.** Rejected — violates [ADR-0001](0001-zero-runtime-dependencies.md), and a dozen simple constraints do not need a framework.
- **Throw on unknown keys.** Rejected — makes every new option a breaking change for consumers whose installed version is older than their call site. The typo cost is smaller than that.
- **Return error results instead of throwing** (`{ ok, value, error }`). Rejected — unidiomatic for a small frontend library, and forces error handling on every call site including the 99% that pass valid input.
- **Rely on TypeScript types for validation.** Rejected — types vanish at runtime, and plain-JS consumers are a first-class audience ([ADR-0002](0002-vanilla-js-no-typescript-build.md)).

## Enforcement

- Unit tests assert error **type**, not just that something threw, plus message content for each failure mode — over-capacity, invalid version, invalid EC level, unavailable mode, out-of-range scale, over-budget logo ratio.
- ESLint `no-throw-literal` plus a `no-restricted-syntax` rule banning `throw new Error(` inside `src/`, forcing the typed classes.
- The production build strips `assert()` calls; a test asserts that consumer-facing validation still throws correctly in a stripped build, so nothing has quietly come to depend on `assert` for input checking.
