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
- M1 tested by the owner (2026-10-12)
- M1 built in 5 slices: projects from a template, folders and items with UIDs, List view, Single item view with Save version, move / rename / soft-delete (2026-10-12)
- M0, running skeleton: built and tested by the owner (2026-10-12)
- CI passes on GitHub (2026-10-12)
- UI decided: Mantine and TanStack Router, ADR 0004 (2026-10-12)
- Product design decided, Jama-style: [docs/DESIGN.md](docs/DESIGN.md) (2026-10-12)

## In progress

**Bundle A: M2 (editing and versions) + M3 (relationships).** One owner test at the end, not per slice.

- [x] M2: version history side panel; compare any two versions with a word-level diff (2026-10-12)
- [ ] M2: auto-saved private drafts; "Save version" commits the draft; discard draft
- [ ] M2: rich-text description with basic formatting (TipTap); record the stored format as an ADR
- [ ] M2: inline editing of simple fields in List view
- [ ] M3: add a relationship by search; upstream and downstream in the item side panel
- [ ] M3: traceability matrix between two sets
- [ ] M3: coverage filter in List view

## Next

Phase 1 milestones M0 to M7 are in [docs/DESIGN.md](docs/DESIGN.md) section 10. Each ends with an owner test.

1. Finish bundle A, then the owner test (checkpoint A)
2. Bundle B: M4 + M5
3. Bundle C: M6 + M7

Known gaps left for later milestones or owner decision:

- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Deleted folders and items cannot be restored from the screen yet.

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
