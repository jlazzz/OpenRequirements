# Status

Last updated: 2026-10-12

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- Repo skeleton: npm workspaces, TypeScript, Vitest (2026-10-12)
- `CLAUDE.md` (2026-10-12)
- License decided: AGPL-3.0 + CLA, [ADR 0001](docs/adr/0001-license-agpl-3.0.md) (2026-10-12)
- Pushed to GitHub, `development` branch (2026-10-12)
- Stack decided: Fastify and Drizzle, ADRs 0002 and 0003 (2026-10-12)
- M0, running skeleton: built and tested by the owner (2026-10-12)
- CI passes on GitHub (2026-10-12)
- UI decided: Mantine and TanStack Router, ADR 0004 (2026-10-12)
- Product design decided, Jama-style: [docs/DESIGN.md](docs/DESIGN.md) (2026-10-12)

## In progress

**M1, structure and items.** Slices, each testable in the browser:

1. [x] Create a project from the Standard template; explorer lists its sets (2026-10-12)
2. [x] Folders and items in a set: create, UIDs, explorer tree (2026-10-12)
3. [x] List view of a set or folder, one column per field (2026-10-12)
4. [x] Single item view: edit name, description and fields; "Save version" appends a revision (2026-10-12)
5. [ ] Reorder and soft-delete

## Next

Phase 1 milestones M0 to M7 are in [docs/DESIGN.md](docs/DESIGN.md) section 10. Each ends with an owner test.

1. Owner look at M1 slices 3 and 4
2. M1 slice 5: rename folders, move and reorder, soft-delete. Then the M1 owner test.

## Open decisions

- Project name
- Four design details in [docs/DESIGN.md](docs/DESIGN.md) section 11
- Beachhead confirmation after interviews
- Hosting for a public demo instance

## Not started (Phase 0, non-code)

- 8–10 user interviews
- Recruit 1–2 design partners
- Competitor teardown (StrictDoc, Tuleap, Jama/Polarion trial)
- Read the ReqIF spec and DOORS concepts
- Write the tool's own requirements spec
