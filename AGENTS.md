# AGENTS.md — libqr

Operating manual for AI agents working in this repository. Read this file fully before your first edit in a session. If something here conflicts with a user instruction, the user wins — but say out loud that you are deviating, and raise an ADR in `docs/adr/`.

---

## 1. What this project is

`libqr` is a **frontend library for generating QR codes**, written in **vanilla JavaScript**. No framework, no runtime dependencies.

| Property | Value |
| --- | --- |
| Language | Modern JavaScript (ES2022), ESM source |
| Runtime target | Evergreen browsers; Node ≥ 18 for tests/SSR string output |
| Runtime dependencies | **Zero.** Permanently. |
| Direction | Encode only (data → QR matrix → rendered output). Decoding is out of scope. |
| Distribution | npm package + CDN-friendly UMD/IIFE bundle |
| License | MIT |

### Hard constraints (do not violate without an explicit user decision)

1. **Zero runtime dependencies.** `dependencies` in `package.json` stays empty. Build/test tooling lives in `devDependencies`.
2. **No framework coupling.** No React/Vue/Svelte imports anywhere in `src/`. Framework adapters, if ever added, go in separate packages.
3. **Core is environment-agnostic.** Nothing under `src/core/` or `src/ec/` may touch `document`, `window`, `navigator`, `Canvas`, or `fetch`. The core takes a string/bytes and returns a matrix of booleans.
4. **No TypeScript build step.** Source is `.js`. Types are hand-written `.d.ts`. JSDoc annotations carry the type info in source.
5. **Tree-shakeable.** Named exports only, `"sideEffects": false`, no top-level side effects except pure table construction.
6. **Size budget.** `encode + SVG render` path must stay under **8 KB min+gzip**. CI fails the build if `scripts/size-check.js` exceeds budget. Kanji mode and PNG rendering are separate entry points and excluded from that number.
7. **Spec compliance over cleverness.** The reference is ISO/IEC 18004. If an optimization would break spec conformance for any version/EC combination, it is not an optimization.

---

## 2. Directory structure

This is the **target production layout**. The repo currently contains only `LICENSE` and `.gitignore` — create directories as work requires them, but place new files according to this map rather than inventing a new one.

