# Roadmap plans

Written 2026-10-13. Seventeen plans in three tracks:

- **Track J:** close the gap to Jama Connect (J1 to J5).
- **Track T:** full test planning and execution (T1 to T7), allowed by [ADR 0011](adr/0011-test-planning-and-execution-in-scope.md).
- **Track A:** adoption by companies with serious requirements (A1 to A5), added 2026-10-14, after bundle I.

Each plan lists what exists, the slices to build in order, the data model, and the decisions the owner must make. One slice is one working session: domain module and tests first, then API, then screen. Every slice keeps the hard rules in `CLAUDE.md`: soft delete, append-only history, audit on every write, a permission test per route.

Estimates are in sessions and are rough.

## Slices left, and the model for each

One slice per fresh session. Opus for slices with hard data-model or security logic, Sonnet for the rest.

**Running slices in parallel.** A slice can start once everything in "Needs first" is merged into `development`. Rules for running several at once:

- Each runs in its own worktree and branch, merged into `development` one at a time; the second merge reruns `npm test`.
- Each uses its own test database: `TEST_DATABASE_URL=postgres://app:app@localhost:5432/app_<slice>_test npm test` (the name must end in `_test`; it is created on first use). Otherwise the sessions' tests clear each other's data.
- At most one slice marked **DB** at a time: each adds a numbered migration, and two made at once collide.

| Bundle | Slice | What | Model | Needs first | DB | State |
|---|---|---|---|---|---|---|
| I | J5 slice 1 | Editable item types, fields, relationship types | Opus | none | DB | built, merged 2026-10-14 |
| I | J5 slice 2 | Baseline to baseline compare | Sonnet | none | | built, merged 2026-10-14 |
| I | J5 slice 3 | Trace filters, project dashboard | Sonnet | none | | built, merged 2026-10-14 |
| I | J5 slice 4 | Child items | Opus | none | | built, merged 2026-10-14 |
| I | J5 slice 5 | Drag and drop, bulk edit | Sonnet | J5 slice 4 | | built, merged 2026-10-14 |
| I | J5 slice 6 | Exports of traceability and baselines | Sonnet | none | | built, merged 2026-10-14 |
| I | J5 slice 7 | Folders and the side bar | Sonnet | J5 slice 5 (same explorer code) | |  |
| I | J5 slice 8 | Section home pages | Opus | J5 slices 2 and 7 | |  |
| I | T7 slice 1 | Rich text in steps | Opus | none | | built, merged 2026-10-14 |
| I | T7 slice 2 | Files in steps and in results | Sonnet | T7 slice 1 | | built, merged 2026-10-14 |
| I | J1 slice 1 | Review participants and scope | Sonnet | none | DB |  |
| I | J1 slice 2 | Review notifications and signed record | Sonnet | J1 slice 1 | |  |
| I | J1 slice 3 | Part 11 hardening | Opus | none | DB | built, merged 2026-10-14 |
| I | T6 | CI runs | Sonnet | none | DB | built, merged 2026-10-14 |
| J | A3 slice 1 | Security policy | Sonnet | none | |  |
| J | A3 slice 2 | Releases | Opus | none | | built, merged 2026-10-14 (workflow not yet run) |
| J | A3 slice 3 | Measured budgets | Sonnet | none | |  |
| J | A5 slice 1 | Docs site | Sonnet | owner decision 4 | | built, merged 2026-10-14 |
| J | A5 slice 2 | Help in the app | Sonnet | A5 slice 1, J5 slice 8 | |  |
| K | A2 slice 1 | Anchored audit chain | Opus | J1 slice 3 | DB |  |
| K | A2 slice 2 | The tool's own requirements in the tool | Sonnet | none | | built, merged 2026-10-14 |
| K | A2 slice 3 | Validation pack | Sonnet | A2 slice 2, A3 slice 2 | |  |
| K | A2 slice 4 | Customer test scripts | Sonnet | none | |  |
| L | A1 slice 1 | Structure from the file | Opus | J5 slice 1 | |  |
| L | A1 slice 3 | Migration guide | Sonnet | A1 slice 1 | |  |
| L | A1 slice 4 | Real files | Sonnet | A1 slice 1, a design partner's exports | |  |
| none | Phase 1 | Playwright end-to-end tests | Sonnet | best after J5 slice 8, so screens stop moving | |  |

