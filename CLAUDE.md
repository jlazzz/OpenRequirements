# CLAUDE.md

Open-source, self-hostable requirements management (RM) tool. RM only, not ALM: no task tracking, bug tracking or full test management.

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
```

Before calling work done: `npm run lint && npm run typecheck && npm test`. CI runs the same.

Not set up yet: Playwright, OpenAPI output. Add each command here when it lands.

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
- **Stay in scope.** If a feature looks like ALM, integrate with an external tool instead of building it.
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
| Auth | Local accounts, scrypt hashes, session cookie; OIDC/SAML/LDAP later | in use |
| Spreadsheets | CSV parsed by `packages/importers`; `.xlsx` read in the browser with `read-excel-file` ([ADR 0006](docs/adr/0006-import-backup-and-baselines.md)) | in use |
| File storage | Local disk (`ATTACHMENTS_DIR`, a Docker volume). Images only, type checked by content. S3-compatible later. | in use |
| Deployment | One app image (API + built web app) + Postgres, `deploy/docker-compose.yml` | in use |
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
    src/projects.ts, src/nodes.ts, src/links.ts, src/attachments.ts, src/members.ts, src/comments.ts, src/baselines.ts, src/backup.ts   Feature route files: one per feature, taking `AppContext`
    src/domain/templates.ts  Project templates (item types, fields, sets)
    src/domain/attributes.ts Validates field values against an item type's field definitions
    src/domain/tree.ts       Pure tree logic: descendants, sibling order
    src/domain/roles.ts      Role ranking and @mention matching
    src/domain/backup.ts     Backup file format, its consistency check, and id rewriting for restore
    src/db/         Drizzle schema and client
    drizzle/        Generated SQL migrations. Never edit a committed one.
    src/domain/     Pure domain logic: versioning, baselines, suspect links
packages/
  shared/           Pure code used by both web and server: UID format, word diff, rich-text format and validation, baseline compare
  reqif/            ReqIF parser/serializer, standalone and reusable (empty)
  importers/        CSV reading and writing, and mapping spreadsheet rows to items
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
- Project routes then call `if (!(await access(req, reply, { setId }, "editor"))) return reply;` first. It answers 404 to non-members and 403 when the role is too low. Name path parameters `projectId`, `setId`, `itemId`, `nodeId`, `linkId`, `attachmentId`, `commentId` or `baselineId`: a hook uses those names to refuse non-members before the body is read.
- `audit(...)` looks up the project and a label by itself for items, folders, links and projects. Pass `{ projectId, label }` for anything else that should appear in the activity stream.
- Route params that are IDs are validated as `format: "uuid"` in the route schema.
- UI: use Mantine components and theme before writing custom CSS.
- Every write calls `audit(...)` in the same transaction as the change.
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
| **External reference** | A link to something outside the tool (Jira issue, Git commit, CI test result) |

## Core data model (sketch)

```
User ─< ProjectMember >─ Project   (role; no Organization level yet: one instance is one organization)
Invitation                         (email, token hash, expiry; accepted once)
Project ─< Set ─< Node (tree: folder | item)
Project ─< ItemType                (from the project template; a set has exactly one)
Item ─< Draft                      (one per author; private until committed)
Item ─< ItemRevision               (append-only: body, attributes JSONB, author, timestamp, change reason)
ItemType ─< AttributeDefinition    (name, type, allowed values, required?)
Project ─< LinkType                (name; from the template; no source→target rules)
Link                               (upstream item, downstream item, type, revisions of both ends at creation; immutable, soft-deleted)
LinkRevision                       (Phase 2, with suspect links: re-confirmations of a link)
Project ─< Baseline ─< BaselineEntry   (node, its ItemRevision id, and its parent, position and folder name at that moment)
Baseline ─< BaselineLink               (ids of the links that were live)
Item ─< Comment                    (plain text, mentions resolved to user ids, soft-deleted)
Project ─< Attachment              (uploaded images embedded in rich text)
Item ─< ExternalReference          (later)
Review ─< ReviewItem, Approval, Signature     (Phase 3)
AuditEvent                          (append-only log of every write; project id and a label feed the activity stream)
```

## Key design decisions

- **UIDs:** a per-set prefix plus a monotonic counter (`SRS-001`). See `packages/shared/src/uid.ts`.
- **Versioning:** append-only revision tables. The "current" state is the latest revision. Baselines reference revision IDs, so they cost nothing to create and can never drift.
- **Editing:** inline, auto-saved to a private draft. An explicit "Save version" creates the revision.
- **Suspect links (Phase 2):** each link records which revisions of its source and target were last confirmed. Store those revision IDs from Phase 1 on; flagging comes later.
- **Ordering:** set trees use fractional indexing or ordered lists, so reordering does not rewrite every row.
- **Permissions:** per project: Viewer reads, Reviewer also comments, Editor also changes items and relationships, Admin also manages members. An instance administrator (`users.is_admin`) is Admin in every project, manages accounts and creates projects. Set-level overrides come later.

## Performance budgets

- A document with 2,000 items opens in under 2 seconds.
- Search returns in under 500 ms.
