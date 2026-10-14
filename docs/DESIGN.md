# Product Design

Decided with the project owner on 2026-10-12 by questionnaire. Where this file and [PROJECT_OUTLINE.md](PROJECT_OUTLINE.md) disagree, this file wins.

Reference product: **Jama Connect.** Follow its layout and concepts as closely as practical. Do not copy its artwork, icons, wording or branding.

## 1. Structure

```
Project: Infusion Pump
├─ ▤ User Needs            (set, type: User Need)
│   ├─ 📁 Clinical
│   │   ├─ UN-001
│   │   └─ UN-002
│   └─ 📁 Usability
├─ ▤ System Requirements   (set, type: Requirement)
│   ├─ 📁 Power
│   │   └─ SYS-001
│   └─ 📁 Comms
└─ ▤ Verification Tests    (set, type: Test Case)
    └─ VER-001
```

- **Project → Sets → Folders → Items.** This replaces the outline's "Document" concept.
- A **set** holds items of exactly one **item type**. Folders nest inside a set.
- Each item type has its own fields.
- **UIDs** are a per-set prefix plus a counter (`SYS-001`), never reused.

## 2. Screen layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Logo   Projects ▾   Baselines   Admin                 Search   User ▾│
├───────────────┬───────────────────────────────────┬──────────────────┤
│ Explorer      │ System Requirements               │ SYS-002          │
│               │ [List] [Reading]     Filter  + Add│ ──────────────── │
│ ▾ User Needs  │ ┌───────┬──────────────┬────────┐ │ Relationships    │
│   ▸ Clinical  │ │ UID   │ Name         │ Status │ │  ↑ UN-010        │
│ ▾ System Reqs │ │SYS-001│ Supply volt… │ Draft  │ │  ↓ VER-044       │
│   ▸ Power     │ │SYS-002│ Max current  │ Review │ │ Versions (4)     │
│   ▸ Comms     │ │SYS-003│ Battery life │ Draft  │ │ Comments (2)     │
│ ▸ Verif Tests │ └───────┴──────────────┴────────┘ │ Activity         │
└───────────────┴───────────────────────────────────┴──────────────────┘
```

- **Left:** explorer tree of sets, folders and items. Owner feedback, 2026-10-13: it must stay usable with hundreds of items, like Jama's. So rows are compact and on one line, each has an icon for set, folder or item, folders open and close and start closed, and the panel can be dragged wider.
- **Item state.** The enum field named "Status" is an item's state. Every view that shows several items shows it with a fixed colour per state: explorer (dot), List, Reading, matrix, search, baseline.
- **Centre:** the selected set, folder or item.
- **Right:** side panel for the selected item: relationships, versions, comments, activity.

### Views in Phase 1

| View | What it shows |
|---|---|
| **List view** | Table of items, selectable columns, sort and filter. Default. |
| **Reading view** | Items one after another as continuous text, like a document. |
| **Single item view** | One item with all fields, plus the side panel. |
| **Trace view** | One row per item, its upstream items in columns to the left and downstream items to the right. Built after Phase 1 scope was set ([ADR 0008](adr/0008-trace-view-and-impact-analysis.md)). |

## 3. Editing and versions

- **Inline editing.** Click a field and type. No separate edit form.
- **Auto-saved draft.** Typing saves to a draft, so nothing is lost. A draft is private to its author.
- **Explicit commit.** "Save version", with an optional reason, turns the draft into a new revision that everyone sees.
- **Conflicts:** a commit records the revision the draft started from. If someone else committed in between, the second person gets a merge panel: changes to different fields combine by themselves; for each field both changed, they keep theirs or take the other. Others see that someone has a draft of an item, never its content ([ADR 0014](adr/0014-https-edit-conflicts-notifications-email.md)).

### Editor

Bold, italic, lists, headings, links, **tables**, **images** and **equations** (LaTeX-style). Images need attachment storage, and that storage must be covered by the JSON backup.

## 4. Relationships and traceability

- **No relationship rules.** Any item can link to any item, with any link type.
- **Creating a link:** in the side panel, "Add relationship", search by UID or text, choose upstream or downstream. This is the only method in Phase 1.
- **Baselines:** named, frozen snapshot of a set or project, with compare against current.
- **Traceability matrix:** set A down the side, set B across the top.
- **Coverage filter:** find items with no downstream link, e.g. requirements with no test.
- **Direction:** a relationship runs from an upstream item to a downstream item. Coverage means "has at least one downstream relationship".
- **One relationship per pair of items**, in either direction. Both items must be in the same project.
- **Relationship types** come from the project template. Standard has: Related to, Derived from, Verified by.
- **Removing a relationship is a soft delete.** A relationship to a deleted item is hidden.
- **Suspect links:** built ahead of Phase 2 at the owner's request, see [ADR 0007](adr/0007-suspect-links.md). A relationship is suspect when either end got a new version since it was made or last confirmed; an editor confirms it from the item's panel or the project's Suspect links page.

## 5. Team features in Phase 1

- **Accounts by invitation link.** An instance administrator creates a link for an email address and sends it themselves. The link works once and expires after 7 days. No email server is needed.
- **Two levels of permission.**
  - *Instance administrator:* manages accounts and invitations, creates projects, and is Admin in every project.
  - *Project role,* each including the ones before it: **Viewer** reads; **Reviewer** also comments; **Editor** also changes items, folders and relationships; **Admin** also manages the project's members.
- **A project is invisible to people who are not members.** They get "not found", not "forbidden".
- **Comments** on items are plain text. `@Name` mentions a project member; the "@ Mention" button inserts the name. Authors and project admins can delete a comment.
- **Mentions** are shown in the activity stream ("and mentioned you", with a filter). There are no notifications yet.
- **Activity stream** per project: creations, new versions, moves, deletions, relationships, comments and membership changes. Drafts never appear.
- No email notifications. No SMTP setup at install.

## 6. Project setup

- **Templates only.** A new project is created from a fixed template that defines its item types, fields and sets. The default template is generic, named "Standard": User Needs, System Requirements, Verification Tests. Industry-specific templates (e.g. medical device, with Risks) can be added later.
- Types and fields are **not editable on screen** in Phase 1.
- Store types and fields as per-project data anyway, not as code constants, so an admin UI can be added later.

## 7. Install and hosting

- **Target:** one server on a private network (on-premises or a private cloud VM), reached by a small team. Docker Compose.
- **Plain HTTP in Phase 1.**
  Limit: passwords and session cookies cross the network unencrypted. Acceptable only on a trusted test network. HTTPS must be added before any install at a real company.
- Local accounts only. The first run creates the admin account.

## 8. Import and export in Phase 1

- Excel / CSV import with column mapping, and export of any List view.
- JSON full-project backup and restore, including history and attachments.
- Not in Phase 1: Word export, PDF export, ReqIF.
- Reading view has "Print or save as PDF": the browser prints the document without the explorer and toolbars. A designed PDF or Word export stays in Phase 2.
- As built (ADR 0006): import adds new items to the set or folder being viewed; export is CSV; a restore always creates a new project and is for instance administrators.

## 9. Phase 1 scope change

Moved **into** Phase 1 from Phase 2: invitations and roles, comments, activity stream, baselines, coverage filter, concurrent-edit safety.

Added, not in the outline: item types and sets (Jama model), draft-and-commit editing, project templates, equations.

Stays in Phase 2 or later: relationship rules, admin UI for types and fields, email notifications, Word / PDF / ReqIF, HTTPS.

The outline estimated Phase 1 at 2–3 months of solo part-time work. With these additions, expect roughly double.

## 10. Phase 1 milestones

Phase 1 is built as 8 milestones. Each one ends with something the owner can open in a browser and test. Stop for the owner's feedback at the review checkpoints below, and fold that feedback into this file before continuing. Estimates assume solo, part-time work.

| # | Milestone | What the owner can test at the end | Estimate |
|---|---|---|---|
| M0 | **Running skeleton** | `docker compose up` on the server; open it from another machine on the network; first run creates the admin; log in and see an empty project list | 2 weeks |
| M1 | **Structure and items** | Create a project from the Standard template; build sets, folders and items in the explorer; items get UIDs; List view and Single item view with plain-text fields; reorder and soft-delete | 3 weeks |
| M2 | **Editing and versions** | Inline editing with basic formatting; auto-saved draft; "Save version" with a reason; version history with a diff | 3 weeks |
| M3 | **Relationships** | "Add relationship" by search; upstream and downstream in the side panel; traceability matrix; coverage filter | 3 weeks |
| M4 | **Reading and finding** | Reading view; List view column picker, sort, filters and editing cells in place; full-text search; tables, images and equations in the editor | 3 weeks |
| M5 | **Team** | Invite a second user; roles limit what each can do; comments with @mentions; activity stream; two people editing the same item get a conflict prompt | 4 weeks |
| M6 | **Baselines** | Create a baseline of a set or project; browse it; compare it with current | 2 weeks |
| M7 | **Data in and out** | Import a real spreadsheet with column mapping; export a List view to Excel/CSV; JSON backup and restore; import this project's own requirements | 3 weeks |

### Review checkpoints

The owner asked on 2026-10-12 for fewer, larger reviews. From M2 on, milestones are built in bundles with one owner test per bundle:

| Checkpoint | Milestones | What the owner tests |
|---|---|---|
| A | M2 + M3 | Write and format items, drafts, versions; link items; matrix and coverage |
| B | M4 + M5 | Reading view, filters, search, tables and images; a second user, roles, comments, activity |
| C | M6 + M7 | Baselines; spreadsheet import and export; backup and restore |

Inside a bundle, do not stop for review. Make technical choices without asking and record significant ones as ADRs. Stop early only for a product decision the owner must make, or a blocker.

Rules that apply from M0, not from the milestone where they become visible:

- Every endpoint checks permissions. Until M5 there is one role, Admin, but the check exists and is tested.
- Every write creates an audit event. The activity stream in M5 reads from these.
- Items are versioned from M1. M2 adds drafts and the history screen on top.

M1 ships a plain edit form on the Single item view: change fields, then "Save version" appends a revision. A save is refused if someone else saved a newer version first. M2 replaces the form with inline editing and auto-saved drafts; the save endpoint stays.

Within a milestone, build the domain logic and its tests first, then the API, then the screen.

### Verification (built after Phase 1, ADR 0009)

- A test case holds **results**: pass, fail or blocked, with date, person, note, optional image and the version that was run. Results are never edited.
- Every other item shows a **verification status** from the tests linked to it by "Verified by": not covered, not run, passing, failing. It appears in List view, the matrix, the Trace view and the item's side panel.
- A result is **out of date** once the test case or the requirement changes.
- CI sends a JUnit report to the API with a personal access token. Tests are matched to test cases by UID.
- Test run planning and step-by-step execution are now in scope ([ADR 0011](adr/0011-test-planning-and-execution-in-scope.md)); the plan is in [ROADMAP.md](ROADMAP.md), track T.

### Reviews and approvals (built after Phase 1, ADR 0010)

- A review is created from a **baseline** by an Editor or Admin, who picks reviewers and approvers from members with the Reviewer role or higher.
- Reviewers comment per item and mark items reviewed. Approvers approve or reject each item, then **sign once with their password**.
- Closing fixes the state for good: **approved** (every approver signed, every item approved), **rejected** (signed, at least one item rejected) or **closed** (no decision).
- An approved review can set Status = Approved on its items. Items changed since the baseline are skipped.
- A version that only changes Status does not make relationships suspect or results out of date.

## 11. Still open

- ~~Home screen after login~~ Settled (J5 slices 3 and 8): the project list after sign-in; a project opens on a per-set dashboard; Baselines, Reviews, Test plans, Test runs and Reports each have a section page that answers "what needs me" first.
