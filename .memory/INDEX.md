# Memory index

Pointer file. One line per entry, newest first per section. No content here — see
`AGENTS.md` §9.4. Architecture decisions are **not** in this directory; they live
in `docs/adr/` (`AGENTS.md` §9.8).

## Handoff

- [M0-M7 complete, M8 is next](handoff/2026-08-24-milestones-m0-m7-complete.md) — clean milestone boundary; the 8 KB size budget is still unenforced, and the optional `exports` entry points do not resolve yet

## Investigations

- [Verifying a data-codeword table row](investigations/2026-08-24-verifying-capacity-tables.md) — derive published numeric capacity from it; internal consistency checks alone are not sufficient

## Gotchas

- [import/no-restricted-paths is inert for non-existent targets](gotchas/2026-08-24-no-restricted-paths-needs-resolvable-target.md) — layer boundaries are only armed once the imported file exists; trust `npm test`, not `npm run lint`
