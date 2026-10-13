# 0006: Spreadsheet import, project backup and baseline storage

Date: 2026-10-13
Status: Accepted

## Context

Bundle C (M6 + M7) adds baselines, spreadsheet import and export, and a full-project backup. Each needed a choice that is hard to change later, because baselines and backup files outlive the code that wrote them.

## Decisions

### Baselines copy the tree position, not just the revision

A baseline entry stores the node, the item revision that was current, and also the node's parent, its position and (for a folder) its name. Folder names and positions are not versioned, so anything not copied when the baseline is made is lost for good. Relationships are stored as link ids, because a link row never changes.

There is no route to change or delete a baseline.

### Spreadsheets are read in the browser; the API takes items

The browser parses the file (`packages/importers` for CSV, the `read-excel-file` package for `.xlsx`), the user maps columns to fields, and the web app posts typed items to `POST /api/sets/:setId/import`.

- The column mapping preview needs no upload and no server-side session.
- The import endpoint is plain JSON, so a script or integration can use it too.
- The server never parses an uploaded office file, which keeps a risky parser off the server.

An import is all or nothing, at most 2,000 items per request, and writes one audit event (`item.import`), not one per item.

Export is CSV only, written with a byte order mark so Excel opens it directly. Cells that start with `=`, `+`, `-` or `@` get a leading quote, so a spreadsheet does not run them as formulas.

### A backup is one JSON file; a restore always makes a new project

`GET /api/projects/:projectId/backup` (project Admin) returns every row of the project, including deleted items, all revisions, baselines, the activity log, and images as base64. Format name `open-requirements-backup`, version 1. Password hashes, sessions, drafts and invitations are never included.

`POST /api/projects/restore` (instance administrator) creates a new project. It never overwrites one.

- **Every id is replaced.** A backup can be restored next to the project it came from. Ids are rewritten wherever they appear, including the field ids that key item attributes and the attachment addresses inside rich text.
- **A backup file is untrusted input.** Its shape is checked by a schema, then `domain/backup.ts` checks that every reference points inside the file, so a restore cannot attach rows to another project. Rich text and field values are validated like any other write. Images are checked by content.
- **People are matched by email.** Someone with no account on this server gets an account that cannot sign in (`NO_PASSWORD`). Inviting that email address lets the person take the account over. This keeps "who wrote what" in the history.

## Consequences

- A backup is built and parsed in memory. Projects with hundreds of megabytes of images need a streamed archive format later (version 2).
- The backup format is now a compatibility promise. A change to it needs a new version number and a reader for version 1.
- Restoring on a different server creates placeholder accounts for unknown people. An administrator should review the Users page after a restore.
- Import cannot update existing items or create folders. Both can be added to the same endpoint later.