```
libqr/
├── AGENTS.md                  ← this file
├── README.md                  public docs: install, quickstart, API table
├── CHANGELOG.md               Keep-a-Changelog format, hand-maintained
├── LICENSE
├── package.json
├── .editorconfig
├── eslint.config.js           flat config
├── vitest.config.js
├── playwright.config.js       browser-render tests only
├── rollup.config.js           bundling: esm / cjs / iife
│
├── .github/
│   └── workflows/
│       ├── ci.yml             lint → unit → golden → browser → size-check
│       └── release.yml        tag → npm publish --provenance
│
├── .memory/                   ← agent hand-off notes. See §9. COMMITTED.
│   ├── INDEX.md
│   ├── handoff/
│   ├── investigations/
│   └── gotchas/
│
├── src/
│   ├── index.js               PUBLIC BARREL. The only file consumers import by default.
│   │
│   ├── core/                  spec logic. Pure. No DOM. No I/O.
│   │   ├── qr.js              orchestrator: encode(data, opts) → QrResult
│   │   ├── segment.js         segment model + optimal segmentation (mode switching)
│   │   ├── mode.js            mode detection; reads mode constants from encode/
│   │   ├── version.js         version selection, capacity tables, size math
│   │   ├── matrix.js          module grid; function-pattern placement & reservation
│   │   ├── patterns.js        finder, timing, alignment, dark module
│   │   ├── mask.js            8 mask patterns + penalty scoring + best-mask pick
│   │   ├── format-info.js     BCH(15,5) format bits + BCH(18,6) version bits
│   │   └── constants.js       spec tables (generated — see scripts/gen-tables.js)
│   │
│   ├── ec/                    error correction. Pure math.
│   │   ├── galois.js          GF(256) log/exp tables, mul/div
│   │   ├── polynomial.js      poly mul, mod
│   │   ├── reed-solomon.js    generator polys, ECC codeword computation
│   │   └── blocks.js          block splitting + interleaving. Takes a
│   │                          descriptor; holds no tables (ADR-0012).
│   │
│   ├── encode/                per-mode bit encoders. Each owns its own mode
│   │   │                      indicator + count-width triple (ADR-0012).
│   │   ├── numeric.js
│   │   ├── alphanumeric.js
│   │   ├── byte.js            UTF-8 (default) and Latin-1
│   │   ├── kanji.js           Shift-JIS. SEPARATE ENTRY POINT — never imported by core.
│   │   └── eci.js             ECI designator emission
│   │
│   ├── render/                matrix → output. May read core types, never mutate them.
│   │   ├── svg.js             string SVG (works in Node) — the default renderer
│   │   ├── canvas.js          draws into a provided CanvasRenderingContext2D
│   │   ├── png.js             canvas → Blob/dataURL. Browser only.
│   │   ├── ascii.js           terminal/debug output. Used heavily by tests.
│   │   └── shared/
│   │       ├── geometry.js    quiet zone, scale, module→rect, path merging
│   │       ├── style.js       colors, module shapes (square/dot/rounded), contrast check
│   │       └── logo.js        center overlay + EC-budget safety check
│   │
│   ├── dom/                   browser conveniences. Optional entry point.
│   │   ├── element.js         <qr-code> custom element
│   │   └── mount.js           mount(target, data, opts) imperative helper
│   │
│   ├── util/
│   │   ├── errors.js          typed error classes (see §5)
│   │   ├── assert.js          dev-time invariant checks, stripped in prod build
│   │   ├── bitbuffer.js       append-only bit writer (Uint8Array backed). In
│   │   │                      util/, not core/ -- both core/ and encode/ need
│   │   │                      it (ADR-0012).
│   │   └── text.js            UTF-8 encoding, codepoint classification
│   │
│   └── types/
│       └── index.d.ts         hand-written public types. Update with every API change.
│
├── test/
│   ├── unit/                  mirrors src/ path-for-path
│   ├── golden/
│   │   ├── vectors.json       {data, ecLevel, version, mask, expectedMatrix}
│   │   └── *.svg              committed SVG snapshots
│   ├── roundtrip/             encode → decode with a devDependency decoder
│   ├── browser/               Playwright: canvas/PNG/custom-element
│   └── helpers/
│       ├── matrix-diff.js     prints two matrices side by side on failure
│       └── fixtures.js
│
├── bench/
│   └── encode.bench.js        vitest bench; guards against perf regressions
│
├── examples/                  plain .html files, no build step, opened directly
├── docs/
│   ├── adr/                   ARCHITECTURE DECISION RECORDS. See §9.8.
│   │   ├── README.md          index, numbering, lifecycle, recording obligation
│   │   └── NNNN-*.md          one decision each, MADR-lite
│   ├── api.md                 generated from JSDoc + hand edits
│   └── spec-notes.md          ISO/IEC 18004 reading notes, table provenance
├── scripts/
│   ├── gen-tables.js          emits src/core/constants.js — commit the output
│   ├── size-check.js          gzip budget gate
│   └── release.js
└── dist/                      BUILD OUTPUT. gitignored. Never hand-edit.
```

### Dependency direction — enforced, not aspirational

```
util  ←  ec  ←  core  ←  render  ←  dom
                  ↑
              encode
```

- Arrows point **toward the importer**. `core` may import `ec`, `encode`, `util`. `render` may import `core` and `util`. `dom` may import everything.
- **Spec data lives at the lowest layer that owns the concept; layers below take it as a parameter** rather than reading upward — see [ADR-0012](docs/adr/0012-spec-data-placement-across-layers.md). The lint zones have no `except` clauses, deliberately.
- **Nothing imports downstream.** `core` importing from `render/` or `dom/` is a review-blocking error.
- `src/index.js` is the only file allowed to re-export across layers.

