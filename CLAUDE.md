# CLAUDE.md

Open-source, self-hostable requirements and test management tool. Not ALM: no task tracking or bug tracking. Test management is in scope ([ADR 0011](docs/adr/0011-test-planning-and-execution-in-scope.md)): test plans, cycles, runs and step-by-step execution. A failed test links to a defect in an external tool.

Plans for the next bundles: [docs/ROADMAP.md](docs/ROADMAP.md).

Full plan and phase checklists: [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md). This file is drawn from its sections 4, 5 and 11.

Product design (structure, screens, editing, Phase 1 scope): [docs/DESIGN.md](docs/DESIGN.md). Read it before any UI, API or data-model work. It was decided after the outline and wins where they disagree. The reference product is Jama Connect: follow its layout and concepts, never its artwork or branding.

Current status, loaded into every session:

@STATUS.md

## Commands

```bash
npm install          # install all workspaces
npm run db:up        # start Postgres in Docker (needed for tests and dev)
npm test             # Vitest, single run, against the app_test database
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # Biome: lint and format check
npm run format       # Biome: fix lint and formatting
npm run dev:server   # API on :3000, restarts on change
npm run dev:web      # Vite on :5173, proxies /api to :3000
npm run db:generate  # new SQL migration after editing apps/server/src/db/schema.ts
npm run up           # build and start the full stack in Docker on :3000
npm run openapi      # rewrite docs/openapi.json after changing a route (a test fails while it is stale)
```

Before calling work done: `npm run lint && npm run typecheck && npm test`. CI runs the same.

Not set up yet: Playwright. Add each command here when it lands.

## Hard rules

1. **Never hard-delete items.** Soft delete only. Deleted items stay in history and baselines.
2. **History is append-only.** Never update or delete a revision row. A change is a new revision.
3. **Every write creates an audit event.** One exception: auto-saving a draft is audited when the draft starts and when it is discarded, not on every keystroke save.
4. **Every endpoint checks permissions**, and that check has a test. A route about project data starts with `access(req, reply, where, role)`. A new path parameter needs a test id in the "someone outside a project" test.
5. **UIDs are never reused**, even after deletion.
6. **Everything goes through the API.** The UI uses the same public API that integrations use. No back doors.
7. **Migrations are forward-only** and safe on large tables.
8. **No secrets in the repo. Parameterized queries only. No telemetry by default.**

## How to work

- **Small slices.** One feature per session or branch, taken from the current phase checklist in the outline. Plan first, then implement, then write tests.
- **Work in bundles, review at checkpoints.** Phase 1 milestones M0 to M7 and the review checkpoints A, B, C are in `docs/DESIGN.md` section 10. Build the whole current bundle named in `STATUS.md` without stopping for review. At the checkpoint, stop and give the owner the steps to test it. Do not start the next bundle until the owner has tested and given feedback.
- **Domain logic first.** Build versioning, baselines and suspect links as pure, tested modules in `apps/server/src/domain/` before wiring up any API or UI. No database or HTTP imports in that folder.
- **Record decisions.** When a session makes a significant decision, write an ADR in `docs/adr/` as `NNNN-short-title.md`.
- **Update the status.** At the end of every session that changes the project, update `STATUS.md`: move finished work to Done with the date, set In progress and Next, and bump "Last updated". Tick the matching checklist items in `docs/PROJECT_OUTLINE.md`.
- **Stay in scope.** If a feature looks like ALM, integrate with an external tool instead of building it. Test planning and execution are in scope; defect and task tracking are not ([ADR 0011](docs/adr/0011-test-planning-and-execution-in-scope.md)).
- **Boring tech.** Proven, well-documented components that are easy to self-host. Do not add a dependency for a few lines.

## Stack

Rows marked *proposed* are from the outline and not yet in the code.

