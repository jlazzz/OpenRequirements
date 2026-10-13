# 0007: Suspect links

Date: 2026-10-13
Status: Accepted

## Context

A relationship should be flagged for review when the item on either end changes. Links have stored the revision numbers of both ends since Phase 1, and link rows are never edited. `docs/DESIGN.md` placed suspect links in Phase 2; the owner asked for them now, ahead of the remaining Phase 1 items in `STATUS.md`.

## Decisions

### The flag is computed, never stored

A link is suspect when either end's current revision number is higher than the one the link was last confirmed against. The rule is a pure function in `apps/server/src/domain/suspect.ts`. Nothing has to run when an item is saved, so no background job is needed and the flag cannot drift from the history.

### A confirmation is a link revision

Confirming inserts a row into the append-only `link_revisions` table: link, number, the revisions of both ends, who, when. The "confirmed against" revisions of a link are those of its latest link revision, or the ones on the link row when it has never been confirmed. Links that existed before this change needed no data migration.

### Confirming names the versions that were on screen

`POST /api/projects/:projectId/links/confirm` takes a list of links, each with the revisions of both ends the person was looking at. If either is no longer current the whole request is refused with 409, so nobody confirms a version they have not seen. The request is all or nothing and writes one `link.confirm` audit event per link. The same route serves "Confirm" and "Confirm all for this item". Editors and above may confirm.

### A baseline stores whether each link was suspect

`baseline_links.suspect` is written when the baseline is made. It is stored and not recomputed, because a baseline of one set does not hold the revision of an end that lies in another set. It is null for baselines made before this change: unknown, not "false".

### Backup format version 2

Backups now carry `linkRevisions` and `baselineLinks[].suspect`. Version 1 files still restore: they have no confirmations, and their baselines get a null flag.

## Consequences

- Restoring an old version of an item makes its relationships suspect, because it is a new revision.
- The List view, matrix, Relationships panel and the Suspect links page all read the one links endpoint, which returns every link of the project with its confirmed and current revisions. This carries the same known limit as before (tens of thousands of links).
- Not built: notifications, a "suspect only" filter in List view, suspect differences in baseline compare.
