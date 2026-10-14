# 0017: Child items

Date: 2026-10-14
Status: Accepted

## Context

Roadmap J5 slice 4. Items could sit only under folders and sets. Jama users nest requirements under requirements (a parent requirement and its refinements). `nodes.parent_id` was already an untyped self-reference, so the tree could hold this without a migration.

## Decisions

- **`nodes.parent_id` may point at an item.** No new column or table; baselines already store each node's parent at that moment, backup already stores `parentId`.
- **The rules live in `domain/tree.ts` (`placementError`)** and every write that places a node uses them (create, move, bulk move, import; backup restore checks the same in `backupError`):
  - a child stays in its parent's set;
  - a folder cannot sit under an item: folders group, items hold refinements, and a folder inside an item would make both meanings blur;
  - nothing goes under itself or under something inside it.
- **Deleting an item deletes its children with it**, as for a folder, and restoring brings them back together.
- **Reading view numbers the outline** (1, 1.2, 1.2.1) and sets child items in under their parent. Word export writes child items after their parent. The CSV Folder column names folders only, so a child item is re-imported into its nearest folder.
- **ReqIF import keeps headings as folders.** An object with children still becomes a folder (and an item for its own text), the DOORS convention, so an exported child item comes back as a folder with the parent item in it. Export already writes the nesting.

## Consequences

Every list of "items in a set or folder" (`itemsWithin`) now includes child items, so List view, Trace view, matrix, reviews and baselines show them without change. Drag and drop (slice 5) calls the same move route and gets the same rules.