### Adding a file — checklist

1. Does it belong to an existing layer? Put it there. Do not create a new top-level `src/` directory without raising an ADR (§9.8).
2. Add the mirrored test file under `test/unit/` in the same relative path.
3. If it changes the public surface: update `src/index.js`, `src/types/index.d.ts`, `README.md`, and `CHANGELOG.md`.

---

## 3. Public API contract

`src/index.js` exports these and nothing else. Treat this as frozen; additions need a minor version, changes need a major.

```js
// Primary
export function qr(data, options)          // → QrResult
export function toSvg(data, options)       // → string
export function toAscii(data, options)     // → string

// Lower level — for consumers holding a matrix already
export { encode } from './core/qr.js'      // data → matrix, no rendering
export { matrixToSvg } from './render/svg.js'
export { matrixToAscii } from './render/ascii.js'
export { Matrix } from './core/matrix.js'
export { normalizeOptions, DEFAULTS as DEFAULT_OPTIONS } from './util/options.js'

// Errors
export { QrError, CapacityError, ModeError, OptionError } from './util/errors.js'

// Constants
export { ECLevel, MAX_VERSION, MIN_VERSION } from './core/constants.js'
export { Mode } from './core/mode.js'
```

`toCanvas`, `toDataUrl`, Kanji mode, and the custom element are **not** here. They live behind their own entry points so the default path keeps its size budget — see [ADR-0006](docs/adr/0006-multiple-entry-points-size-budget.md):

```js
import { toCanvas } from 'libqr/canvas';
import { toDataUrl } from 'libqr/png';
import 'libqr/kanji';    // registers Shift-JIS support
import 'libqr/element';  // defines <qr-code>
```

### Options object — the single shape used everywhere

```js
{
  ecLevel: 'M',            // 'L' | 'M' | 'Q' | 'H'
  version: undefined,      // 1..40; undefined = smallest that fits
  minVersion: 1,
  maxVersion: 40,
  mask: undefined,         // 0..7; undefined = auto (lowest penalty)
  encoding: 'utf-8',       // 'utf-8' | 'latin1' | 'shift-jis'
  quietZone: 4,            // modules. Never render below 4 without a warning.
  scale: 4,                // px per module
  margin: undefined,       // alias for quietZone in px; quietZone wins if both set
  dark: '#000000',
  light: '#ffffff',
  shape: 'square',         // 'square' | 'dot' | 'rounded'
  logo: undefined,         // { src, sizeRatio } — see render/shared/logo.js
  eci: undefined,          // explicit ECI number, overrides inference
}
```

**Rules.** Options are validated once per public call, by the single validator in `src/util/options.js` — there is more than one public boundary, so it lives at the bottom layer where all of them can reach it ([ADR-0013](docs/adr/0013-option-normalization-placement.md)). Internal functions assume a normalized, frozen options object and do not re-validate; `core/qr.js` exposes `encodeNormalized()` for callers that have already normalized. Unknown keys are ignored silently (forward compatibility), never thrown on.

---

## 4. QR domain reference

Keep this handy so you do not re-derive spec constants from memory — getting these wrong produces codes that *scan on your phone* but fail on strict readers.

**Geometry.** Versions 1–40. Side length = `4 × version + 17` modules (21 → 177). Timing patterns on row 6 and column 6. Dark module always at `(row 4×version + 9, col 8)`. Quiet zone minimum 4 modules.

**EC levels & format bits.** Recovery ≈ L 7%, M 15%, Q 25%, H 30%. Format-info indicator bits: **L=01, M=00, Q=11, H=10** — note this is *not* the intuitive order and is a classic bug source.

**Mode indicators (4 bits).** Numeric `0001`, Alphanumeric `0010`, Byte `0100`, Kanji `1000`, ECI `0111`, Structured Append `0011`, FNC1-first `0101`, FNC1-second `1001`.

