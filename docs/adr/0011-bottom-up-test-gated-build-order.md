---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§6", "§10", "§11"]
---

# ADR-0011: Bottom-up, test-gated build order

## Context and Problem Statement

The repository is empty. The order in which it gets built is a decision with consequences, not a scheduling detail.

The instinctive order is renderer-first: get something on screen, then fix the maths. It feels productive and gives early feedback. In this domain it is close to a trap.

A QR code drawn from a partially-correct matrix looks like a QR code. It has finder patterns, it has plausible noise, and it may well scan on a phone ([ADR-0008](0008-golden-vectors-conformance-gate.md) explains why phone-scanning proves nothing). So renderer-first buys feedback that cannot distinguish correct from incorrect — the most expensive kind of false confidence.

It also compounds. Every bug found after that point has two candidate locations: the encoder or the renderer. Debugging against an unverified base means never being able to bisect the problem cleanly.

## Decision

Build strictly **upward** through the dependency graph of [ADR-0003](0003-layered-one-way-dependencies.md): `util` → `ec` → `encode` → `core` → `render` → `dom`.

Every milestone's exit gate is a **passing test**, never a demo and never a screenshot. Nothing renders until the matrix is provably correct.

`render/ascii.js` is the deliberate exception in spirit — it may be pulled forward to M5 purely as a debugging tool, because printing a matrix to a terminal is instrumentation, not output.

### Milestones

| M | Scope | Exit gate |
| --- | --- | --- |
| M0 | `package.json` (empty `dependencies`, `exports` map, `sideEffects: false`), `eslint.config.js` with the ADR-0003 import zones, vitest config, `.editorconfig`, CI skeleton, `docs/adr/`, `.memory/INDEX.md` | `npm run lint` green; **and** the ADR-0003 zones provably reject a deliberately-introduced bad import |
| M1 | `scripts/gen-tables.js` → `src/core/constants.js` | Spot-checks against known ISO figures (v1-M = 16 data codewords, v40-L = 2956); regenerate-and-diff clean per [ADR-0007](0007-generated-committed-spec-tables.md) |
| M2 | `ec/galois.js`, `ec/polynomial.js`, `ec/reed-solomon.js` | Known RS vectors pass; generator polynomials for degrees 7, 10, 13, 17 match the specification |
| M3 | `util/text.js`, `core/bitbuffer.js`, `encode/{numeric,alphanumeric,byte}.js`, `encode/eci.js`, `core/mode.js`, `core/segment.js` | Bitstream hex equals published vectors (`"HELLO WORLD"`, mixed-mode); pad bytes `0xEC`/`0x11` alternate correctly |
| M4 | `core/version.js`, `ec/blocks.js` | Exact-capacity **and** capacity-plus-one across all four EC levels; interleave-order vector; terminator truncation at exact capacity |
| M5 | `core/matrix.js`, `core/patterns.js` | ASCII snapshots of function patterns for v1, v7, v40; dark module at `(4V+9, 8)` |
| M6 | `core/mask.js`, `core/format-info.js` | Penalty scores for all 8 masks on a fixed payload; format bit strings for all 32 EC×mask combinations; version-info bits for v7 and above |
| M7 | `core/qr.js`, `render/shared/{geometry,style}.js`, `render/svg.js`, `render/ascii.js`, `util/errors.js`, `src/index.js`, `types/index.d.ts` | Golden SVG snapshots and roundtrip decoding green. **First releasable point — 0.1.0** |
| M8 | `rollup.config.js`, `scripts/size-check.js`, CI wiring, `bench/` | Default path under 8 KB gzip; CI green end to end |
| M9 | `render/canvas.js`, `render/png.js`, `dom/mount.js`, `dom/element.js`, `examples/*.html`, Playwright suite | Browser tests green; **default entry size unchanged** from M8 |
| M10 | `encode/kanji.js` (separate entry), `render/shared/logo.js`, `docs/api.md`, `README.md`, `CHANGELOG.md`, release workflow | Kanji roundtrip passes; logo rejects an over-budget `sizeRatio`; default entry size still unchanged |

M2 through M6 are a strict dependency chain — each needs the one before it — so there is no parallelisation available even in principle.

## Consequences

### Good

- Every layer is verified before anything depends on it, so a bug found at M6 is in M6. Bisection is free.
- The lint zones get proven at M0, when the config is small. A misconfigured zone is indistinguishable from no zone, so verifying it once at the start is worth a milestone gate.
- M7 as the first releasable point is honest: at that moment the library encodes correctly and renders portably, and everything after is additive.
- M9 and M10 both gate on "default entry size unchanged", which is the check that catches optional features leaking into the default path ([ADR-0006](0006-multiple-entry-points-size-budget.md)).
- Table data lands at M1, so every later milestone tests against real capacity figures rather than placeholders.

### Bad / costs

- **No visual output until M7.** That is a long stretch of pure arithmetic with nothing to show, and it is genuinely demoralising — worth naming rather than pretending otherwise. Pulling `render/ascii.js` forward to M5 gives a terminal-visible matrix and mitigates most of it.
- Front-loads the hardest work. Motivation is highest at the start, which suits the ordering, but an early stall lands on GF(256) arithmetic rather than something reversible.
- Milestone tables rot. See the note below.

**On the table specifically:** it is the plan of record at time of writing, illustrating the principle. The **principle is what binds** — build upward through the graph, gate on tests, correctness before pixels. If the sequence changes materially, amend this ADR rather than letting the table quietly diverge from reality. A stale milestone table that nobody trusts is worse than no table.

## Alternatives Considered

- **Renderer-first.** Rejected — validates nothing, produces confidence that cannot distinguish correct from incorrect output, and leaves every later bug with two candidate causes.
- **Public API first, stub internals.** Rejected — the API shape is already settled in `AGENTS.md` §3, so there is nothing to learn from stubbing it, and stubs invite tests that assert on stub behaviour.
- **Parallel tracks** (encoder and renderer simultaneously). Rejected — single author/agent, and M2–M6 are strictly sequential regardless.
- **Vertical slice first** (numeric mode, v1, level L, end to end). Genuinely tempting — it reaches a working artifact fastest. Rejected because the table and block-structure code written for one version tends to get hard-coded shortcuts that then have to be unpicked, and because the version-boundary bugs ([ADR-0008](0008-golden-vectors-conformance-gate.md)) only appear once all 40 versions are in play. Worth reconsidering if motivation, rather than correctness, becomes the binding constraint.

## Enforcement

- Each milestone's gate is a runnable command or an assertable test, not a judgement call. A milestone is not complete until its gate is green in CI.
- M0's gate includes an adversarial check — deliberately violate the import zones and confirm lint fails — so the enforcement mechanism for [ADR-0003](0003-layered-one-way-dependencies.md) and [ADR-0004](0004-pure-core-matrix-boundary.md) is itself verified.
- Milestone completion is recorded in `.memory/handoff/` per [ADR-0010](0010-repo-committed-agent-memory.md), so a session resuming mid-sequence knows which gate it is working toward.
