# [ProjectName] — Open-Source Requirements Management Tool

> Working name is a placeholder. Check GitHub, npm and domain availability before choosing a real one.

High-level outline of the entire development process, from discovery to a sustainable open-source project. Keep this file in the repo (e.g. `docs/PROJECT_OUTLINE.md`) and update it as decisions are made.

---

## 1. Vision & Positioning

**One-liner:** A modern, self-hostable, open-source requirements management tool that non-developers can use comfortably, with Git-grade versioning and traceability underneath.

**What it is:** A focused requirements management (RM) tool. It covers writing, organizing, reviewing, baselining and tracing requirements.

**What it is not:** A full ALM suite. It does no task tracking or bug tracking. It does plan and execute tests and store their results, to show which requirements are verified ([ADR 0011](adr/0011-test-planning-and-execution-in-scope.md), [ADR 0012](adr/0012-test-plans-cycles-and-runs.md)). It integrates with those tools instead of replacing them.

**Gap it fills:**
- Commercial tools (DOORS, Polarion, Codebeamer, Jama) are powerful but expensive and dated.
- Docs-as-code tools (StrictDoc, Sphinx-Needs, Doorstop) are free but developer-only.
- Tuleap is open source but a broad ALM suite.
- Nothing open offers a focused, friendly, web-based RM tool for systems and quality engineers.

---

## 2. Target Users & Beachhead

**Beachhead market (initial focus):** Small medical device teams (IEC 62304, ISO 14971, FDA 21 CFR Part 11). They're regulated, budget-constrained, and today mostly rely on Excel and Word.

**Later markets:** Aerospace and defense suppliers (DO-178C, ITAR/CMMC, need self-hosting), automotive suppliers (ISO 26262, ASPICE), robotics and hardware startups, and universities.

**Personas:**
| Persona | Needs |
|---|---|
| Systems / requirements engineer | Fast authoring, hierarchy, links, document-style view |
| Quality / regulatory lead | Baselines, approvals, audit trail, trace and coverage reports for auditors |
| Software / test engineer | Link requirements to code, tests and CI results without leaving their tools |
| Admin / IT | Easy self-hosted install, backups, SSO, upgrades |

---

## 3. Guiding Principles

1. **Stay focused: RM, not ALM.** Use integrations to provide ALM-style traceability without building ALM.
2. **Your data is yours.** Lossless import/export via ReqIF, CSV/Excel, and a JSON dump. No lock-in.
3. **Self-hosting comes first.** One `docker compose up` to install. The hosted version comes later.
4. **History is sacred.** Nothing is ever truly overwritten. Every change is an attributable, timestamped revision.
5. **Dogfood.** Manage this project's own requirements in the tool from Phase 1 onward.
6. **Build for non-developers.** No Git or markup knowledge required in the UI.
7. **Boring tech.** Proven, well-documented components that are easy to self-host.

---

## 4. Domain Concepts (Glossary)

| Concept | Meaning |
|---|---|
| **Project** | Top-level container (e.g. one product) |
| **Document / Specification** | An ordered tree of requirements and headings (e.g. "System Requirements Spec"). Equivalent to a DOORS "module". |
| **Requirement (Item)** | A single requirement with a stable UID (e.g. `SYS-042`), rich-text body, and typed attributes |
| **Attribute definition** | A custom field schema (status, priority, verification method, ASIL level…) |
| **Revision** | An immutable snapshot of an item or link at a point in time |
| **Link / Link type** | A typed, directional relationship (e.g. *derives from*, *verifies*, *satisfies*, *refines*) |
| **Baseline** | A named, immutable snapshot of a set of documents at a moment (e.g. "Design Review v1.0") |
| **Suspect link** | A link flagged for review because the item on either end changed since the link was last confirmed |
| **Traceability matrix** | A cross-reference view of links between two documents or levels |
| **Coverage** | Which requirements have, or lack, downstream links (e.g. untested requirements) |
| **External reference** | A link to something outside the tool (Jira issue, Git commit, CI test result) |

---

## 5. Architecture Overview