Waves for bundle I and its neighbours (each wave in parallel):

1. Done 2026-10-14: J5 slices 1 to 4 and 6, T7 slice 1, A5 slice 1 (docs site)
2. Done 2026-10-14: J5 slice 5, J1 slice 3 (DB), A3 slice 2
3. Done 2026-10-14: T6 (DB), T7 slice 2, A2 slice 2
4. Running: J1 slice 1 (DB), J5 slice 7, A3 slices 1 and 3, GitHub CI upload of results
5. Then: J1 slice 2, J5 slice 8, A2 slice 4, A5 slice 2
6. Then: A2 slice 1 (DB), A2 slice 3, A1 slice 1; Playwright after J5 slice 8

A3 slices 1 to 3 depend on nothing in bundle I and can run beside any wave.

## Build order

| Bundle | Contents | Sessions | Checkpoint test |
|---|---|---|---|
| D | T1, T2, T3: steps, plans, cycles, runs, execution screen | 6 | Plan a cycle, execute it, see requirement status change |
| E | T4, T5: evidence files, frozen status, reports | 4 | Attach a PDF to a step, compare two cycles |
| F | J3: HTTPS, edit conflicts, notifications, hardening | 5 | Two browsers edit one item; an email arrives for a mention |
| G | J2: Word export, import upgrades, Word import, ReqIF | 7 | Export a spec to Word, re-import a ReqIF file |
| H | J4: OpenAPI, webhooks, external references, OIDC | 6 | A webhook fires on a save; log in through an identity provider |
| I | J1, J5, T6, T7: review gaps, editable types, compare, dashboard, child items, exports, navigation, CI runs, rich test steps | 14 | Add a field to an item type; compare two baselines; open one CI upload and see its results; run a test whose step has an image |
| J | A3, A5: release and security basics, documentation site, in-app help | 5 | Install a numbered release from its signed image; open help from a screen |
| K | A2: compliance evidence | 4 | Download the validation pack of a release; break the audit chain and see it reported |
| L | A1: migration | 4 | Import a real DOORS or Jama export into a new project without setting it up first |

Bundle letters J, K and L follow I; they are not the plans of track J. J comes first of the three because it is cheap and every evaluator meets it. K needs the Part 11 work of J1 (bundle I). L slice 1 needs editable item types (J5 slice 1, bundle I) and real export files from a design partner.

D comes first because it is the owner's stated priority and it depends on nothing else. F comes before G and H because HTTPS blocks any install at a real company. J1 is last because its open gaps depend on F (email) and G (Word export).

## Decisions needed from the owner

1. **Edit conflicts (J3):** decided 2026-10-14: merge screen with "keep mine / take theirs" per field.
2. **Test terms (T2):** decided 2026-10-13: Plan, Cycle, Run, as in Jama.
3. **Signing with SSO (H):** decided 2026-10-14: an SSO user signs by logging in again at the identity provider ([ADR 0016](adr/0016-api-webhooks-references-oidc.md)).
4. **Documentation site (A5):** recommended 2026-10-14: keep the Markdown in `docs/user-guide` as the source, publish it as a website, and ship the same pages inside the app. Needs a static site tool as a dev dependency (VitePress or Starlight), or a small hand-written Markdown page in the web app.
5. **SAML (A3):** only when a design partner asks. Needs `@node-saml/node-saml`: XML signature checking is too risky to write by hand.
6. **Money (A3, A4):** a third-party penetration test, about $5k to $30k, once there is a paying customer. SOC 2 or ISO 27001 only if the project offers hosting.
7. **New dependencies:** none for H: OpenAPI and OpenID Connect are written by hand ([ADR 0016](adr/0016-api-webhooks-references-oidc.md)). `nodemailer` was added in F; `@fastify/helmet` was not needed (ADR 0014). `docx`, `mammoth`, `fast-xml-parser` and `fflate` were not needed: Word and ReqIF are read and written by hand (ADR 0011, ADR 0015).