| Layer | Choice | Status |
|---|---|---|
| Language | TypeScript end-to-end | in use |
| Package manager | npm workspaces | in use |
| Unit tests | Vitest, against a real Postgres test database | in use |
| Lint / format | Biome | in use |
| Frontend | React + Vite, TanStack Query | in use |
| Rich-text editor | TipTap via `@mantine/tiptap`; stored as editor JSON ([ADR 0005](docs/adr/0005-rich-text-as-editor-json.md)) | in use |
| UI components / router | Mantine, TanStack Router with routes in code ([ADR 0004](docs/adr/0004-ui-mantine-tanstack-router.md)) | in use |
| Backend | Fastify on Node 24+, run as TypeScript with no build step ([ADR 0002](docs/adr/0002-backend-fastify-native-typescript.md)) | in use |
| Database | PostgreSQL 17, JSONB for custom attributes | in use |
| ORM / migrations | Drizzle + drizzle-kit ([ADR 0003](docs/adr/0003-orm-drizzle.md)) | in use |
| Auth | Local accounts, scrypt hashes, session cookie (`Secure` behind HTTPS); personal access tokens (`Authorization: Bearer`) for CI; password reset by one-time link; OpenID Connect sign-in written by hand in `oidc.ts` ([ADR 0016](docs/adr/0016-api-webhooks-references-oidc.md)); SAML/LDAP later | in use |
| API description | OpenAPI 3.1 built from the route schemas by `domain/openapi.ts`, no library; served at `/api/openapi.json`, committed as `docs/openapi.json` | in use |
| Outbound calls | Webhooks and connections through `outboundFetch` in `worker.ts`: private addresses refused unless `ALLOW_PRIVATE_URLS`; connection tokens encrypted with `INTEGRATION_KEY` | in use |
| CI results | JUnit XML read by a hand-written scanner in `packages/importers`, no XML library ([ADR 0009](docs/adr/0009-verification-tracking.md)) | in use |
| ReqIF | Read and written by `packages/reqif`: hand-written XML parser and zip on the platform's `CompressionStream`, no library. The browser parses the file; the server gets JSON ([ADR 0011](docs/adr/0011-reqif-import-and-export.md)) | in use |
| Spreadsheets | CSV parsed by `packages/importers`; `.xlsx` read in the browser with `read-excel-file` ([ADR 0006](docs/adr/0006-import-backup-and-baselines.md)) | in use |
| Word | `.docx` written on the server and read in the browser by `packages/importers/src/docx.ts`, by hand on the zip and XML code of `packages/reqif`, no library ([ADR 0015](docs/adr/0015-word-export-import-and-reimport.md)) | in use |
| File storage | Local disk (`ATTACHMENTS_DIR`, a Docker volume). Images, PDF, text, CSV and zip, type checked by content in `domain/filetype.ts`; only images are ever shown, the rest is a download. Limit `MAX_ATTACHMENT_MB`, default 25. S3-compatible later. | in use |
| Deployment | One app image (API + built web app) + Postgres, `deploy/docker-compose.yml`. HTTPS by a Caddy service under the Compose profile `https`, set by `DOMAIN` ([ADR 0014](docs/adr/0014-https-edit-conflicts-notifications-email.md)) | in use |
| Email | `nodemailer` over `SMTP_URL`, sent from the `outbox` table by a loop in the server process; nothing is sent without it | in use |
| End-to-end tests | Playwright | proposed |

License: AGPL-3.0-only with a CLA ([ADR 0001](docs/adr/0001-license-agpl-3.0.md)). No `CLA.md` yet; do not merge an outside contribution until it exists.

Also open: project name. Do not publish a package name until it is decided.

## Folder conventions