### 5.1 Proposed stack (to be confirmed in Phase 0)
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript end-to-end | One language for front end and back end, strong typing, good AI-assisted development |
| Frontend | React + Vite, TanStack Query, TipTap (ProseMirror) rich-text editor | Mature, with strong editor support for tables and images |
| Backend | Node.js with Fastify or NestJS, REST API documented with OpenAPI | Simple, well-known, easy to self-host |
| Database | PostgreSQL (JSONB for custom attributes) | Reliable, handles history tables and full-text search |
| ORM / migrations | Drizzle or Prisma | Typed schema and migrations |
| Auth | Local accounts first; OIDC/SAML/LDAP later | Self-hosted friendly |
| File storage | Local disk or S3-compatible (MinIO) | Attachments and images |
| Deployment | Docker image + `docker-compose.yml` | One-command self-hosting |
| Testing | Vitest (unit), Playwright (end-to-end) | Fast, modern |

*Alternative:* a Python (FastAPI) or Go backend if you're more comfortable in those languages. Decide once and record the decision in an ADR (architecture decision record).

### 5.2 System components
- **Web app (SPA):** document view, item editor, trace views, admin.
- **API server:** business logic, permissions, versioning, import/export.
- **Background worker:** imports, exports, report generation, suspect-link propagation, webhooks.
- **Database:** PostgreSQL.
- **Integrations layer (later):** connectors for Jira, GitHub/GitLab, and CI.

### 5.3 Core data model (sketch)
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

### 5.4 Key design decisions
- **UIDs:** a per-document prefix plus a monotonic counter (`SRS-001`). UIDs are never reused, even after deletion.
- **Versioning:** append-only revision tables. The "current" state is the latest revision. Baselines reference revision IDs, so they cost nothing to create and can never drift.
- **Soft delete only.** Deleted items stay in history and baselines.
- **Suspect links:** each link records which revisions of its source and target were last confirmed. Any newer revision on either end marks it suspect until someone reviews it.
- **Ordering:** document trees use fractional indexing or ordered lists so reordering doesn't rewrite every row.
- **Permissions:** role-based (Admin, Editor, Reviewer, Viewer) per project, with document-level overrides added later.
- **Everything through the API.** The UI uses the same public API that integrations use.

---

## 6. Suggested Repository Structure
```
/
├── apps/
│   ├── web/              # React front end
│   └── server/           # API server + worker
├── packages/
│   ├── shared/           # Shared types, validation schemas (zod)
│   ├── reqif/            # ReqIF parser/serializer (standalone, reusable)
│   └── importers/        # CSV/Excel/Word import logic
├── docs/
│   ├── PROJECT_OUTLINE.md
│   ├── adr/              # Architecture Decision Records
│   └── user-guide/
├── deploy/
│   └── docker-compose.yml
├── e2e/                  # Playwright tests
├── CLAUDE.md             # Instructions/conventions for Claude Code
├── LICENSE
├── CONTRIBUTING.md
└── CLA.md
```

---

## 7. Development Phases

Time estimates assume solo, part-time work. Each phase has a goal, a scope, and exit criteria; don't start the next phase until the exit criteria are met.

### Phase 0: Discovery & Foundations (~1 month)
**Goal:** Validate the problem and lock in key decisions before writing product code.

- [ ] Interview 8–10 people in the beachhead (systems engineers, QA/RA leads): current tools, pain points, what auditors ask for
- [ ] Recruit 1–2 design partners willing to try early builds
- [ ] Competitor teardown: run StrictDoc, Tuleap, and a Jama/Polarion trial, and note what's great and what's painful
- [ ] Read the ReqIF spec and DOORS concepts (modules, objects, attributes, links, baselines)
- [ ] Write the tool's own requirements spec (it gets imported in Phase 1)
- [ ] Decide on stack, license, and name; write ADRs
- [x] Set up repo, CI (lint, typecheck, tests), Docker dev environment, `CLAUDE.md`

**Exit criteria:** Documented user problems, at least one design partner, stack/license chosen, empty app deploys via Docker Compose.

---

### Phase 1: MVP, "One person can replace their spreadsheet" (2–3 months)
> Phase 1 scope and the data model were revised on 2026-10-12. See [DESIGN.md](DESIGN.md), which wins where it disagrees with this outline.
**Goal:** A single user can author, organize, link, and export requirements.

- [x] Local user accounts and login
- [x] Projects and documents (create, rename, archive)
- [x] Document tree: headings and requirements, drag-to-reorder, nesting
- [x] Requirement editor: rich text (tables, images), auto-generated UIDs
- [x] Custom attribute definitions (text, number, enum, multi-enum, date, boolean). Editable per project by its admin, 2026-10-14
- [x] Per-item revision history with a diff view
- [x] Link types (configurable) and links between items, including across documents. Types editable per project, 2026-10-14
- [x] Views: document view (reads like a spec), table/grid view with filters, item detail
- [x] Traceability matrix (document A × document B)
- [x] Basic full-text search
- [x] CSV/Excel import (with column mapping) and export
- [x] JSON full-project export/import (backup and portability)
- [x] Docker Compose install with docs
- [x] **Dogfood:** import this project's own requirements spec (`npm run dogfood`)

