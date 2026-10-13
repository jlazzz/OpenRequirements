# Status

Last updated: 2026-10-13

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- Finishing slice built: change own password, deactivate and reactivate accounts, Deleted items page with restore, restore an old version, [install guide](docs/user-guide/install.md) (2026-10-13)
- Bundle C tested by the owner: "It's good" (2026-10-13)
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

- **Finishing slice: built, waiting for the owner's test.**
- Bundle B (M4 + M5): the owner has not said in so many words that it was tested. Confirm.

## Next

All eight Phase 1 milestones (M0 to M7) are built. What is left before Phase 1 can be called complete:

1. Owner decision: conflict handling when two people edit one item ([docs/DESIGN.md](docs/DESIGN.md) section 11). Today the second save is refused with "reload".
2. Drag and drop in the explorer
3. HTTPS, required before an install at a real company
4. Playwright end-to-end tests
5. Dogfood: write this project's own requirements spec and import it

Known gaps left for later milestones or owner decision:

- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Version diffs compare wording; a formatting-only change is reported without detail.
- Deleted relationships and comments cannot be restored from the screen. There is no "forgot password": an administrator cannot reset one yet.
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
