# Status

Last updated: 2026-10-14 (bundle H)

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- Bundle H built: OpenAPI document at `/api/openapi.json` and an API page, token expiry and "last used", webhooks fed by every audited write with signed JSON and retries, references from items to Jira, GitHub, GitLab and documents with open or closed read through per-project connections, `@req` tag scanner for CI (`packages/cli`), sign-in through OpenID Connect, signing a review by signing in again at the provider, backup format version 7, [ADR 0016](docs/adr/0016-api-webhooks-references-oidc.md), [user guide](docs/user-guide/integrations.md), [install guide](docs/user-guide/install.md) updated. No new dependency. Checked in a browser on a scratch instance with a fake identity provider, receiver and GitHub: SSO sign-in, webhook deliveries, a reference turning Open, token expiry, the API page; the scanner run twice against it (2026-10-14)
- Bundle G built: Word export of a set or baseline (cover, headings, items, field tables, images, page numbers), printed Reading view with cover, running header and page numbers, Word import with paragraph or heading mode and a review step (skip, merge), imports that update items by UID, id or ReqIF identifier with a preview, Folder and UID columns in spreadsheets and in the CSV export, ReqIF re-import without duplicates, [ADR 0015](docs/adr/0015-word-export-import-and-reimport.md), [user guide](docs/user-guide/word-and-spreadsheets.md). No new dependency. Checked in a browser on a scratch instance: CSV re-import, Word re-import of an export, skip and merge, printed PDF (2026-10-14)
- Bundle F built: HTTPS by Caddy and security headers, merge screen for edit conflicts and "also editing", in-app notifications (mention, review invitation, run assigned, relationship become suspect), email by outbox with per-person choice of each/digest/never, forgot password and admin reset links, emailed invitations, [ADR 0014](docs/adr/0014-https-edit-conflicts-notifications-email.md), [user guide](docs/user-guide/working-together.md), [install guide](docs/user-guide/install.md) updated. Also fixed: Sign out left the screen showing the signed-out user. Checked in a browser on a scratch instance (2026-10-14)
- Bundle E built: evidence files (PDF, text, logs, CSV, zip; many per result, per run and per step; drop, paste, button; a log with a JUnit report), verification status frozen in baselines, a cycle names the baseline it verifies and shows in its review, reports (cycle summary, plan history, requirement verification, flaky tests, CSV each), backup format version 6 with files streamed out, [ADR 0013](docs/adr/0013-evidence-frozen-status-reports-bulk.md), [user guide](docs/user-guide/evidence-and-reports.md). Also, asked by the owner: bulk set field, move and delete in List view, and dark mode ([user guide](docs/user-guide/bulk-actions.md)). Checked in a browser on a scratch instance (2026-10-13)
- Bundle D built: test steps on test cases, test plans with groups, cycles with frozen versions, runs with step-by-step execution and keyboard, "My test runs", defect link on a failed run, JUnit into a cycle, backup format version 5, [ADR 0012](docs/adr/0012-test-plans-cycles-and-runs.md), [user guide](docs/user-guide/test-plans.md). Checkpoint test done in a browser: plan, cycle, run, requirement turned Passing (2026-10-13)
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

- **Bundle H (API docs, webhooks, references, connections, OIDC): built, waiting for the owner's test.** Checkpoint: a webhook fires on a save; log in through an identity provider. Bundle I does not start before that feedback. Built at the owner's request before their test of bundles F and G.
- Bundle G (Word, import upgrades, ReqIF re-import): built, waiting for the owner's test. Checkpoint: export a spec to Word, re-import a ReqIF file.
- Bundle F (HTTPS, edit conflicts, notifications, email, account recovery): built, waiting for the owner's test. Checkpoint: two browsers edit one item; an email arrives for a mention.
- Bundle E (evidence files, frozen status, reports) plus bulk item actions and dark mode: built, waiting for the owner's test. Checkpoint: attach a PDF to a step, compare two cycles.
- Bundle D (test steps, plans, cycles, runs, execution screen): built and checked in a browser, waiting for the owner's own test.
- ReqIF import and export: built, waiting for the owner's test.
- Reviews and approvals: built, waiting for the owner's test.
- Verification tracking: built, waiting for the owner's test.
- Trace view and impact analysis: built, waiting for the owner's test.
- Suspect links: built, waiting for the owner's test.
- Finishing slice: built, waiting for the owner's test.
- Bundle B (M4 + M5): the owner has not said in so many words that it was tested. Confirm.

## Next

All eight Phase 1 milestones (M0 to M7) are built. What is left before Phase 1 can be called complete:

1. Drag and drop in the explorer
2. Playwright end-to-end tests
3. Dogfood: write this project's own requirements spec and import it

After that, bundle I in [docs/ROADMAP.md](docs/ROADMAP.md): review gaps, editable item types, baseline compare, dashboard.

Known gaps left for later milestones or owner decision:

- Test plans: a closed cycle is not signed. Reports export CSV only, no Word. The defect link is a plain URL. Cases in a plan cannot be reordered by hand. Not checked in a browser: the version compare of steps, regrouping and removing plan cases, "only what failed" cycles, closing a cycle, a Reviewer executing an assigned run. All are covered by server tests except the compare.
- ReqIF: not tested with real files from DOORS, DOORS Next or Polarion, nor imported into them; the owner is looking for samples. It cannot create sets, item types or fields.
- Word: the export was not opened in Microsoft Word or LibreOffice (only read back by the importer and macOS). Import not tried with a real Word file; one from macOS `textutil` has no heading styles, so its headings came in as items. Export has no options (fields, UID position, cover). Default values, relation groups and attributes on relationships are not read. The import page, the export menus and image import were not checked in a browser; the same code paths are covered by tests in Node.

- Integrations: OpenAPI has no response schemas. No SAML or LDAP, and no rule on which provider accounts may sign in (any verified email gets an account, without projects). Not tried against a real identity provider, Jira, GitHub or GitLab: only fakes. The review sign dialog for a person without a password was not checked in a browser (server tests cover the flow). Webhook deliveries cannot be re-sent by hand; no delivery or reference history is kept beyond the latest attempt. The private-address check can be passed by DNS that changes between check and call. Code references point at files on a branch, not at commits.
- Reorder and move use an Actions menu. Drag and drop in the explorer is not built.
- Items cannot be nested under items, only under folders and sets.
- Version diffs compare wording; a formatting-only change is reported without detail.
- Deleted relationships and comments cannot be restored from the screen.
- Notifications: none for comments without a mention, nor when a review is signed or closed. No outbox screen: failed emails are seen only in the `outbox` table. HTTPS with Caddy was checked with `docker compose config` only, not against a real domain. Email was checked with an unreachable SMTP server (queue and retries) and a fake mailer in tests, not with a real provider.
- Edit conflicts: a description both people changed is kept whole from one side; there is no merge inside rich text.
- Equations are typed as LaTeX in a browser prompt. Multi-select fields are not editable in List view.
- Suspect links: no notification when a link becomes suspect, no "suspect only" filter in List view, and baseline compare does not report suspect differences. The review page links to the changed item; its version compare is opened from there by hand.
- Trace view: no filter by relationship type or state, no trace of a baseline, rows are not capped for very densely linked sets. Coverage is not shown on the project home page.
- Evidence: cannot be removed once attached, by design. File names keep only letters, digits and `. ( ) -`; other characters become `_`. Not checked in a browser: the file chooser buttons (drop and paste were).
- Bulk actions: at most 500 items per request. No bulk change of multi-select or Steps fields. No bulk action across sets.
- Verification: a result goes out of date on any new version of the requirement, with no "still valid" confirmation. The relationship type is found by the name "Verified by". Tokens do not expire and show no "last used" date.
- Reviews: participants cannot be changed after creation, a review always covers its whole baseline, only the invitation is notified (not signing or closing), and there is no "my reviews" list across projects. The signed copy is the browser's print. Part 11 gaps: no password expiry, lockout or inactivity timeout, and the audit log is not tamper-evident. Opening a review does not set Status to "In review".
- Baselines compare with the current state only, not with another baseline. A baseline cannot be exported.
- Import updates items but never moves them, and an empty cell cannot clear a field. At most 5,000 folders and items per file. A folder name with "/" cannot be given in the Folder column.
- List export is CSV only (Excel opens it). No .xlsx export.
- Backup download streams its files; restore still reads the whole file in memory, at most 256 MB.
- Not checked in a browser: image upload through the editor, inserting an equation, the Trace view's "Export CSV" button, printing a review, evidence upload on a result, and the Access tokens section of the account dialog. All but the CSV button are covered by server tests.

## Open decisions

- Project name
- One design detail in [docs/DESIGN.md](docs/DESIGN.md) section 11: the home screen
- Beachhead confirmation after interviews
- Hosting for a public demo instance

## Not started (Phase 0, non-code)

- 8–10 user interviews
- Recruit 1–2 design partners
- Competitor teardown (StrictDoc, Tuleap, Jama/Polarion trial)
- Read the ReqIF spec and DOORS concepts
- Write the tool's own requirements spec