```
apps/
  web/              React front end
    src/router.tsx  All routes. Every screen has a URL.
    src/links.tsx   Mantine links wired to the router: use these, not <a>
  server/           API server + background worker
    src/app.ts      App setup, auth routes, the `AppContext` passed to feature files
    src/access.ts   Permission check (`createAccess`), role lookup and `audit`
    src/projects.ts, src/nodes.ts, src/links.ts, src/trace.ts, src/verification.ts, src/attachments.ts, src/members.ts, src/comments.ts, src/baselines.ts, src/reviews.ts, src/testplans.ts, src/testruns.ts, src/backup.ts, src/import.ts, src/export.ts, src/notifications.ts, src/recovery.ts, src/webhooks.ts, src/references.ts, src/oidc.ts   Feature route files: one per feature, taking `AppContext`
    src/mail.ts     Email outbox, the mail loop, and `notify()`, which writes notifications in the caller's transaction
    src/domain/templates.ts  Project templates (item types, fields, sets)
    src/domain/attributes.ts Validates field values against an item type's field definitions
    src/domain/tree.ts       Pure tree logic: descendants, sibling order
    src/domain/roles.ts      Role ranking and @mention matching
    src/domain/suspect.ts    The suspect-link rule: which ends of a link changed since it was confirmed
    src/domain/verification.ts  The verification status rule: a requirement's status from its tests' latest results, what is out of date, and which tests are flaky
    src/domain/trace.ts      Walks relationships upstream or downstream as a tree, with loop and repeat guards
    src/domain/testrun.ts    The run state rule: a run's state from the latest result of each step
    src/domain/review.ts     The review outcome rule, the signature digest, and the "only Status changed" check
    src/domain/backup.ts     Backup file format, its consistency check, and id rewriting for restore
    src/domain/filetype.ts   What an uploaded file is, judged by its bytes, and a safe stored file name
    src/domain/references.ts What a reference URL points at, and how its title and state are read from Jira, GitHub or GitLab
    src/domain/network.ts    Which IP addresses are private, for calls to other servers
    src/domain/openapi.ts, src/domain/oidc.ts, src/domain/secret.ts  The OpenAPI document, ID token checks, token encryption
    src/worker.ts   `startLoop` for background work, and `outboundFetch` for every call to another server
    src/db/         Drizzle schema and client
    drizzle/        Generated SQL migrations. Never edit a committed one.
    src/domain/     Pure domain logic: versioning, baselines, suspect links
packages/
  cli/              The `@req UID` tag scanner, run in CI: sends a repository's tags as code references
  shared/           Pure code used by both web and server: UID format, word diff, rich-text format and validation, baseline compare, trace paths, three-way merge of item edits
  reqif/            ReqIF parser/serializer with its XML and zip readers. Standalone: imports nothing from the repo or npm, runs in Node and the browser
  importers/        CSV reading and writing, mapping spreadsheet rows to folders and items, reading JUnit XML reports, mapping between ReqIF and sets, items and rich text, and writing and reading Word (.docx)
docs/
  PROJECT_OUTLINE.md
  adr/              Architecture Decision Records
  user-guide/
deploy/             Dockerfile and docker-compose.yml
e2e/                Playwright tests (empty)
```

- Tests sit next to the code as `*.test.ts`.
- ESM everywhere. Relative imports use the `.ts` extension (`./uid.ts`), because Node runs the sources directly.
- Erasable TypeScript only: no `enum`, no parameter properties, no namespaces. Use `import type` for types.
- Every `/api/` route either has `onRequest: requireUser` (add `requireAdmin` after it for instance-admin-only routes) or `config: { public: true }`. The server refuses to start otherwise.
- Project routes then call `if (!(await access(req, reply, { setId }, "editor"))) return reply;` first. It answers 404 to non-members and 403 when the role is too low. Name path parameters `projectId`, `setId`, `itemId`, `nodeId`, `linkId`, `attachmentId`, `commentId`, `baselineId`, `reviewId`, `testPlanId`, `testCycleId`, `testRunId`, `webhookId`, `referenceId` or `integrationId`: a hook uses those names to refuse non-members before the body is read.
- `audit(...)` looks up the project and a label by itself for items, folders, links and projects. Pass `{ projectId, label }` for anything else that should appear in the activity stream.
- Route params that are IDs are validated as `format: "uuid"` in the route schema.
- UI: use Mantine components and theme before writing custom CSS.
- Every write calls `audit(...)` in the same transaction as the change. Tell people about it with `notify(tx, mail, [...])` from `mail.ts`, in the same transaction; send email only through `queueMail`.
- A new workspace needs its own `package.json` named `@app/<name>`.
- `apps/web` has its own `tsconfig.json` (bundler module resolution). `npm run typecheck` checks both.
- A generated migration that must convert existing data is edited by hand before it is committed, with a comment saying so.

## System components

- **Web app (SPA):** document view, item editor, trace views, admin.
- **API server:** business logic, permissions, versioning, import/export.
- **Background worker:** imports, exports, report generation, suspect-link propagation, webhooks.
- **Database:** PostgreSQL.
- **Integrations layer (later):** connectors for Jira, GitHub/GitLab and CI.

## Domain glossary

Use these terms exactly, in code, API and UI.