---

# Track J: Jama competition

## J1. Reviews, approvals and e-signatures

**Exists:** reviews on a baseline, reviewers and approvers, marks, comments, password signature, permanent closing ([ADR 0010](adr/0010-reviews-approvals-and-signatures.md)). Waiting for the owner's test.

**Slices (3 sessions, after bundles F and G):**

1. **Participants and scope.** Add or remove a participant on an open review, as append-only rows in `review_participants` with `removedAt`. Opening a review sets Status to "In review" using the existing status-only version. "My reviews" list across projects on the home page.
2. **Notifications and signed record.** Notify on invitation, on every approver having signed, and on closing (uses J3). Export the closed review as a Word file with the signature block (uses J2).
3. **Part 11 hardening.** Account lockout after failed logins, password expiry, session inactivity timeout, all set by environment variables. Tamper-evident audit log: each `audit_events` row stores a SHA-256 of its content plus the previous row's hash; an admin route verifies the chain.

**Not planned:** review of a hand-picked subset. A baseline of one set or folder already covers it.

## J2. Document export and import

**Built 2026-10-14 as bundle G** ([ADR 0015](adr/0015-word-export-import-and-reimport.md)): slices 1 to 6. Slice 7 waits for vendor sample files. Word export options (fields, UID position, cover) were left out.

**Existed before:** CSV import with column mapping, `.xlsx` read in the browser, CSV export, browser print to PDF from Reading view, JSON backup.

**Slices (7 sessions):**

1. **Word export.** `GET /api/sets/:setId/export.docx` and the same for a baseline. Built on the server with the `docx` library from the same tree the Reading view uses. A pure module in `packages/shared` maps rich-text JSON to document blocks: headings from folders, UID and name, body, tables, images, a fields table per item. Options: cover page, which fields, UID before or after the name.
2. **Print stylesheet.** Cover page, running header with set name and baseline, page numbers, page break rules. Server-side PDF needs a headless browser in the image, so it stays out.
3. **Import upgrades.** A "Folder" column creates folders. A "UID" column updates existing items as new versions instead of adding. A preview lists added, changed and unchanged rows before anything is written. Lift the 2,000 item cap by sending rows in batches.
4. **Word import.** Read the `.docx` in the browser with `mammoth`. Headings become folders, paragraphs and tables become items. A review step lets the user merge, split or skip rows, then calls the import route from slice 3.
5. **ReqIF export.** `packages/reqif` as pure code: item types to SPEC-OBJECT-TYPE, fields to ATTRIBUTE-DEFINITION, items to SPEC-OBJECT, the tree to SPECIFICATION, relationships to SPEC-RELATION, rich text to XHTML. `.reqifz` with images, zipped with `fflate`.
6. **ReqIF import.** Parse with `fast-xml-parser`, entity expansion off. Map types and attributes on a screen like the CSV column mapping. New column `nodes.external_id` holds the ReqIF identifier so a second import updates instead of duplicating.
7. **Round-trip tests.** Sample files from DOORS, Polarion and Jama in `packages/reqif/samples`. Test: import, export, import again gives the same items.

**Risk:** ReqIF files from real tools differ from the standard. Slice 7 needs real samples from a design partner.

## J3. Team safety

**Built 2026-10-14** ([ADR 0014](adr/0014-https-edit-conflicts-notifications-email.md)), with the recommended merge screen. Security headers are written by hand instead of with `@fastify/helmet`. Before: a save is refused with HTTP 409 when someone saved first. Mentions show only in the activity stream. Plain HTTP. `@fastify/rate-limit` is installed. There is no background worker yet.

**Slices (5 sessions):**

