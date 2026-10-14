# 0008: Trace view and impact analysis

Date: 2026-10-13
Status: Accepted

## Context

The owner asked for a Jama-style Trace view, impact analysis, a coverage summary per set and a CSV export of the trace. `docs/DESIGN.md` placed the Trace view in Phase 2; it is built now, ahead of the remaining Phase 1 items in `STATUS.md`. Relationships have no rules about which sets they may join, so a chain of relationships can come back to where it started.

## Decisions

### Walking is a pure module, and nothing is stored

`apps/server/src/domain/trace.ts` indexes the live links of a project once and walks them in either direction. Trees and coverage are computed on every request from the links that already exist. There is no schema change.

### Two guards, one for each kind of repetition

- **Loop:** a path never passes through the same item twice. Where it would, the item is returned as a leaf marked `loop`. This guard is always on.
- **Repeat:** impact analysis walks to any depth, so an item reached by several routes is expanded only the first time and marked `repeat` afterwards. The tree then holds at most one node per link. The Trace view does not use this guard: its depth is capped at 4 levels each way, and every row has to show its full path.

### Coverage has a target set

"Reaches a test" means: some item downstream, at any depth, is in the target set. The target is chosen on the Trace view and sent as `?target=`. Left out, it is the first set whose item type name contains "test". Item types have no "is verification" flag; adding one would need a migration and an admin screen, and the picker covers the need. Since then the default is the first set whose item type has the role `test` ([ADR 0018](0018-editable-types-and-roles.md)).

Coverage looks at any depth, whatever number of levels the columns show.

### All relationship types are followed

The walk follows every link type in its stored direction, "Related to" included. A filter by type can be added as a query parameter later.

### Two read-only routes

- `GET /api/sets/:setId/trace?up=&down=&target=` returns one row per item with its upstream and downstream trees, whether it has anything downstream and whether it reaches the target, plus the coverage counts for the set.
- `GET /api/items/:itemId/impact` returns the full-depth downstream and upstream trees.

Both need the viewer role. Trees hold item and link ids only; names, states and suspect flags come from the project and links routes the screens already load.

### The CSV mirrors the screen

The export is built in the browser from the same rows, like the List view export. One line per row of the table: the first upstream path sits beside the first downstream path. The item and every item along a path are written on every line, so the file sorts and filters in a spreadsheet.

## Consequences

- A set linked very densely (many routes to the same items within 4 levels) produces a large trace. Rows are not capped yet.
- The trace of a baseline is not available: trees are built from live links only.