| Concept | Meaning |
|---|---|
| **Project** | Top-level container (e.g. one product) |
| **Set** | A container in a project holding items of exactly one item type (e.g. "System Requirements"). Replaces the outline's "Document". |
| **Folder** | A nestable grouping of items inside a set |
| **Item type** | A kind of item with its own fields (User Need, Requirement, Risk, Test Case). Defined by the project template. |
| **Item** | A single entry in a set (e.g. one requirement) with a stable UID (e.g. `SYS-042`), rich-text body and typed attributes |
| **Draft** | An author's auto-saved, private, uncommitted edits to an item. "Save version" turns it into a revision. |
| **Attribute definition** | A custom field schema (status, priority, verification method, ASIL level…) |
| **Revision** | An immutable snapshot of an item or link at a point in time |
| **Link / Link type** | A typed, directional relationship from an **upstream** item to a **downstream** item (e.g. *Derived from*, *Verified by*). Called "relationship" in the UI. |
| **Baseline** | A named, immutable snapshot of a set or project at a moment (e.g. "Design Review v1.0") |
| **Suspect link** | A link flagged for review because the item on either end changed since the link was last confirmed |
| **Traceability matrix** | A cross-reference view of links between two sets |
| **Coverage** | Which items have, or lack, downstream links (e.g. untested requirements) |
| **Verification result** | The outcome of running a test case once: pass, fail or blocked, against one version of the test case. Append-only. Called "result" in the UI. |
| **Verification status** | Computed per requirement from the latest result of each test linked by "Verified by": not covered, not run, passing, failing |
| **Out of date** | A result that no longer counts, because the test case or the requirement has a newer version |
| **Evidence** | Files attached to a result, or to a run and optionally one of its steps: images, PDF, text and logs, CSV, zip. Append-only. |
| **Flaky test** | A test case whose last five results changed outcome more than once |
| **Test plan** | A named selection of test cases for a goal, in optional groups |
| **Test cycle** | One pass through a test plan. Starting it freezes each test case's current version. Closing is permanent. |
| **Test run** | One test case executed once in a cycle, step by step. Its state is computed from its step results; finishing it records a verification result. |
| **Review** | People looking at one baseline's items: reviewers comment and mark items reviewed, approvers approve or reject each item. States: open, closed, approved, rejected. Closing is permanent. |
| **Notification** | A message to one person about something another person did: a mention, a review invitation, an assigned run, a relationship become suspect. In-app, and by email if they want. |
| **Signature** | An approver's electronic signature on their decisions in a review: password re-entered, with name, time, meaning (approval or rejection) and a digest of what was signed. Append-only. |
| **External reference** | A link from an item to something outside the tool: a Jira issue, a pull request, a file tagged `@req UID` in code. Called "reference" in the UI. Its title and open or closed state are read through a **connection** |
| **Webhook** | An address a project's changes are posted to, as signed JSON, from `audit(...)` |

## Core data model (sketch)

```
User ─< ProjectMember >─ Project   (role; no Organization level yet: one instance is one organization)
Invitation                         (email, token hash, expiry; accepted once)
Project ─< Set ─< Node (tree: folder | item; external id from an import)
Project ─< ItemType                (from the project template; a set has exactly one)
Item ─< Draft                      (one per author; private until committed)
Item ─< ItemRevision               (append-only: body, attributes JSONB, author, timestamp, change reason, status-only flag)
ItemType ─< AttributeDefinition    (name, type, allowed values, required?)
Project ─< LinkType                (name; from the template; no source→target rules)
Link                               (upstream item, downstream item, type, revisions of both ends at creation; immutable, soft-deleted)
Link ─< LinkRevision               (append-only: one per confirmation of a suspect link, with the revisions of both ends confirmed against)
Project ─< Baseline ─< BaselineEntry   (node, its ItemRevision id, and its parent, position and folder name at that moment)
Baseline ─< BaselineLink               (ids of the links that were live, and whether each was suspect)
Baseline ─< BaselineVerification       (each requirement's verification status and out-of-date flag when the baseline was made)
Item ─< VerificationResult         (test cases only; append-only: outcome, test case revision, run date, note, source)
VerificationResult | TestRun ─< ResultAttachment  (append-only evidence: the attachment, and the step of a run it belongs to)
Project ─< TestPlan ─< TestPlanCase  (test case, group, position; soft-removed)
TestPlan ─< TestCycle ─< TestRun      (test case, frozen ItemRevision, group, assignee; a cycle closes once, may name the baseline it verifies)
TestRun ─< StepResult                 (append-only: step number, outcome, actual result; the latest per step counts)
User ─< ApiToken                   (hash only; revoked, never removed)
Item ─< Comment                    (plain text, mentions resolved to user ids, soft-deleted; optionally made in a review)
Project ─< Attachment              (uploaded files: images embedded in rich text, and evidence; content type from the bytes, original name)
Item ─< ExternalReference          (URL, title, kind, source repository for code tags, state read from the other tool; soft-deleted)
Project ─< Integration             (a connection: Jira, GitHub or GitLab base URL, encrypted token; soft-deleted)
Project ─< Webhook ─< WebhookDelivery  (URL, secret, event filter; deliveries retried like the outbox)
Baseline ─< Review ─< ReviewParticipant  (reviewer or approver; fixed at creation)
Review ─< ReviewMark                  (append-only: reviewed, approved, rejected or cleared, per person and item; the latest counts)
Review ─< Signature                   (append-only, one per approver: meaning, copied name and email, digest of the signed decisions)
AuditEvent                          (append-only log of every write; project id and a label feed the activity stream)
User ─< Notification                (kind, text, path, actor; only readAt changes)
Outbox                              (emails to send: to, subject, body, attempts, last error, sent at)
User ─< PasswordReset               (token hash, expiry, used at; made by the person or an administrator)
```