1. **HTTPS.** A Caddy service in `deploy/docker-compose.yml` with automatic certificates, switched on by setting `DOMAIN`. `Secure` cookies, HSTS and `trustProxy` when it is set. Security headers with `@fastify/helmet`. Install guide updated. No change for local use.
2. **Edit conflicts.** On a 409 the item page shows a merge screen: each changed field with "mine" and "theirs" side by side, using the existing `diffWords`. The user picks per field, then saves on the new base version. A pure module in `packages/shared` does the three-way pick. The item page also shows "X is editing" from `item_drafts`, which settles the second open point in `DESIGN.md` section 11.
3. **In-app notifications.** Table `notifications` (user, project, kind, item, text, `readAt`), written in the same transaction as the audit event. Kinds: mention, review invitation, link became suspect on an item you last saved, test run assigned. A bell in the header with an unread count.
4. **Email.** Table `outbox` and a loop in the server process that sends with `nodemailer`. Configured by `SMTP_URL`; without it nothing is sent. Per-user setting: each event, daily digest, or off. This is the project's first background worker.
5. **Account recovery.** "Forgot password" by emailed one-time link. An administrator can send a reset link. Invitations are emailed instead of copied by hand.

**Owner decision:** number 1 in the list above.

## J4. Integrations

**Built 2026-10-14 as bundle H** ([ADR 0016](adr/0016-api-webhooks-references-oidc.md)): slices 1 to 6, with no new dependency. `WEBHOOK_ALLOW_PRIVATE` became `ALLOW_PRIVATE_URLS`, since it covers connections too. Left out: response schemas in the OpenAPI document, SAML and LDAP.

**Existed before:** every route has a JSON schema. Personal access tokens. JUnit import. Every write calls `audit(...)`.

**Slices (6 sessions):**

1. **OpenAPI.** `@fastify/swagger` builds the document from the route schemas. Add response schemas route file by route file. Serve it at `/api/openapi.json` with a viewer at `/api/docs`. A test fails when the committed `docs/openapi.json` is stale. Add "last used" and an optional expiry to tokens.
2. **Webhooks.** Tables `webhooks` (project, URL, secret, event kinds, active) and `webhook_deliveries` (append-only: attempt, status code). `audit(...)` queues a delivery, so every write is covered from one place. The worker from J3 posts JSON signed with HMAC-SHA256 and retries with backoff. Addresses on private networks are refused unless `WEBHOOK_ALLOW_PRIVATE` is set. An admin screen lists deliveries.
3. **External references.** Table `external_references` (item, URL, title, kind, soft-deleted). A panel on the item page. Kind is detected from the URL: Jira, GitHub, GitLab, other.
4. **Live status.** Per-project integration settings (base URL, token encrypted with a key from the environment). The worker refreshes the title and open/closed state of each reference. Shown as a badge.
5. **Code traceability.** A script in `packages/cli` scans a repository for `@req SYS-042` tags and posts them as external references with file and commit. Runs in CI with an access token.
6. **OIDC login.** `openid-client`, configured by environment variables. The first login creates the account, matched by verified email. Local accounts keep working. SAML and LDAP wait for a request from a design partner.

**Owner decision:** number 3 in the list above.

## J5. Depth in what exists

**Exists:** fixed template with three item types, baseline compare against current only, Trace view without filters, items only under folders, reorder through a menu.

**Slices (8 sessions):**

1. **Editable item types, fields and relationship types.** An admin screen per project: add an item type, a set, a field, an enum option, a relationship type. Rename anything. Remove is soft (`archivedAt`): old versions keep their values. Add `item_types.role` (`test` or null) and `link_types.role` (`verifies` or null) so the name rules of ADR 0008 and 0009 can go. Jama users expect this more than anything else in this plan.
2. **Baseline to baseline.** `compareBaseline` already takes two lists; add `GET /api/baselines/:baselineId/compare?with=` and a picker on the baseline page. Report suspect differences.
3. **Trace filters and project dashboard.** Filter the Trace view by relationship type and Status, trace a baseline, cap rows with "show more". The project home page shows, per set: item count, not covered, suspect, verification status. This settles the home-screen point in `DESIGN.md` section 11.
4. **Child items.** `nodes.parentId` may point at an item. Rules in `domain/tree.ts`: a child stays in its parent's set, a folder cannot sit under an item. Reading view numbers children under the parent.
5. **Drag and drop, bulk edit.** Native HTML drag and drop in the explorer, calling the existing move route. Multi-select in List view with "set field" and "move". Multi-select fields editable in List view. A saved filter per user per set.