**Character-count indicator width (bits), by version range:**

| Mode | v1–9 | v10–26 | v27–40 |
| --- | --- | --- | --- |
| Numeric | 10 | 12 | 14 |
| Alphanumeric | 9 | 11 | 13 |
| Byte | 8 | 16 | 16 |
| Kanji | 8 | 10 | 12 |

**Bit packing.** Numeric: 3 digits → 10 bits, 2 → 7, 1 → 4. Alphanumeric: 2 chars → 11 bits, 1 → 6; charset is `0-9 A-Z space $ % * + - . / :` (uppercase only). Byte: 8 bits per byte. Kanji: 13 bits per Shift-JIS pair.

**Tail.** Terminator `0000` (truncated if capacity is short), pad to byte boundary with zeros, then alternate pad bytes `0xEC`, `0x11`.

**Reed–Solomon.** GF(256), primitive polynomial `0x11D` (285), generator element 2.

**BCH.** Format info: 5 data bits (2 EC + 3 mask), generator `0x537`, XOR final with `0x5412`. Version info (v ≥ 7 only): 6 data bits, generator `0x1F25`, no XOR.

**Mask penalties.** N1 = 3 (run of 5+ same-color modules: `3 + runLength − 5`), N2 = 3 (per 2×2 same-color block), N3 = 40 (per `1011101` pattern with 4 light modules on either side), N4 = 10 (per 5% that dark-module proportion deviates from 50%). Lowest total wins; ties break to the lower mask index.

Whenever you touch any of the above, add or update a golden vector in `test/golden/vectors.json`. Spec bugs are invisible to eyeball testing.

---

## 5. Coding conventions

- **Modules.** ESM only. Explicit `.js` extensions in relative imports. No barrel files inside `src/` except `src/index.js`.
- **Naming.** `camelCase` functions/variables, `PascalCase` classes/error types, `SCREAMING_SNAKE` module-level constants, `kebab-case.js` filenames.
- **Functions over classes.** Use a class only when identity + mutable state genuinely belong together (`BitBuffer`, `Matrix`, error types). Everything else is a pure function.
- **No `default` exports.** Named exports only, for tree-shaking and grep-ability.
- **Typed arrays.** `Uint8Array` / `Uint8ClampedArray` for codewords and module data. Avoid `Array<boolean>` in hot paths; avoid `Array.prototype.map`/`filter` chains inside per-module loops.
- **No allocation in inner loops.** Mask evaluation runs 8× over the whole matrix. Preallocate, reuse, mutate.
- **Errors.** Throw typed errors from `util/errors.js` — never bare `Error`, never a string. Every message states the input and the limit: `"Data too long: 512 bytes exceeds 384-byte capacity of version 20 at EC level Q"`.
- **JSDoc.** Every exported function gets a JSDoc block with `@param`, `@returns`, `@throws`. This is the type source of truth alongside `types/index.d.ts`.
- **Comments.** Explain *why* and cite the spec section for anything non-obvious (`// ISO/IEC 18004 §8.9 — mask evaluation`). Do not narrate what the code plainly does.
- **`assert.js`.** Use for internal invariants only. It is stripped from production builds, so never rely on it for user-input validation.
- **No `console.*`** in `src/`. Ever.

---

## 6. Testing

| Layer | Tool | What it proves |
| --- | --- | --- |
| Unit | Vitest | Each module's contract, edge cases, error paths |
| Golden | Vitest + `test/golden/` | Bit-exact matrices against known-good vectors |
| Roundtrip | Vitest + decoder devDep | Generated codes actually decode to the input |
| Browser | Playwright | Canvas/PNG/custom-element in a real browser |
| Bench | `vitest bench` | No silent perf regressions |

**Required coverage for any spec-touching change:**

