# Status

Last updated: 2026-10-13

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- ReqIF import and export built: standalone `packages/reqif` (XML, zip, ReqIF model), export of a set or baseline as .reqif or .reqifz, import page with mapping and review, structured import route, round-trip test, [ADR 0011](docs/adr/0011-reqif-import-and-export.md), [user guide](docs/user-guide/reqif.md) (2026-10-13)
- Roadmap planned: ten plans in two tracks in [docs/ROADMAP.md](docs/ROADMAP.md). Test planning and execution brought into scope, [ADR 0011](docs/adr/0011-test-planning-and-execution-in-scope.md) (2026-10-13)
- Reviews and approvals built: review from a baseline, reviewers and approvers, marks and comments per item, electronic signature with password, permanent closing, Status = Approved with no suspect or out-of-date side effects, backup format version 4, [ADR 0010](docs/adr/0010-reviews-approvals-and-signatures.md), [user guide](docs/user-guide/reviews.md) (2026-10-13)
- Verification tracking built: pure status rule, append-only results on test cases, status in List view, matrix, Trace view and item page, JUnit import from CI, personal access tokens, backup format version 3, [ADR 0009](docs/adr/0009-verification-tracking.md), [user guide](docs/user-guide/verification.md) (2026-10-13)
- Trace view and impact analysis built: pure graph walk with loop guard, Trace view per set or folder with level pickers, coverage summary with a target set, impact trees on an item, CSV export of the trace, [ADR 0008](docs/adr/0008-trace-view-and-impact-analysis.md), [user guide](docs/user-guide/trace.md) (2026-10-13)
- Suspect links built: pure flagging rule, link revisions for confirmations, markers in the Relationships panel, matrix and List view, "Suspect links" review page, suspect flag in baselines, backup format version 2, [ADR 0007](docs/adr/0007-suspect-links.md) (2026-10-13)
- Owner feedback on the explorer and item state folded in: compact explorer with icons and collapsible folders, state colours in every multi-item view, print or save as PDF from Reading view (2026-10-13)
- Example project "Infusion Pump (example)" added to the owner's local instance (2026-10-13)
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

- **Bundle D (test steps, plans, cycles, runs, execution screen): approved by the owner, not started.** Terms decided: Plan, Cycle, Run.
- **ReqIF import and export: built, waiting for the owner's test. Word import starts after that feedback.**
- Reviews and approvals: built, waiting for the owner's test.
- Verification tracking: built, waiting for the owner's test.
- Trace view and impact analysis: built, waiting for the owner's test.
- Suspect links: built, waiting for the owner's test.
- Finishing slice: built, waiting for the owner's test.
- Bundle B (M4 + M5): the owner has not said in so many words that it was tested. Confirm.

## Next

All eight Phase 1 milestones (M0 to M7) are built. What is left before Phase 1 can be called complete:

1. Owner decision: conflict handling when two people edit one item ([docs/DESIGN.md](docs/DESIGN.md) section 11). Today the second save is refused with "reload".
2. Drag and drop in the explorer
3. HTTPS, required before an install at a real company
4. Playwright end-to-end tests
5. Dogfood: write this project's own requirements spec and import it

After that, the bundles in [docs/ROADMAP.md](docs/ROADMAP.md), in order: D (test steps, plans, cycles, runs, execution), E (evidence files, frozen status, reports), F (HTTPS, edit conflicts, notifications), G (Word and ReqIF), H (API docs, webhooks, integrations, OIDC), I (review gaps, editable item types, baseline compare, dashboard).

Before item 1: Word import (headings become folders, paragraphs become items, with a review step). It reuses the zip and XML readers and the structured import route.

Known gaps left for later milestones or owner decision:

- ReqIF: not tested with real files from DOORS, DOORS Next or Polarion, nor imported into them; the owner is looking for samples. Import only adds items, so a re-import duplicates. It cannot create sets, item types or fields. Default values, relation groups and attributes on relationships are not read. The import page, the export menus and image import were not checked in a browser; the same code paths are covered by tests in Node.

- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Version diffs compare wording; a formatting-only change is reported without detail.
- Deleted relationships and comments cannot be restored from the screen. There is no "forgot password": an administrator cannot reset one yet.
- Mentions do not notify anyone; they only show in the activity stream.
- Equations are typed as LaTeX in a browser prompt. Multi-select fields are not editable in List view.
- Suspect links: no notification when a link becomes suspect, no "suspect only" filter in List view, and baseline compare does not report suspect differences. The review page links to the changed item; its version compare is opened from there by hand.
- Trace view: no filter by relationship type or state, no trace of a baseline, rows are not capped for very densely linked sets. Coverage is not shown on the project home page.
- Verification: evidence is one image per result, no PDF or log files. A result goes out of date on any new version of the requirement, with no "still valid" confirmation. Status is not frozen in baselines. Test cases are found by an item type name containing "test", and the relationship type by the name "Verified by". Tokens do not expire and show no "last used" date.
- Reviews: participants cannot be changed after creation, a review always covers its whole baseline, nobody is notified, and there is no "my reviews" list across projects. The signed copy is the browser's print. Part 11 gaps: no password expiry, lockout or inactivity timeout, and the audit log is not tamper-evident. Opening a review does not set Status to "In review".
- Baselines compare with the current state only, not with another baseline. A baseline cannot be exported.
- Import only adds new items: it cannot update existing ones or create folders. At most 2,000 items per file.
- Export is CSV only (Excel opens it). No .xlsx export.
- Backup and restore hold the whole project in memory: fine for text, slow for hundreds of megabytes of images.
- Not checked in a browser: image upload through the editor, inserting an equation, the Trace view's "Export CSV" button, printing a review, evidence upload on a result, and the Access tokens section of the account dialog. All but the CSV button are covered by server tests.

## Open decisions

- Project name
- Three roadmap decisions at the top of [docs/ROADMAP.md](docs/ROADMAP.md): edit conflicts, signing with SSO, new dependencies
- Three design details in [docs/DESIGN.md](docs/DESIGN.md) section 11
- Beachhead confirmation after interviews
- Hosting for a public demo instance

## Not started (Phase 0, non-code)

- 8–10 user interviews
- Recruit 1–2 design partners
- Competitor teardown (StrictDoc, Tuleap, Jama/Polarion trial)
- Read the ReqIF spec and DOORS concepts
- Write the tool's own requirements spec
