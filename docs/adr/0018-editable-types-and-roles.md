# 0018: Editable item types, fields, sets and relationship types; roles instead of names

Date: 2026-10-14
Status: Accepted

## Context

Roadmap J5 slice 1. Item types, their fields, sets and relationship types came from the project template and could not change. Two rules found things by name: the test case type (once "an item type whose name contains test", already replaced by `item_types.role` in bundle D) and the relationship type that counts for verification ("Verified by", [ADR 0009](0009-verification-tracking.md)). With renaming allowed, a name rule breaks the moment someone renames.

## Decisions

### Roles mark meaning; names are free

- `item_types.role` is `test` or null: the type's items are test cases (results, steps, runs, the Trace view's default target).
- `link_types.role` is `verifies` or null: links of the type count for verification, test case downstream.
- Both are set by a project admin with a check box. More than one type may carry a role; all of them count.
- The migration sets `verifies` on every existing type named "Verified by", the rule it replaces. A backup older than version 8 gets the same rule on restore.

The "Status" field is still found by its name and type (enum). Renaming it loses state colours and review approval; this slice does not change that.

### Remove is soft

`archivedAt` on item types, fields, sets and relationship types. Nothing is deleted, so old versions, baselines and backups still read.

- **Field:** gone from the item page, List view, exports and imports. Old versions keep its value. A value saved before is carried into new versions unchanged until someone edits it, by one rule in `checkAttributes`: a value equal to the item's current one is kept unchecked.
- **Enum option:** a field's list is replaced as a whole. A value taken out moves to `archivedOptions`; items holding it keep it (same rule), new values may not use it, and a backup check accepts it in old versions. An option's text is the stored value, so renaming an option is removing one and adding another: items keep the old text until edited. Rewriting every item would make one new version per item and flag links suspect, which is worse.
- **Set:** only an empty set (no live items or folders). Its deleted items can no longer be restored. Its UID prefix stays taken, so UIDs are never reused. A set keeps its prefix when renamed: issued UIDs carry it.
- **Item type:** only when no live set holds it.
- **Relationship type:** offered for no new link. Existing links keep it and still count. A project keeps at least one.
- A field's type never changes: stored values would stop fitting.

### Routes and screen

`GET /api/projects/:projectId/types` (viewer) lists what is live. Adding, renaming and removing need the project admin role: `item-types`, `fields`, `sets` and `link-types` routes, path parameters `itemTypeId`, `fieldId`, `linkTypeId` added to the access hook. Live names are unique per project (per type for fields), ignoring case. The screen is "Item types" in the project side bar.

Backup format version 8 carries `archivedAt`, `archivedOptions` and `linkTypes.role`.

## Consequences

- Jama users can shape a project after it is created.
- No reordering of fields, sets or relationship types; no "required" flag; no restore of a removed type, field or set from the screen.
- A removed field's values ride along unseen in new versions. Search still matches them.
