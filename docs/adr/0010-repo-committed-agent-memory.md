---
status: accepted
date: 2026-08-24
deciders: [Aditya K]
supersedes: []
superseded-by: []
agents-md: ["§9"]
---

# ADR-0010: Repo-committed `.memory/` for agent hand-off

## Context and Problem Statement

This repository is built largely by AI agents across sessions that share no context. Each session starts cold: no recollection of what was tried last week, which approach failed, or why a function looks the way it does.

The consequences are concrete and repetitive. Dead ends get re-explored. A trap that cost an hour costs another hour. Work stops mid-task and the next session cannot tell what was finished from what merely looks finished.

An agent's own private memory does not solve this — it is scoped to one agent and one user, so it does not reach the next agent working in the repo, and it is not in the clone for a human collaborator either.

`AGENTS.md` cannot absorb this material. It loads on every session, so unbounded growth is a per-session context tax on all future work.

## Decision

A committed `.memory/` directory in the repo:

```
.memory/
├── INDEX.md            pointer-only. The one file read on every session start.
├── handoff/            state of in-flight work. Ephemeral — deleted when the work lands.
├── investigations/     what was learned digging into a problem, including dead ends.
└── gotchas/            traps that already cost someone an hour.
```

One file per topic. Filename `YYYY-MM-DD-kebab-slug.md`. Frontmatter carries `title`, `date`, `type`, `status`, `area`, `related`. Cross-links use `[[slug]]`.

**Architecture decisions do not go here.** They go in `docs/adr/`. The full protocol — per-type body templates, the mandatory hand-off on incomplete work, when to write and when not to — is `AGENTS.md` §9.

`INDEX.md` is a **pointer file**: one line per entry, no content. Content in the index means the index grows into every session's context, which is the failure this design exists to avoid.

## Consequences

### Good

- Hand-offs survive the session that produced them. The next agent, or a human, starts from written state rather than reconstruction.
- Dead ends are recorded, so "I checked X, it is not the cause" saves the next agent the same hour.
- It is in the clone. A human collaborator gets the same context an agent does, with no external tool and no access request.
- Gotchas that are properties of the *domain* rather than the code — the EC level bit ordering, the count-indicator width transitions — get a durable home. These are exactly the facts a fresh session lacks and cannot derive from reading code.
- `AGENTS.md` stays bounded, because accumulating detail has somewhere else to go.

### Bad / costs

- Commit noise. Notes interleave with code in the log. Mitigated by a `chore(memory):` prefix so they are easy to filter.
- **Stale notes actively mislead.** A wrong gotcha is worse than no gotcha: it sends the next agent down a dead path with confidence. Hygiene — delete-when-wrong, delete-landed-handoffs — is load-bearing, not optional tidiness.
- Notes are in the published repo. Never a place for secrets, credentials, or personal data. Stated explicitly in `AGENTS.md` §9.5.
- Nothing mechanical can verify a hand-off was written when it should have been. See Enforcement.

## Alternatives Considered

- **Grow `AGENTS.md` to hold everything.** Rejected — it loads every session, so the cost is paid by all future work forever.
- **Rely on each agent's private memory.** Rejected — wrong scope. It does not reach the next agent or any human, which is the entire problem.
- **An external tracker** (issues, a wiki, a project tool). Rejected — not in the clone, so agents will not read it, and it needs credentials a fresh session may not have.
- **Commit messages and PR descriptions as the record.** Rejected — they describe what landed, not what was abandoned or what is half-done. The valuable material is precisely what has no commit.
- **Uncommitted `.memory/`, gitignored.** Rejected — then it is per-clone, and a fresh clone or a cloud session starts blind. Committing is the point.

## Enforcement

**Review only** — stated plainly.

Nothing mechanical can check that a hand-off was written, that a gotcha is still true, or that a stale note was deleted. This is the one decision in this directory with no automated gate, and pretending otherwise would be worse than admitting it.

What partially substitutes:

- `AGENTS.md` §9.7 makes reading `INDEX.md` and current hand-offs part of the session-start routine, and writing the hand-off part of session-end.
- `AGENTS.md` §10 definition-of-done includes "`.memory/` updated if anything non-obvious was decided or learned".
- A landed hand-off left undeleted is visible in `INDEX.md`, so the rot is at least conspicuous.