- All four EC levels.
- Version boundaries: 1, 6/7 (version-info bits appear at 7), 9/10 and 26/27 (count-indicator width changes), 40.
- Each mode alone, plus mixed-mode segmentation.
- Empty string, single character, and exact-capacity input (the off-by-one that capacity math always gets wrong).
- Non-ASCII input under UTF-8 with and without an explicit ECI.

**Golden vectors are append-only.** If a change makes an existing vector fail, the change is wrong — unless you can cite the spec clause proving the vector was wrong, in which case update the vector and raise an ADR — see `docs/adr/0008-golden-vectors-conformance-gate.md`.

**Every vector declares its `source`** ([ADR-0014](docs/adr/0014-golden-vector-provenance.md)): `published` means the expected value comes from an ISO/IEC 18004 worked example and is independent evidence; `regression` means it only locks in current output. Regression vectors must additionally decode back to their input, so a lock is never merely "whatever the code did". Do not add a `published` vector without a `note` naming where the value came from.

Target commands (create these scripts in `package.json` as the project takes shape):

```bash
npm run lint          # eslint
npm test              # vitest run — unit + golden + roundtrip
npm run test:browser  # playwright
npm run build         # rollup → dist/
npm run size          # gzip budget gate
npm run bench
```

Do not report work complete without running lint + tests. If a command does not exist yet, say so explicitly rather than implying it passed.

---

## 7. Build & release

- `rollup.config.js` produces: `dist/libqr.esm.js`, `dist/libqr.cjs`, `dist/libqr.iife.min.js` (global `libqr`), plus `.min` variants and sourcemaps.
- **Entry points** in `package.json` `exports`: `.`, `./svg`, `./canvas`, `./png`, `./kanji`, `./element`. Kanji and PNG stay separate so the default path keeps its size budget.
- `"sideEffects": false`. `"files": ["dist", "src", "README.md", "LICENSE"]`.
- Versioning is semver. Any change to a rendered output's pixels or to the emitted matrix is at minimum a minor bump; changing default option values is a major.
- `dist/` is never committed and never hand-edited.

---

## 8. Git & PR conventions

- Branch from `main`. Names: `feat/…`, `fix/…`, `perf/…`, `docs/…`, `chore/…`.
- Conventional Commits, imperative subject ≤ 50 chars. Body only when the *why* is not obvious from the subject. Scope is the layer: `feat(render): add rounded module shape`.
- **Commit and push only when the user asks.** Never push to `main` directly.
- PR body: what changed, why, spec clause if applicable, test evidence, and size-check delta if the bundle moved.
- One logical change per PR. Table regeneration (`scripts/gen-tables.js` output) goes in its own commit, separate from logic changes, so diffs stay reviewable.

---

## 9. Memory & hand-off protocol

Sessions end. Context windows fill. **Written memory is the only thing that survives.** Treat `.memory/` as a first-class part of the codebase.

There are two distinct stores — do not confuse them:

| Store | Location | Scope | Committed? |
| --- | --- | --- | --- |
| **Repo memory** | `.memory/` in this repo | Shared across every agent and human who clones the repo | **Yes** |
| Private memory | your own agent memory directory | Personal to one agent/user, includes user preferences | No |

Sections 9.1–9.7 are about **repo memory** (`.memory/`) — hand-offs, investigations, and gotchas, so the next agent finds them regardless of which one it is.

**Architecture decisions do not live in `.memory/`.** They live in `docs/adr/`. See §9.8 — that split is deliberate and load-bearing.

### 9.1 Layout

```
.memory/
├── INDEX.md            one line per entry. The only file loaded on every session start.
├── handoff/            state of in-flight work. Ephemeral — delete when the work lands.
├── investigations/     what we learned digging into a problem. Durable.
└── gotchas/            traps that already cost someone an hour. Durable.
```

No `decisions/` directory. Architecture decisions go to `docs/adr/` (§9.8).

### 9.2 File format

One file, one topic. Filename `YYYY-MM-DD-kebab-slug.md`. Every file starts with frontmatter:

```markdown
---
title: Reed–Solomon block interleaving order
date: 2026-08-24
type: investigation        # handoff | investigation | gotcha
status: current            # current | superseded | done
area: ec/blocks.js         # file or subsystem this concerns
related: [2026-08-20-version-capacity-tables]
---

## What

One paragraph. What is the fact or the state of the work.

## Why it matters

The consequence. What breaks or gets slower or gets wrong without knowing this.

## How to apply

Concrete: the file to open, the function to call, the command to run, the next step to take.
```

Cross-link with `[[2026-08-24-slug]]`. A link to a file that does not exist yet is fine — it marks something worth writing.

### 9.3 Type-specific bodies

**`handoff/`** — this is the one you must write before a session ends with work unfinished. Required sections:

```markdown
## Done
- Bullets, with file:line references.

## Not done
- Bullets. Be explicit about what a reader might wrongly assume is finished.

## Next step
The single next action, precisely enough that another agent can start it cold.

## State of the tree
Branch name. Files modified but uncommitted. Whether tests currently pass — and if not,
paste the actual failing output.

## Traps hit
Anything that wasted time. Promote genuinely durable ones to gotchas/.
```

**`investigations/`** — record the answer *and* the path taken, including dead ends. "I checked X, it is not the cause" saves the next agent the same hour.

**`gotchas/`** — short and imperative. Symptom → cause → fix. Examples worth having in this project: EC level bit ordering (`L=01, M=00`), count-indicator width transitions at v10 and v27, terminator truncation at exact capacity, Shift-JIS pairs crossing a segment boundary.

### 9.4 INDEX.md

Plain list, one line per entry, newest first per section. No frontmatter. **Never put content in INDEX.md** — it is a pointer file, and it grows into context on every session.

```markdown
# Memory index

## Handoff
- [Mask penalty N3 rewrite](handoff/2026-08-24-mask-n3.md) — WIP, 2 golden vectors failing

## Investigations
- [RS block interleave order](investigations/2026-08-24-rs-interleave.md) — group 2 blocks are longer, not shorter

## Gotchas
- [EC level bits are not in level order](gotchas/2026-08-24-ec-level-bit-order.md) — L=01, M=00
```

### 9.5 When to write

Write memory when:

- You made a non-obvious call another agent could plausibly reverse by accident. **If it is a build decision, it goes to `docs/adr/` — see §9.8.**
- You lost meaningful time to something surprising.
- A session ends with work in flight — **always** a `handoff/` file, no exceptions.
- You derived or verified a spec constant the hard way.
- The user stated a project constraint that is not visible in the code.

**Do not** write memory for:

- Anything the code, tests, or `git log` already say. Memory is for what is *not* recoverable from the repo.
- Restating this file.
- Conversation-local trivia ("user asked me to rename a variable").
- Secrets, tokens, credentials, or personal data. Never.

### 9.6 Hygiene

- **Check before creating.** Read `INDEX.md` first; update the existing file instead of adding a near-duplicate.
- **Absolute dates only.** "Last Tuesday" is worthless in three months.
- **Delete what turns out wrong.** A stale gotcha is worse than no gotcha — it sends the next agent down a dead path with confidence.
- **Delete handoffs when the work lands.** Their whole purpose is to be temporary.
- **Verify before trusting.** Memory reflects what was true when written. If an entry names a file, function, or flag, confirm it still exists before acting on it.
- Memory files are committed like any other change: `chore(memory): record RS interleave findings`.

### 9.7 Session start / session end

**Start:** read `AGENTS.md`, then `docs/adr/README.md` (the index — the ADR bodies only as needed), then `.memory/INDEX.md`, then any `handoff/` file with `status: current`. That is your briefing — do it before touching code.

**End:** if work is incomplete, write the handoff. If you took a build decision, the ADR and its memory pointer must already exist (§9.8) — they are not end-of-session cleanup. If you learned something durable, write it to the right folder. Update `INDEX.md`. Then report to the user: what changed, where it lives, and the next command to run.

