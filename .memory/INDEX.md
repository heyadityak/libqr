# Memory index

Pointer file. One line per entry, newest first per section. No content here — see
`AGENTS.md` §9.4. Architecture decisions are **not** in this directory; they live
in `docs/adr/` (`AGENTS.md` §9.8).

## Handoff

- [M0-M9 complete, M10 is next and last](handoff/2026-08-24-milestones-m0-m9-complete.md) — canvas, PNG, `<qr-code>` and `mount` all shipping and browser-tested; only Kanji mode and logo overlays remain

## Investigations

- [Verifying a data-codeword table row](investigations/2026-08-24-verifying-capacity-tables.md) — derive published numeric capacity from it; internal consistency checks alone are not sufficient

## Gotchas

- [import/no-restricted-paths is inert for non-existent targets](gotchas/2026-08-24-no-restricted-paths-needs-resolvable-target.md) — layer boundaries are only armed once the imported file exists; trust `npm test`, not `npm run lint`