Slices 6 to 8 added 2026-10-14 at the owner's request.

6. **Exports of traceability and baselines.** The traceability matrix as CSV and Word, from the same rows the screen shows. A baseline as CSV, with each item's frozen verification status and suspect relationships; Word and ReqIF of a baseline exist already. The Trace view keeps its CSV export.
7. **Folders and the side bar.** List view of a set or folder shows its direct sub-folders above the items, each with its item count, opening the folder; today it lists items only. In the side bar, Baselines, Reviews, Test plans and Reports open like folders: newest baselines, open reviews, the four reports. Test plans has two parts: **Test plans** (each plan, its open cycles under it) and **Test runs** (my runs, then open cycles). Each lists at most 10 with "All …" at the end. What is open is remembered per browser.
8. **Section home pages.** Each page answers "what needs me" first:
   - **Baselines:** newest first, with scope, author, item count, and the reviews and cycles on each, with their state. Tick two to compare (slice 2).
   - **Reviews:** tabs "Waiting for me", "Open", "Closed". Each row shows progress: items reviewed and approved out of all.
   - **Test plans:** one row per plan with its latest cycle's progress bar (passed, failed, blocked, not run) and "Start cycle".
   - **Test runs:** new page. Runs in open cycles across plans, assigned to me first, filtered by cycle, assignee and state, each opening the execution screen. Needs one list route across cycles.

---

# Track T: Test planning and execution

## Terms

Jama's, to be added to the glossary in `CLAUDE.md` when built:

| Term | Meaning |
|---|---|
| **Test step** | One action with its expected result, inside a test case |
| **Test plan** | A named selection of test cases for a goal, e.g. "Release 1.2 verification" |
| **Test cycle** | One pass through a plan. It freezes the version of each test case. |
| **Test run** | One execution of one test case in a cycle, assigned to one person |
| **Step result** | Pass, fail or blocked for one step of a run, with an actual result |

## Data model

```
Item (test case) ── steps live in the item revision, as a field of type "steps"
Project ─< TestPlan ─< TestPlanCase        (item, group name, position; removed softly)
TestPlan ─< TestCycle                      (name, environment, optional baseline, closed at)
TestCycle ─< TestRun                       (item, frozen ItemRevision id, assignee)
TestRun ─< StepResult                      (append-only: step number, outcome, actual result, recorded by)
TestRun ─ VerificationResult               (written once, when the run is finished; new nullable column run_id)
VerificationResult ─< ResultAttachment     (many evidence files; step number optional)
Baseline ─< BaselineVerification           (item, status, out of date: frozen at creation)
```

A finished run writes one ordinary `verification_results` row with source `run`. The status rule in `domain/verification.ts` does not change.

## T1. Structured test steps

**Built 2026-10-13** ([ADR 0012](adr/0012-test-plans-cycles-and-runs.md)). Before: a test case had one text field "Expected result".

**Slices (1 session, start of bundle D):**

1. **Field type `steps`.** A value is a list of `{ action, expected }`, both plain text, at most 200 steps. Validated in `domain/attributes.ts`. Stored in `item_revisions.attributes`, so versions, drafts, baselines, backup and diff work with no new table. The item page gets a steps editor: add, remove, reorder. Version compare shows steps added, removed and changed. The Standard template gains a "Steps" field on Test Case, and a migration adds it to existing test case types. Add `item_types.role` here if J5 slice 1 is not built yet.

**Later:** shared steps reused across test cases, parameters with data rows.

## T2. Test plans, cycles and runs

**Built 2026-10-13** ([ADR 0012](adr/0012-test-plans-cycles-and-runs.md)). Before: results were recorded one at a time on a test case.

**Slices (3 sessions):**

