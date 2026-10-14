# Status

Last updated: 2026-10-14 (CI upload)
Last updated: 2026-10-14 (A2 slice 2)
Last updated: 2026-10-14 (bundle I, T7 slice 2)
Last updated: 2026-10-14 (bundle I, T6 slice 1 and 2)
Last updated: 2026-10-14 (bundle I, J1 slice 3)

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- CI upload to the tool: `ci.yml` writes `junit.xml` and runs `scripts/ci/upload-results.ts` (JUnit with the `// @req` UID put in front of each test name, labelled with commit, branch and run URL; then the `@req` scanner) when the secrets `REQ_URL` and `REQ_TOKEN` exist, not on fork PRs. Tried against a scratch server with a real token; the workflow itself has never run on GitHub, and a local instance is unreachable from GitHub runners. Only tests with a `@req` tag match (2026-10-14)
- A2 slice 2, own requirements in the tool: `npm run dogfood` loads 14 needs, 78 requirements and 57 test cases (`scripts/dogfood/requirements.ts`) into the Standard template through the import route by external id; re-running updates, never duplicates. Eight test files carry `@req VER-nnn` tags. Run against a scratch instance twice. Not yet: results for the test cases (needs the JUnit names to carry UIDs), the scanner run against it, 100+ requirements target of the roadmap (2026-10-14)
- T7 slice 2, files in steps and in results: a `file` node in rich text (any uploaded attachment, a download link; images stay `image`), added with **Image / file**, paste or drop in every rich-text box; the actual result of a step is rich text (stored as the document's JSON in the existing `actual` column, plain text still reads as one paragraph; backup limit 100,000 characters). Word and ReqIF write a file as its name. No migration, no new file type. Checked in a browser on a scratch instance: a file in an actual result survives a reload; the read-only view and the Word export of a file were not looked at (2026-10-14)
- T6 CI runs: each JUnit upload is a `ci_runs` row (pipeline, branch, commit, build URL, counts, unmatched names) that its results point at; "CI runs" page with filters and a run page with results, requirements and unmatched names; link from a result on the test case; backup format version 9, migration 0020, [ADR 0022](docs/adr/0022-ci-runs.md), [user guide](docs/user-guide/verification.md). Checked in a browser on a scratch instance with the demo project (2026-10-14)
- A3 slice 2, releases: version in root `package.json`, shown at `GET /api/version` and in the account dialog; `release.yml` on a `vX.Y.Z` tag checks notes, lint, types and tests, pushes the image to GHCR, attaches a CycloneDX SBOM, signs with cosign keyless; `CHANGELOG.md`, [docs/RELEASING.md](docs/RELEASING.md), compose `APP_IMAGE`/`APP_VERSION`, upgrade section of the install guide, [ADR 0021](docs/adr/0021-numbered-releases-signed-images.md). The workflow has never run; actions are pinned by major tag, not SHA; upgrade test not built (2026-10-14)
- J5 slice 5, drag and drop: drag folders and items in the explorer and in List view (⠿ handle) to reorder, move, or drop onto an item to make a child; a set row moves to its top level; ticked rows drag together. Pure rule `dropPlacement` in `packages/shared`, the move route and its checks unchanged. "Pick several" fields are editable in List view and in bulk set-field. Checked in a browser with synthetic drag events on a scratch instance. `API_PORT` sets the web proxy target (2026-10-14)
- J1 slice 3, Part 11 hardening: account lockout, password expiry and session inactivity timeout (environment variables, off when unset), tamper-evident audit log (SHA-256 hash chain under an advisory lock, `GET /api/audit/verify`, button on the Users page), [ADR 0020](docs/adr/0020-part-11-hardening-audit-chain.md). Migration 0019. Not checked in a browser; the chain does not cover rows from before it or a restored backup (2026-10-14)
- A5 slice 1, docs site: `docs/user-guide` built by VitePress (dev dependency, offline search, dead links fail the build), published to GitHub Pages by `docs.yml`, copied into the image and served at `/help` without sign-in, [ADR 0019](docs/adr/0019-docs-site-vitepress-help.md). Not checked on a real Pages deployment (2026-10-14)
- J5 slice 1, editable item types: a project admin adds, renames and removes item types, fields, enum values, sets and relationship types on the "Item types" page. Remove is soft (`archivedAt`); old versions keep their values. Roles `test` and `verifies` replace the name rules, [ADR 0018](docs/adr/0018-editable-types-and-roles.md). Backup format version 8. Not checked in a browser (2026-10-14)
- J5 slice 2, baseline to baseline: `GET /api/baselines/:baselineId/compare?with=` reports item, relationship (added, removed, became or stopped being suspect) and frozen verification differences; a "Compare with another baseline" picker on the baseline page (server test) (2026-10-14)
- J5 slice 6, exports: the traceability matrix exports as CSV and Word from the rows on screen, a baseline exports as CSV with each item's frozen verification status and suspect relationships (new route `/api/baselines/:baselineId/csv`, entry in the baseline Export menu). `toDocx` takes an optional table. No new dependency (2026-10-14)
- J5 slice 3: Trace view filters by relationship type and Status, traces a baseline (relationships and suspect flags as frozen), and draws 100 items at a time with "Show more". The project home page lists per set: items, not covered, suspect, verification. No new route or migration (2026-10-14)
- T7 slice 1, rich text in steps: a step's action and expected result are rich-text documents (formatting, tables, images, equations) in the item editor, the item page and the execution screen. Plain steps already stored read as one paragraph per line, no migration. Version compare, search, CSV, Word and ReqIF read steps as text. Waiting for the owner's test (2026-10-14)
- J5 slice 4, child items: an item can hold child items in its set (create from the item's Actions menu, move, bulk move, import, restore, backup, baselines); a folder never sits under an item; Reading view numbers the outline with children set in under their parent; Word export writes children after their parent, [ADR 0017](docs/adr/0017-child-items.md). Not checked in a browser (2026-10-14)
- Jama spreadsheet import fixed: an ID column is guessed as the UID only when its values are UIDs of the set, and HTML description cells come in as formatted text. The Jama sample CSV imports with the guessed mapping (server test) (2026-10-14)
- Adoption planning and demo: roadmap track A (migration, compliance evidence, enterprise IT gates, owner's work, documentation) as bundles J, K, L after I. "Spacecraft" project template. Kestrel-EO demo project built through the API by `npm run demo` (364 items, 499 relationships, baselines, signed and open reviews, cycles with evidence, CI results with a flaky test), [user guide](docs/user-guide/demo-project.md). Synthetic DOORS, DOORS Next, Polarion, Jama and Word files in `samples/import`, imported through the import route: ReqIF and re-import work; Jama's "ID" column and HTML cells needed fixes (roadmap A1, since fixed) (2026-10-14)
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

- **T7 slice 2 (files in steps, rich actual results): built, waiting for the owner's test.** Checkpoint: run a test, paste a screenshot and add a log file in a step's actual result, reload.
- **T6 CI runs: built, waiting for the owner's test.** Checkpoint: upload a JUnit report with `?pipeline=&branch=`, open it under CI runs.
- **J5 slice 5 (drag and drop, multi-select fields): built, waiting for the owner's test.** Checkpoint: drag a folder and an item in the explorer; drop an item on another item in List view.
- **J1 slice 3 (Part 11 hardening): built, waiting for the owner's test.** Checkpoint: set `LOGIN_LOCKOUT_ATTEMPTS=3`, fail three sign-ins; click Verify audit log on Users.
- **J5 slice 1 (editable item types, fields, sets, relationship types): built, waiting for the owner's test.** Checkpoint: add a field to an item type, rename "Verified by" and see verification still work.
- J5 slice 2 (baseline to baseline compare): built, waiting for the owner's test. Checkpoint: pick another baseline on a baseline page.
- **J5 slice 6 (matrix and baseline exports): built, waiting for the owner's test.** Not checked in a browser.
- **J5 slice 3 (trace filters, project dashboard): built, waiting for the owner's test.** Checkpoint: filter a trace by type and Status, trace a baseline, read the project home page.
- T7 slice 1 (rich text in steps): built, waiting for the owner's test. Not checked in a browser. Images in steps are not embedded in Word export (their name is written instead).
- J5 slice 4 (child items): built, waiting for the owner's test. Check: add a child item from an item's Actions menu, see it numbered under its parent in Reading view.
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

1. Playwright end-to-end tests
2. ~~Dogfood~~ done (A2 slice 2); grow the spec and feed it CI results

After that, the bundles in [docs/ROADMAP.md](docs/ROADMAP.md), in order: I (review gaps, editable item types, baseline compare, dashboard, exports, side bar and section pages, CI runs view, rich test steps), then J (releases, security basics, in-app help; docs site built), K (compliance evidence), L (migration).

Known gaps left for later milestones or owner decision:

- Test plans: a closed cycle is not signed. Reports export CSV only, no Word. The defect link is a plain URL. Cases in a plan cannot be reordered by hand. Not checked in a browser: the version compare of steps, regrouping and removing plan cases, "only what failed" cycles, closing a cycle, a Reviewer executing an assigned run. All are covered by server tests except the compare.
- ReqIF: not tested with real files from DOORS, DOORS Next or Polarion, nor imported into them; the owner is looking for samples. It cannot create sets, item types or fields.
- Word: the export was not opened in Microsoft Word or LibreOffice (only read back by the importer and macOS). Import not tried with a real Word file; one from macOS `textutil` has no heading styles, so its headings came in as items. Export has no options (fields, UID position, cover). Default values, relation groups and attributes on relationships are not read. The import page, the export menus and image import were not checked in a browser; the same code paths are covered by tests in Node.

- Integrations: OpenAPI has no response schemas. No SAML or LDAP, and no rule on which provider accounts may sign in (any verified email gets an account, without projects). Not tried against a real identity provider, Jira, GitHub or GitLab: only fakes. The review sign dialog for a person without a password was not checked in a browser (server tests cover the flow). Webhook deliveries cannot be re-sent by hand; no delivery or reference history is kept beyond the latest attempt. The private-address check can be passed by DNS that changes between check and call. Code references point at files on a branch, not at commits.
- Drag and drop: tested with synthetic events, not a real mouse; no touch support (native HTML drag). Dragging several ticked rows places them last, not at the drop point. No saved filter per user per set (needs a table).
- Child items: List view's bulk move offers folders only; ReqIF import turns an object with children into a folder, so exported child items come back inside a folder; the CSV Folder column drops parent items.
- Version diffs compare wording; a formatting-only change is reported without detail.
- Deleted relationships and comments cannot be restored from the screen.
- Notifications: none for comments without a mention, nor when a review is signed or closed. No outbox screen: failed emails are seen only in the `outbox` table. HTTPS with Caddy was checked with `docker compose config` only, not against a real domain. Email was checked with an unreachable SMTP server (queue and retries) and a fake mailer in tests, not with a real provider.
- Edit conflicts: a description both people changed is kept whole from one side; there is no merge inside rich text.
- Equations are typed as LaTeX in a browser prompt. Multi-select fields are not editable in List view.
- Suspect links: no notification when a link becomes suspect, no "suspect only" filter in List view, and baseline compare does not report suspect differences. The review page links to the changed item; its version compare is opened from there by hand.
- Trace view: tracing a baseline shows current names and states, and drops items deleted since. The server still walks every item of the set; "show more" only limits the rows drawn.
- Evidence: cannot be removed once attached, by design. File names keep only letters, digits and `. ( ) -`; other characters become `_`. Not checked in a browser: the file chooser buttons (drop and paste were).
- Bulk actions: at most 500 items per request. No bulk change of multi-select or Steps fields. No bulk action across sets.
- Verification: a result goes out of date on any new version of the requirement, with no "still valid" confirmation. Tokens do not expire and show no "last used" date.
- Reviews: participants cannot be changed after creation, a review always covers its whole baseline, only the invitation is notified (not signing or closing), and there is no "my reviews" list across projects. The signed copy is the browser's print. Part 11 gaps: the audit hash chain is not anchored outside the database (roadmap A2 slice 1), so a full rewrite or deleting the newest rows goes unseen; no password history or complexity rules. Opening a review does not set Status to "In review".
- Comparing two baselines lists differences only; it has no field-level diff.
- Import updates items but never moves them, and an empty cell cannot clear a field. At most 5,000 folders and items per file. A folder name with "/" cannot be given in the Folder column.
- List export is CSV only (Excel opens it). No .xlsx export.
- Backup download streams its files; restore still reads the whole file in memory, at most 256 MB.
- Not checked in a browser: image upload through the editor, inserting an equation, the Trace view's "Export CSV" button, printing a review, evidence upload on a result, and the Access tokens section of the account dialog. All but the CSV button are covered by server tests.

## Open decisions

- Project name
- Project home screen: a per-set dashboard was built (J5 slice 3); the owner confirms it or asks for another at the checkpoint, then DESIGN.md section 11 is settled
- One design detail in [docs/DESIGN.md](docs/DESIGN.md) section 11: the home screen
- Beachhead confirmation after interviews
- Hosting for a public demo instance

## Not started (Phase 0, non-code)

- 8–10 user interviews
- Recruit 1–2 design partners
- Competitor teardown (StrictDoc, Tuleap, Jama/Polarion trial)
- Read the ReqIF spec and DOORS concepts
- Write the tool's own requirements spec
