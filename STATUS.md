# Status

Last updated: 2026-10-13

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- Bundle C built: baselines with compare against current, spreadsheet import with column mapping, CSV export of List view, JSON backup and restore, [ADR 0006](docs/adr/0006-import-backup-and-baselines.md) (2026-10-13)
- Repo skeleton: npm workspaces, TypeScript, Vitest (2026-10-12)
- `CLAUDE.md` (2026-10-12)
- License decided: AGPL-3.0 + CLA, [ADR 0001](docs/adr/0001-license-agpl-3.0.md) (2026-10-12)
- Pushed to GitHub, `development` branch (2026-10-12)
- Stack decided: Fastify and Drizzle, ADRs 0002 and 0003 (2026-10-12)
- Bundle B built: reading view, list tools, search, tables/images/equations, invitations, project roles, comments, activity stream (2026-10-12)
- Bundle A tested by the owner (2026-10-12)
- Bundle A built: version history and compare, auto-saved drafts, rich text (ADR 0005), relationships, traceability matrix, coverage filter (2026-10-12)
- M1 tested by the owner (2026-10-12)
- M1 built in 5 slices: projects from a template, folders and items with UIDs, List view, Single item view with Save version, move / rename / soft-delete (2026-10-12)
- M0, running skeleton: built and tested by the owner (2026-10-12)
- CI passes on GitHub (2026-10-12)
- UI decided: Mantine and TanStack Router, ADR 0004 (2026-10-12)
- Product design decided, Jama-style: [docs/DESIGN.md](docs/DESIGN.md) (2026-10-12)

## In progress

- **Bundles B and C: built, waiting for the owner's test at checkpoints B and C.** Bundle C was started at the owner's request before the test of B. Phase 1 is feature-complete once both are tested.

## Next

Phase 1 milestones and review checkpoints are in [docs/DESIGN.md](docs/DESIGN.md) section 10.

1. Owner test of bundle B: Reading view; list sort, filter, columns, edit in place; search; table, image and equation in a description; invite a second user; roles; comments and mentions; activity
2. Owner test of bundle C: create a baseline, change things, compare; import a .csv and an .xlsx; Export CSV; download a backup and restore it
3. Fold feedback into `docs/DESIGN.md`
4. Dogfood: import this project's own requirements spec (it is not written yet)

Known gaps left for later milestones or owner decision:

- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Deleted folders, items, relationships and comments cannot be restored from the screen yet.
- Old versions can be viewed and compared, not restored.
- Version diffs compare wording; a formatting-only change is reported without detail.
- Accounts cannot be deactivated, and a user cannot change their own password yet.
- Mentions do not notify anyone; they only show in the activity stream.
- Equations are typed as LaTeX in a browser prompt. Multi-select fields are not editable in List view.
- Baselines compare with the current state only, not with another baseline. A baseline cannot be exported.
- Import only adds new items: it cannot update existing ones or create folders. At most 2,000 items per file.
- Export is CSV only (Excel opens it). No .xlsx export.
- Backup and restore hold the whole project in memory: fine for text, slow for hundreds of megabytes of images.
- Not checked in a browser: image upload through the editor, and inserting an equation. Both are covered by server tests only.

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