1. **Test plans.** Tables `test_plans` and `test_plan_cases`. Routes under `/api/projects/:projectId/test-plans` and `/api/test-plans/:testPlanId`; add `testPlanId`, `testCycleId` and `testRunId` to the names the permission hook knows. Editor creates and edits, Viewer reads. Screen: a "Test plans" page, and a plan page where test cases are added by set, by folder, or as "every test that verifies the requirements in this set", then put in named groups.
2. **Test cycles and runs.** Tables `test_cycles` and `test_runs`. Starting a cycle makes one run per plan case and freezes the test case's current version. Options at start: all cases, one group, or only those that failed or were blocked in the last cycle. Assign runs one by one or in bulk. A cycle is closed for good, like a review.
3. **Run rule and results.** Pure module `domain/testrun.ts`: a run's state from its latest step results. Any fail gives failed. Otherwise any blocked gives blocked. Every step passed gives passed. Some steps done gives in progress. None gives not started. Finishing a run writes the verification result at the frozen version, so a test case edited mid-cycle is out of date by the existing rule. JUnit import takes an optional cycle and fills its runs. ADR 0012 records the model.


## T3. Manual execution screen

**Built 2026-10-13**, except the notification on assignment, which waits for J3 slice 3.

**Slices (2 sessions):**

1. **Execute a run.** Route `/projects/$projectId/runs/$testRunId`. Shows the frozen version of the test case: description, then one row per step with action, expected result, an "actual result" box, and Pass / Fail / Blocked buttons. Each click posts one append-only step result. "Pass all remaining" for the common case. "Finish" needs the run's assignee or an Editor. A failed run asks for a defect link, stored as an external reference (a plain URL until J4 slice 3). "Next run" moves to the assignee's next run in the cycle.
2. **Finding work.** A cycle page: runs grouped as in the plan, with state, assignee and a progress bar. Filters by state and assignee. A "My test runs" list across projects on the home page. Assignment notifies the person once J3 slice 3 exists. Keyboard: P, F, B and arrow keys.

**Permission:** a new decision for ADR 0012. Recommended: Reviewer can execute runs assigned to them, Editor can execute any. A tester then does not need the right to edit requirements.

## T4. Evidence files

**Built 2026-10-13** ([ADR 0013](adr/0013-evidence-frozen-status-reports-bulk.md)), except streaming the restore of a backup: the download streams its files, the restore still reads the whole file. Before: one image per result, type checked by content, stored in `ATTACHMENTS_DIR`.

**Slices (2 sessions):**

1. **More file types.** Accept PDF, plain text and log files, CSV, and zip, each checked by content in `domain/image.ts` (renamed `filetype.ts`): magic bytes for PDF and zip, valid UTF-8 without NUL bytes for text. Anything that is not an image is served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so the browser never runs it. Size limit from `MAX_ATTACHMENT_MB`, default 25. Store the original file name.
2. **Many files per result and per step.** Table `result_attachments`. Upload from the execution screen by button, drag and drop, or pasting a screenshot. The JUnit route accepts an optional log file per report. Backup streams files instead of holding the project in memory, which removes a known gap.

## T5. Frozen status and reports

**Built 2026-10-13** ([ADR 0013](adr/0013-evidence-frozen-status-reports-bulk.md)). The cycle summary is worked out in the browser from the cycle's runs. Before: status was computed live. Baselines froze items and relationships, not status.

**Slices (2 sessions):**

1. **Status in baselines.** Table `baseline_verification`, written when a baseline is made, like the suspect flag in `baseline_links`. The baseline page shows the frozen status, and compare reports status changes. A cycle can name the baseline it verifies. A review of that baseline then shows the evidence its approvers sign for.
2. **Reports.** All computed from stored runs and results, nothing new stored:
   - cycle summary: passed, failed, blocked, not run, by group and by assignee
   - plan history: the same counts for each cycle side by side
   - requirement verification report: each requirement, its tests, the latest run of each, with evidence links
   - flaky tests: test cases whose last five results changed outcome more than once
   - CSV for all four; Word once J2 slice 1 exists

Charts use Mantine `Progress` with sections. No chart library.

**Later:** signing a closed cycle with the review signature, test environments as a managed list, automated test scheduling.

## T6. CI runs

Added 2026-10-14, for bundle I. Automated tests run on every push and do not fit cycles: nobody plans them, and a cycle per build would bury the manual ones.