**Exit criteria:** You manage this project's requirements in it daily; a design partner imports a real spreadsheet successfully.

---

### Phase 2: Team-Ready, "A small team can collaborate" (3–4 months)
**Goal:** Real teams can work together and produce review-ready specs.

- [x] Multi-user: invitations, roles (Admin/Editor/Reviewer/Viewer), project-level permissions
- [x] Comments and mentions on items
- [x] Concurrent-edit safety (optimistic locking, with conflict warnings): merge screen per field, "also editing" ([ADR 0014](adr/0014-https-edit-conflicts-notifications-email.md))
- [x] Baselines: create, browse, compare any two baselines or a baseline vs. current
- [x] Suspect links: automatic flagging and a review queue
- [x] Coverage reports (e.g. requirements with no verifying test, orphan items)
- [x] Impact analysis view (what's downstream of this item)
- [ ] ReqIF import/export (round-trip tested against sample files from DOORS/Polarion). Built and round-trip tested against its own files on 2026-10-13; vendor samples still needed.
- [x] Word (.docx) import: headings → structure, paragraphs → requirements, with a review step ([ADR 0015](adr/0015-word-export-import-and-reimport.md), 2026-10-14)
- [ ] Spec export to PDF and Word with configurable templates. Word export and a printed PDF with cover and page numbers built 2026-10-14; templates are not configurable yet
- [x] Activity feed and notifications (in-app, email) ([ADR 0014](adr/0014-https-edit-conflicts-notifications-email.md))
- [x] Public REST API (OpenAPI documented) and API tokens ([ADR 0016](adr/0016-api-webhooks-references-oidc.md), 2026-10-14). Response bodies are not described yet

**Exit criteria:** A design-partner team of 3+ people runs a real project in it and exports a spec for a design review.

---

### Phase 3: Regulated-Ready, "Survives an audit" (6+ months)
**Goal:** Meet what regulated industries need for compliance.

- [ ] Immutable, exportable audit trail (who changed what, when, why). Tamper-evident hash chain with an admin verify route built ([ADR 0020](adr/0020-part-11-hardening-audit-chain.md)); anchoring and export of anchors built ([ADR 0024](adr/0024-anchored-audit-chain.md))
- [ ] Mandatory change reasons (configurable per project)
- [x] Review and approval workflows (draft → in review → approved), with configurable approvers; participants can be added and removed while a review is open, opening sets Status to In review, and the home page lists "My reviews" ([ADR 0023](adr/0023-review-participants-and-in-review.md))
- [x] Electronic signatures meeting 21 CFR Part 11 expectations (re-authentication at signing, signature manifestation, signed records). Those three are built, and so are password expiry, account lockout and the inactivity timeout, each off unless set ([ADR 0010](adr/0010-reviews-approvals-and-signatures.md), [ADR 0020](adr/0020-part-11-hardening-audit-chain.md))
- [x] Verification tracking: lightweight test case items, verification results, and status per requirement
- [x] Import test results from CI (JUnit XML) and link them to requirements automatically
- [x] CI runs: each upload kept as a run with its results, requirements and unmatched names ([ADR 0022](adr/0022-ci-runs.md))
- [x] Test steps, test plans, cycles and runs with step-by-step execution ([ADR 0012](adr/0012-test-plans-cycles-and-runs.md))
- [x] Code traceability: scan repos for requirement tags in code comments (e.g. `@req SYS-042`) via a CLI or CI step ([ADR 0016](adr/0016-api-webhooks-references-oidc.md))
- [x] Integrations: Jira issue links, GitHub/GitLab issue and commit links (with live status) ([ADR 0016](adr/0016-api-webhooks-references-oidc.md)). Code references link files on a branch, not single commits
- [x] Webhooks for external automation ([ADR 0016](adr/0016-api-webhooks-references-oidc.md))
- [ ] SSO: OIDC and SAML; LDAP. OpenID Connect built 2026-10-14 ([ADR 0016](adr/0016-api-webhooks-references-oidc.md)); SAML and LDAP wait for a request
- [x] Backup/restore tooling and upgrade documentation
- [x] Security hardening: dependency scanning, rate limiting, security headers, a third-party review if possible

**Exit criteria:** A design partner uses it as their system of record for an audited project, or completes a mock audit with it.

---

### Phase 4: Scale & Ecosystem (ongoing)
**Goal:** Compete with incumbents and grow a community.

- [ ] Performance: 100k+ requirements per project, with load tests and indexing
- [ ] DOORS/Polarion migration tooling and guides
- [ ] OSLC support (the integration standard used by enterprise RM/ALM tools)
- [ ] Document-level permissions and field-level locking
- [ ] Requirement reuse across projects (variants and product lines)
- [ ] Optional AI assistance: requirement quality checks (ambiguity, testability), duplicate detection, link suggestions
- [ ] SysML v2 model links (stretch goal)
- [ ] Plugin/extension system
- [ ] Hosted cloud offering
- [x] Validation package / tool qualification kit (IQ/OQ/PQ documentation): validation pack of a release built (`npm run validation-pack`, A2 slice 3); customer IQ/OQ test scripts built (`npm run qualification`, A2 slice 4)

---

## 8. Cross-Cutting Concerns (every phase)

- **Testing:** unit tests for domain logic (versioning, baselines, suspect links); end-to-end tests for core flows; round-trip tests for every import/export format.
- **Performance budgets:** a document with 2,000 items opens in under 2 seconds; search returns in under 500 ms.
- **Security:** no secrets in the repo, parameterized queries, permission checks on every endpoint (tested), audit events on every write.
- **Accessibility:** keyboard-friendly editor and tree, sensible ARIA labels.
- **Documentation:** install guide, user guide, API reference, and ADRs, written as you go.
- **Upgrades:** database migrations must be forward-only and safe on large datasets.
- **Telemetry:** none by default; opt-in only, if ever. Self-hosted users care about this.

---

## 9. Open Source & Business Setup

### Licensing
- **Option A, AGPL-3.0 + CLA:** protects against others reselling it as a hosted service, and lets you offer commercial licenses later. Some enterprises avoid AGPL.
- **Option B, Apache-2.0:** maximum adoption, less protection.
- Decide in Phase 0. If you might ever sell commercial licenses, require a CLA from the first outside contribution.

### Community
- `CONTRIBUTING.md`, code of conduct, issue templates, "good first issue" labels
- Public roadmap (this document, or GitHub Projects)
- Demo instance with sample data; a short video walkthrough

### Free vs. paid boundary (keep in mind; don't build paid features early)
| Free (open source) | Potential paid (later) |
|---|---|
| All core RM: authoring, links, baselines, suspect links, coverage, import/export, API | Hosted cloud version |
| Basic auth and roles | SSO/SAML/LDAP, advanced permissions |
| Basic review workflow | Part 11 e-signatures, advanced approval workflows, audit reports |
| Community support | Support contracts with SLAs |
| — | Validation package / tool qualification kit |
| — | Migration services (e.g. off DOORS) |

**Rule:** Don't charge until real teams are actively using the free version and asking for these things.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope creep toward ALM | Guiding principle #1; integrate instead of building |
| Rich-text and Word import complexity | Use a proven editor (TipTap); keep a human review step on Word imports |
| ReqIF incompatibilities between vendors | Collect real sample files early; round-trip test suite |
| Data-model mistakes are expensive later | Spend real time on the model in Phase 0/1; write ADRs; test versioning heavily |
| Building without users | Design partners from Phase 0; dogfood |
| Enterprises wary of a solo maintainer | Clear docs, a stable release cadence, a support offering, eventually a company entity |
| Burnout | Phase gates, a small scope per release, celebrating shipped milestones |

---

## 11. Working With Claude Code

- **`CLAUDE.md`** at the repo root should contain: the stack, how to run, test and lint, folder conventions, the domain glossary (section 4), and hard rules ("never hard-delete items," "every write creates an audit event," "all endpoints check permissions").
- **Work in small slices.** One feature per session or branch, taken from the current phase checklist. Ask Claude Code to plan first, then implement, then write tests.
- **Domain logic first.** Build and test versioning, baselines, and suspect links as pure, well-tested modules before wiring up UI.
- **Keep ADRs.** When a significant decision is made in a session, have Claude Code record it in `docs/adr/`.
- **Update this outline.** Tick checklist items and adjust phases as you learn.

---

## 12. Decisions to Make Next

1. Project name
2. License (AGPL + CLA vs. Apache-2.0)
3. Backend language/framework (TypeScript recommended)
4. Beachhead confirmation after interviews (medical devices is the working assumption)
5. Hosting for a public demo instance
