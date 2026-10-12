# CLAUDE.md

Open-source, self-hostable requirements management (RM) tool. RM only, not ALM: no task tracking, bug tracking or full test management.

Full plan and phase checklists: [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md). This file is drawn from its sections 4, 5 and 11. If the two disagree, fix both.

**Current phase: Phase 0 (Discovery & Foundations).** The repo is a skeleton. There is no web app, API server or database yet.

## Commands

```bash
npm install          # install all workspaces
npm test             # Vitest, all workspaces, single run
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit over apps/*/src and packages/*/src
```

Not set up yet: lint, dev server, Docker Compose, Playwright, CI. Add each command here when it lands.

## Hard rules

1. **Never hard-delete items.** Soft delete only. Deleted items stay in history and baselines.
2. **History is append-only.** Never update or delete a revision row. A change is a new revision.
3. **Every write creates an audit event.**
4. **Every endpoint checks permissions**, and that check has a test.
5. **UIDs are never reused**, even after deletion.
6. **Everything goes through the API.** The UI uses the same public API that integrations use. No back doors.
7. **Migrations are forward-only** and safe on large tables.
8. **No secrets in the repo. Parameterized queries only. No telemetry by default.**

## How to work

- **Small slices.** One feature per session or branch, taken from the current phase checklist in the outline. Plan first, then implement, then write tests.
- **Domain logic first.** Build versioning, baselines and suspect links as pure, tested modules in `apps/server/src/domain/` before wiring up any API or UI. No database or HTTP imports in that folder.
- **Record decisions.** When a session makes a significant decision, write an ADR in `docs/adr/` as `NNNN-short-title.md`.
- **Update the outline.** Tick checklist items in `docs/PROJECT_OUTLINE.md` when they are done.
- **Stay in scope.** If a feature looks like ALM, integrate with an external tool instead of building it.
- **Boring tech.** Proven, well-documented components that are easy to self-host. Do not add a dependency for a few lines.

## Stack

Proposed, to be confirmed in Phase 0. Rows marked *open* need an ADR before code depends on them.

| Layer | Choice | Status |
|---|---|---|
| Language | TypeScript end-to-end | in use |
| Package manager | npm workspaces | in use |
| Unit tests | Vitest | in use |
| Frontend | React + Vite, TanStack Query, TipTap (ProseMirror) rich-text editor | proposed |
| Backend | Node.js, REST API documented with OpenAPI | Fastify vs NestJS *open* |
| Database | PostgreSQL, JSONB for custom attributes | proposed |
| ORM / migrations | Typed schema and migrations | Drizzle vs Prisma *open* |
| Auth | Local accounts first; OIDC/SAML/LDAP later | proposed |
| File storage | Local disk or S3-compatible (MinIO) | proposed |
| Deployment | Docker image + `docker-compose.yml`, one command to self-host | proposed |
| End-to-end tests | Playwright | proposed |

License: AGPL-3.0-only with a CLA ([ADR 0001](docs/adr/0001-license-agpl-3.0.md)). No `CLA.md` yet; do not merge an outside contribution until it exists.

Also open: project name. Do not publish a package name until it is decided.

## Folder conventions

```
apps/
  web/              React front end (empty)
  server/           API server + background worker
    src/domain/     Pure domain logic: versioning, baselines, suspect links
packages/
  shared/           Types and zod validation schemas shared by web and server
  reqif/            ReqIF parser/serializer, standalone and reusable (empty)
  importers/        CSV/Excel/Word import logic (empty)
docs/
  PROJECT_OUTLINE.md
  adr/              Architecture Decision Records
  user-guide/
deploy/             docker-compose.yml (empty)
e2e/                Playwright tests (empty)
```

- Tests sit next to the code as `*.test.ts`.
- ESM everywhere. Relative imports use the `.js` extension (`./uid.js`).
- A new workspace needs its own `package.json` named `@app/<name>`.

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
| **Document / Specification** | An ordered tree of requirements and headings (e.g. "System Requirements Spec"). Equivalent to a DOORS "module". |
| **Requirement (Item)** | A single requirement with a stable UID (e.g. `SYS-042`), rich-text body and typed attributes |
| **Attribute definition** | A custom field schema (status, priority, verification method, ASIL level…) |
| **Revision** | An immutable snapshot of an item or link at a point in time |
| **Link / Link type** | A typed, directional relationship (e.g. *derives from*, *verifies*, *satisfies*, *refines*) |
| **Baseline** | A named, immutable snapshot of a set of documents at a moment (e.g. "Design Review v1.0") |
| **Suspect link** | A link flagged for review because the item on either end changed since the link was last confirmed |
| **Traceability matrix** | A cross-reference view of links between two documents or levels |
| **Coverage** | Which requirements have, or lack, downstream links (e.g. untested requirements) |
| **External reference** | A link to something outside the tool (Jira issue, Git commit, CI test result) |

## Core data model (sketch)

```
Organization ─< Membership >─ User
Organization ─< Project ─< Document ─< Node (tree: heading | requirement)
Requirement ─< ItemRevision        (append-only: body, attributes JSONB, author, timestamp, change reason)
Project ─< AttributeDefinition     (name, type, allowed values, required?)
Project ─< LinkType                (name, direction labels, allowed source→target documents)
Link ─< LinkRevision               (source item, target item, type, revisions confirmed at, suspect flag)
Project ─< Baseline ─< BaselineEntry   (points to exact ItemRevision / LinkRevision IDs)
Item ─< Comment, Attachment, ExternalReference
Review ─< ReviewItem, Approval, Signature     (Phase 3)
AuditEvent                          (append-only log of every write)
```

## Key design decisions

- **UIDs:** a per-document prefix plus a monotonic counter (`SRS-001`). See `packages/shared/src/uid.ts`.
- **Versioning:** append-only revision tables. The "current" state is the latest revision. Baselines reference revision IDs, so they cost nothing to create and can never drift.
- **Suspect links:** each link records which revisions of its source and target were last confirmed. Any newer revision on either end marks it suspect until someone reviews it.
- **Ordering:** document trees use fractional indexing or ordered lists, so reordering does not rewrite every row.
- **Permissions:** role-based (Admin, Editor, Reviewer, Viewer) per project. Document-level overrides come later.

## Performance budgets

- A document with 2,000 items opens in under 2 seconds.
- Search returns in under 500 ms.