**Exists:** the JUnit route records one result per matched test case (`source: "junit"`), optionally finishes runs in a cycle (`?testCycleId=`) and attaches a CI log (`?attachmentId=`). The answer lists unmatched test names, but nothing keeps them. Results of one upload are spread across test cases: there is no way to open "build #812" and see what it did.

**Slices (1 session):**

1. **One row per upload.** Table `ci_runs`: project, pipeline name, branch, commit, build URL, time, counts (passed, failed, skipped, unmatched), the unmatched test names, the uploading user. Append-only. `verification_results.ci_run_id` points at it. The JUnit route takes `pipeline`, `branch`, `commit` and `buildUrl` as optional query parameters and makes the row in the same transaction. Backup format bumps.
2. **"CI runs" page in the project.** List of uploads, newest first, with counts as a Mantine `Progress`, filterable by pipeline and branch. Opening one shows each reported test: its test case, outcome, the requirements it verifies, and the unmatched names. Linked from a result's "source" on the test case.

**Later:** pass-rate trend per pipeline. A branch rule, so only results from the main branch set the verification status and feature-branch runs show but do not count.

## T7. Rich test steps

Added 2026-10-14 at the owner's request, for bundle I.

**Exists:** a step is two plain-text strings, action and expected result (`packages/shared/src/steps.ts`). A step result has a plain-text actual result. Evidence files attach to a run and to one of its steps.

**Slices (2 sessions):**

1. **Rich text in steps.** Action and expected result become rich-text documents with the same editor as the description: formatting, tables, images. A stored plain string is read as one paragraph, so old versions stay as they were and no migration rewrites history. Update everything that reads steps: validation, the editor and view, the execution screen, the version compare (compares the text), Word and ReqIF export, spreadsheet import and export (text only).
2. **Files in steps and in results.** A file node in rich text: any attachment shown as a download link, images shown inline, so a step can carry a drawing or a setup file. The actual result during a run uses the same editor, with pasted screenshots; it is stored as rich text, old plain results read as one paragraph. Step evidence stays as it is.

---

# Track A: Adoption

Added 2026-10-14. Companies with serious requirements (medical, automotive, aerospace) adopt a tool they trust, not the one with the longest feature list. This track covers what they check before they adopt: how they move in, what auditors will ask for, what their IT department requires, and whether the project will still be here in five years. A4 is the owner's work, not code.

## A1. Migration from DOORS, Polarion and Jama

**Exists:** ReqIF import onto existing sets, fields and relationship types, re-import by ReqIF identifier, spreadsheet import with Folder and UID columns, Word import. Synthetic test files in `samples/import` (see its README), checked through the import route on 2026-10-14: every ReqIF file imports, and a re-import of the DOORS file adds 1 item, updates 1 and leaves 12 alone.

**How a company moves today:** set up sets and fields by hand, export each module as ReqIF (Jama: Excel), import each one, check counts, keep the old tool read-only as the archive, and take a first baseline "Migrated from …". History, baselines, reviews, signatures, comments and results do not move. That is normal in regulated work: migrated history is hard to defend to an auditor.

**Found by the sample files:**

- Fixed 2026-10-14: a Jama export has an "ID" column. The spreadsheet import guessed it was our UID, so the first import failed ("CUST-2 is not in this set"). It now guesses UID only when every value is a UID of the set.
- Fixed 2026-10-14: Jama writes rich text as HTML in its Excel cells. A description cell that starts with a tag is now read through `xhtmlToDoc`, as ReqIF does; HTML that is not well-formed keeps its text without the tags.
- Word heading mode makes a heading with paragraphs under it one item, sub-headings included. Expected, but worth a line in the guide.

**Slices (4 sessions):**

1. **Structure from the file.** On the ReqIF import page, "Create a set for this specification" with an item type and fields from the file's attributes (enumerations as enum fields). Needs J5 slice 1.
2. **Spreadsheet fixes** above, with tests from `samples/import`.
3. **Migration guide.** One page per source tool in the user guide: what to export, how to map, what does not move, how to check counts.
4. **Real files.** Replace the synthetic samples with anonymised exports from a design partner, and add a round-trip test per tool.