## Key design decisions

- **UIDs:** a per-set prefix plus a monotonic counter (`SRS-001`). See `packages/shared/src/uid.ts`.
- **Versioning:** append-only revision tables. The "current" state is the latest revision. Baselines reference revision IDs, so they cost nothing to create and can never drift.
- **Editing:** inline, auto-saved to a private draft. An explicit "Save version" creates the revision. When someone saved first, a three-way merge per field resolves it; others see who has a draft, never its content ([ADR 0014](docs/adr/0014-https-edit-conflicts-notifications-email.md)).
- **Suspect links:** computed, never stored. A link is suspect when either end has a newer revision than the one it was made or last confirmed against. Confirming appends a link revision ([ADR 0007](docs/adr/0007-suspect-links.md)).
- **Verification:** results are stored, the status is computed, never stored. Only direct "Verified by" links count, test case downstream. A result is out of date when the test case has a newer version or the requirement was revised after it was recorded ([ADR 0009](docs/adr/0009-verification-tracking.md)).
- **Evidence and reports:** evidence files hang on a result, or on a run and its steps; only images are ever shown, everything else is a download. Baselines freeze verification status. Reports are computed from stored runs and results, nothing new is stored ([ADR 0013](docs/adr/0013-evidence-frozen-status-reports-bulk.md)).
- **Bulk item actions:** `POST /api/sets/:setId/bulk` deletes, moves or sets a field on up to 500 items of one set, all or none, with one audit event and (for edits) one new version per item.
- **Test runs:** step results are append-only and a run's state is computed. Finishing a run appends an ordinary verification result at the version the cycle froze, so the status rule has one source. A Reviewer executes runs assigned to them, an Editor any run ([ADR 0012](docs/adr/0012-test-plans-cycles-and-runs.md)).
- **Reviews:** held on a baseline. Marks are append-only; the state is worked out once, at closing, and stored. An approver signs once with their password. A version that only changes Status is flagged when saved and is skipped by the suspect and verification rules ([ADR 0010](docs/adr/0010-reviews-approvals-and-signatures.md)).
- **ReqIF:** export of a set or baseline; import maps specifications, attributes and relation types onto existing sets, fields and relationship types ([ADR 0011](docs/adr/0011-reqif-import-and-export.md)).
- **Import:** every import (spreadsheet, Word, ReqIF) goes through `POST /api/projects/:projectId/import`. A node it names by `id`, `uid` or `externalId` (kept in `nodes.external_id`) is reused or gets a new version when it differs; `dryRun` previews. Word is exported per set or baseline ([ADR 0015](docs/adr/0015-word-export-import-and-reimport.md)).
- **Trace and impact:** computed from live links on every request, never stored. A path never passes through an item twice ([ADR 0008](docs/adr/0008-trace-view-and-impact-analysis.md)).
- **Ordering:** set trees use fractional indexing or ordered lists, so reordering does not rewrite every row.
- **Permissions:** per project: Viewer reads, Reviewer also comments, Editor also changes items and relationships, Admin also manages members. An instance administrator (`users.is_admin`) is Admin in every project, manages accounts and creates projects. Set-level overrides come later.

## Performance budgets

- A document with 2,000 items opens in under 2 seconds.
- Search returns in under 500 ms.
