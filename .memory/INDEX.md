# Memory index

Pointer file. One line per entry, newest first per section. No content here — see
`AGENTS.md` §9.4. Architecture decisions are **not** in this directory; they live
in `docs/adr/` (`AGENTS.md` §9.8).

## Handoff

- [Build complete, nothing committed](handoff/2026-08-24-build-complete-uncommitted.md) — all ten milestones done, 680 tests green, seven entry points inside budget; the only outstanding item is that no commit was ever made

## Investigations

- [Verifying a data-codeword table row](investigations/2026-08-24-verifying-capacity-tables.md) — derive published numeric capacity from it; internal consistency checks alone are not sufficient

## Gotchas

- [Kanji registration is process-wide](gotchas/2026-08-24-kanji-registration-is-process-wide.md) — importing the entry point changes segmentation for every payload in that process; keep it out of shared test files and out of the golden generator

- [import/no-restricted-paths is inert for non-existent targets](gotchas/2026-08-24-no-restricted-paths-needs-resolvable-target.md) — layer boundaries are only armed once the imported file exists; trust `npm test`, not `npm run lint`