**Later, on request:** a Jama importer through its REST API that also brings versions, marked as imported (about 3 sessions).

## A2. Compliance evidence

**Exists:** append-only history and audit events, electronic signatures with password, status-only versions, permanent closing of reviews and cycles. J1 slice 3 plans account lockout, password expiry, inactivity timeout and a tamper-evident audit log.

**Slices (4 sessions):**

1. **Anchored audit chain.** J1 slice 3 stores a SHA-256 of each audit row with the previous row's hash. A database administrator could still rewrite the whole chain, so: a daily job writes the latest hash to a place the database cannot change (an email to a configured address, a file on another volume, or an external log), and `GET /api/audit/verify` checks the chain against those anchors.
2. **The tool's own requirements in the tool.** Dogfooding (Next item 3): 100 to 300 requirements for this product, each with the tests that prove it, test names carrying the UID so the existing JUnit import links them.
3. **Validation pack.** CI builds, for each release tag: requirements with their verification status, the test results, the environment (Node, Postgres, browser versions), a traceability matrix, and the list of known gaps. Built by the app's own Word export from a baseline named after the release. CI fails if a requirement has no passing test.
4. **Customer test scripts.** A short set of installation and operational checks (IQ/OQ) a customer reruns on their own install, with expected results, written as test cases they can import.

**Cannot be promised:** that the tool is "compliant". Compliance belongs to the customer's process; the pack is evidence that saves them weeks. A third-party tool qualification certificate (e.g. ISO 26262 by a certification body) is possible later, at a cost in the tens of thousands of euros: get a quote first.

## A3. Enterprise IT gates

**Exists:** OIDC sign-in, HTTPS by Caddy, security headers, personal access tokens with expiry, OpenAPI document, Docker Compose deployment.

**Slices (3 sessions), no money:**

1. **Security policy.** `SECURITY.md` with GitHub's private vulnerability reporting, a page in the user guide answering the usual security questionnaire (data stored, encryption, sessions, dependencies, backups).
2. **Releases.** Numbered releases with a changelog. CI builds the image, signs it with cosign (keyless, in GitHub Actions), attaches an SBOM from `npm sbom`, and runs an upgrade test: start the previous release, load the demo project, upgrade, check it opens.
3. **Measured budgets.** A CI job loads a project of 2,000 items (the demo script in `scripts/demo` scaled up) and fails when the document opens in more than 2 s or search takes more than 500 ms. The numbers go in the user guide.

**On request (2 to 3 sessions each):** SAML (owner decision 5), SCIM provisioning from the company directory.

**Costs money:** penetration test (owner decision 6). SOC 2 and ISO 27001 certify a hosted service, so they wait for a hosting offer.

## A4. Owner's work (no code)

- One design partner running a real project, and their export files for A1 slice 4.
- Test the bundles still waiting for the owner's test.
- Decide the project name; nothing can be published before it.
- A way to pay for support: the AGPL with a CLA already allows open-core or paid support.
- A public demo instance loaded with the Kestrel-EO demo (`scripts/demo/spacecraft.ts`).

## A5. Documentation and help

**Exists:** Markdown user guide in `docs/user-guide`, install guide, OpenAPI document at `/api/openapi.json` and an API page in the app, the Kestrel-EO demo project.

**Recommendation:** the repository stays the source, because the pages are then versioned with the code, reviewed with the change that needs them, and match the version a customer runs. A wiki drifts from the code and is not versioned per release. The pages are published two ways from the same files: a public website for evaluators (GitHub Pages), and inside the app image at `/help`, because many regulated customers run without internet access.

**Slices (2 sessions):**

1. **Docs site.** Build `docs/user-guide` into a static site in CI, published to GitHub Pages and copied into the app image. Owner decision 4 picks the tool.
2. **Help in the app.** A "?" on each screen opens its page of the guide. Empty states say what to do first and link to the guide. "Load the demo project" on an empty instance. No guided product tour: it costs more than it gives until there are users to watch.