### 9.8 Architecture decisions — the recording obligation

**Every build decision is recorded when it is taken, not retroactively.**

A "build decision" is anything that shapes how the library is constructed or shipped: a dependency taken or refused, a build or tooling choice, a layering or module-boundary change, a public API shape, a default option value, a testing gate, an entry point, a release policy. If you weighed options, it is a build decision.

The obligation is a **dual write** — both, every time:

1. **`docs/adr/NNNN-slug.md`** — the ADR. Context, decision, consequences (good and bad), alternatives with why each was rejected, and how the decision is enforced. Follow the template in `docs/adr/README.md`. Add the row to that file's index table.
2. **Your own agent memory** — a short pointer entry: what was decided, and that it is recorded in `docs/adr/NNNN-slug.md`. **Pointer only.** Never copy the ADR body into memory; the copy drifts from the file it duplicates and then actively misleads.

The ADR is the durable record in the repo. The memory pointer is what makes a future cold-start session go and read it instead of re-deciding from scratch. Neither substitutes for the other.

Rules:

- **Same change as the decision.** The ADR lands in the commit or PR that puts the decision into effect, so code and rationale are never separated.
- **Not settled yet?** Write it with `status: proposed`. A visible open question is useful; an unrecorded settled decision is not.
- **Reversing an existing decision** means superseding its ADR — new file, `supersedes` and `superseded-by` filled in on both sides. Never edit an accepted ADR in place, and never delete one.
- **Numbers are permanent.** Zero-padded four digits, monotonic, never reused, never renumbered.
- Every ADR needs a non-empty `## Enforcement` section. If nothing mechanical can enforce it, write "review only" and say so plainly.

`docs/adr/README.md` holds the full process, the lifecycle, and the copy-paste template.

---

## 10. Definition of done

A change is done when all of these hold:

- [ ] `npm run lint` clean.
- [ ] `npm test` green, including golden vectors.
- [ ] New behavior has tests; spec-touching changes have golden vectors across all four EC levels and the version boundaries in §6.
- [ ] `npm run size` within budget, delta noted if it moved.
- [ ] `src/types/index.d.ts` matches the actual public surface.
- [ ] `src/index.js` exports nothing undocumented; nothing documented is missing.
- [ ] `README.md` and `CHANGELOG.md` updated if the public API moved.
- [ ] Zero runtime dependencies still true.
- [ ] Dependency direction (§2) unviolated.
- [ ] Any build decision taken is recorded as an ADR in `docs/adr/` **and** as a pointer in agent memory (§9.8).
- [ ] `.memory/` updated if anything non-obvious was decided or learned.

If you cannot satisfy an item, say which one and why — do not quietly drop it.

---

## 11. Known traps

- **EC level bits are not in level order.** `L=01, M=00, Q=11, H=10`. Sorting levels by recovery percentage and using the index produces codes that scan on lenient readers and fail on strict ones.
- **Count-indicator width changes at v10 and v27.** Choose the version *before* encoding segment headers, or re-encode after version selection. Getting this wrong only breaks large payloads, so unit tests with short strings will not catch it.
- **Terminator truncation.** At exact capacity the `0000` terminator is truncated, not omitted-and-padded. Test exact-capacity input explicitly.
- **Byte-mode count indicator is 16 bits for both v10–26 and v27–40** — it does not step up a third time like the other modes.
- **Mask tie-breaking.** Equal penalties resolve to the lower mask index. Iteration order matters for reproducible output.
- **Quiet zone is part of the code.** Rendering with `quietZone: 0` because it "looks tighter" produces codes that fail against busy backgrounds. Warn, do not silently allow.
- **Logo overlays eat error correction.** `render/shared/logo.js` must reject a `sizeRatio` that exceeds the EC budget for the chosen level, rather than producing an unscannable image.
- **`dist/` is generated.** If you find yourself editing it, you are in the wrong file.
