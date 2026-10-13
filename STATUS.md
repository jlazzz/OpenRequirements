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
- Bundle A tested by the owner (2026-10-12)
- Bundle A built: version history and compare, auto-saved drafts, rich text (ADR 0005), relationships, traceability matrix, coverage filter (2026-10-12)
- M1 tested by the owner (2026-10-12)
- M1 built in 5 slices: projects from a template, folders and items with UIDs, List view, Single item view with Save version, move / rename / soft-delete (2026-10-12)
- M0, running skeleton: built and tested by the owner (2026-10-12)
- CI passes on GitHub (2026-10-12)
- UI decided: Mantine and TanStack Router, ADR 0004 (2026-10-12)
- Product design decided, Jama-style: [docs/DESIGN.md](docs/DESIGN.md) (2026-10-12)

## In progress

**Bundle B: M4 (reading and finding) + M5 (team).** One owner test at the end.

- [x] M4: Reading view; List view sort, filter, column picker, edit in place; search; tables, images, equations (2026-10-12)
- M5 server side is written (invitations, members, roles on every existing route, comments, activity) but has **no screens yet and no tests of its own**. Existing tests pass. Next: tests for roles (non-member gets 404, viewer cannot write), then the web screens.
- [ ] M5: invitations by link; users page
- [ ] M5: project members and roles (Admin, Editor, Reviewer, Viewer) enforced on every route
- [ ] M5: comments on items with @mentions
- [ ] M5: activity stream per project

## Next

Phase 1 milestones and review checkpoints are in [docs/DESIGN.md](docs/DESIGN.md) section 10.

1. Owner test of bundle A: format a description; leave and return to a draft; save versions and compare them; link items; matrix; coverage filter
2. Fold feedback into `docs/DESIGN.md`
3. Bundle B: M4 (reading and finding) + M5 (team)
4. Bundle C: M6 (baselines) + M7 (data in and out)

Known gaps left for later milestones or owner decision:

- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Deleted folders, items and relationships cannot be restored from the screen yet.
- Old versions can be viewed and compared, not restored.
- Version diffs compare wording; a formatting-only change is reported without detail.

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
